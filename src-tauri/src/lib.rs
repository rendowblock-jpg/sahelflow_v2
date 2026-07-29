#![cfg_attr(debug_assertions, allow(dead_code))]

// SahelFlow Tauri library entry.
//
// Dev vs production:
//   - `tauri dev`: the user runs `bun run dev` manually. This hook does
//     nothing (cfg!(debug_assertions) is true) — preserves hot-reload.
//   - `tauri build` (release): this hook migrates the active database,
//     starts the mandatory Next.js server, proves readiness, and then starts
//     the degradable WhatsApp sidecar.

mod child_containment;
mod migration_coordinator;
mod packaged_auth;
mod packaged_runtime;
mod runtime_protocol;
mod runtime_supervisor;
mod startup_recovery;

use runtime_protocol::RuntimeProtocol;
use runtime_supervisor::{RestartDecision, RuntimeSupervisor};
use std::ffi::OsString;
use std::io::{Error as IoError, ErrorKind};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::{Duration, Instant};

#[tauri::command]
fn get_machine_id() -> String {
    // Get unique Machine ID (on Windows: Win32_ComputerSystemProduct UUID or MachineGuid registry)
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg("(Get-CimInstance Win32_ComputerSystemProduct).UUID")
            .output()
        {
            let uuid = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !uuid.is_empty() && uuid != "00000000-0000-0000-0000-000000000000" {
                return uuid;
            }
        }
        // Registry fallback
        if let Ok(output) = std::process::Command::new("reg")
            .args([
                "query",
                "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
        {
            let out = String::from_utf8_lossy(&output.stdout);
            for line in out.lines() {
                if line.contains("MachineGuid") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(guid) = parts.last() {
                        if !guid.is_empty() {
                            return guid.to_string();
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let out = String::from_utf8_lossy(&output.stdout);
            for line in out.lines() {
                if line.contains("IOPlatformUUID") {
                    let parts: Vec<&str> = line.split('=').collect();
                    if let Some(uuid) = parts.last() {
                        let trimmed = uuid.trim().trim_matches('"');
                        if !trimmed.is_empty() {
                            return trimmed.to_string();
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(id) = std::fs::read_to_string("/etc/machine-id") {
            let trimmed = id.trim().to_string();
            if !trimmed.is_empty() {
                return trimmed;
            }
        }
        if let Ok(id) = std::fs::read_to_string("/var/lib/dbus/machine-id") {
            let trimmed = id.trim().to_string();
            if !trimmed.is_empty() {
                return trimmed;
            }
        }
    }

    // In release builds return no synthetic identity, so licensing can fail closed.
    #[cfg(debug_assertions)]
    return "DEV-MOCK-MACHINE-ID-FALLBACK".to_string();

    #[cfg(not(debug_assertions))]
    return String::new();
}

const SHUTDOWN_IDLE: u8 = 0;
const SHUTDOWN_RUNNING: u8 = 1;
const SHUTDOWN_COMPLETE: u8 = 2;

/// Coordinates one normal-close owner without blocking Tauri's event loop.
#[derive(Default)]
struct ShutdownCoordinator {
    phase: AtomicU8,
}

impl ShutdownCoordinator {
    fn begin(&self) -> bool {
        self.phase
            .compare_exchange(
                SHUTDOWN_IDLE,
                SHUTDOWN_RUNNING,
                Ordering::AcqRel,
                Ordering::Acquire,
            )
            .is_ok()
    }

    fn finish(&self) {
        self.phase.store(SHUTDOWN_COMPLETE, Ordering::Release);
    }

    fn is_finished(&self) -> bool {
        self.phase.load(Ordering::Acquire) == SHUTDOWN_COMPLETE
    }
}

/// Handles to spawned child processes (Next.js server + WhatsApp sidecar)
/// kept in app state so they can be killed on app exit.
struct SpawnedChildren {
    server: Option<child_containment::ContainedChild>,
    sidecar: Option<child_containment::ContainedChild>,
    sidecar_starting: Option<u64>,
    supervisor: RuntimeSupervisor,
}

impl SpawnedChildren {
    fn new() -> Self {
        Self {
            server: None,
            sidecar: None,
            sidecar_starting: None,
            supervisor: RuntimeSupervisor::default(),
        }
    }

    fn kill_all(&mut self) {
        self.supervisor.begin_shutdown();
        self.sidecar_starting = None;
        if let Some(child) = self.server.take() {
            match stop_process_tree(&child, "Next.js server") {
                Ok(()) => eprintln!("[sahelflow] killed Next.js server tree on exit"),
                Err(error) => eprintln!(
                    "[sahelflow] CRITICAL: Next.js server tree did not stop cleanly on exit: {error}"
                ),
            }
        }
        if let Some(child) = self.sidecar.take() {
            match stop_process_tree(&child, "WhatsApp sidecar") {
                Ok(()) => eprintln!("[sahelflow] killed WhatsApp sidecar tree on exit"),
                Err(error) => eprintln!(
                    "[sahelflow] CRITICAL: WhatsApp sidecar tree did not stop cleanly on exit: {error}"
                ),
            }
        }
    }
}

/// Sidecar respawn backoff state. The attempt counter resets when the sidecar
/// ran successfully for more than 60 seconds before crashing.
#[derive(Default)]
struct SidecarRespawnState {
    generation: u64,
    attempts: u8,
    last_spawn: Option<Instant>,
}

impl SidecarRespawnState {
    fn register_spawn(&mut self, generation: u64) {
        if self.generation != generation {
            self.generation = generation;
            self.attempts = 0;
        }
        self.last_spawn = Some(Instant::now());
    }

    fn next_attempt(&mut self, generation: u64) -> Option<(u64, u8)> {
        if self.generation != generation {
            return None;
        }
        let alive = self.last_spawn?.elapsed().as_secs();
        if alive >= 60 {
            self.attempts = 0;
        }
        self.attempts = self.attempts.saturating_add(1);
        Some((alive, self.attempts))
    }
}

struct SpawnedRuntime {
    protocol: RuntimeProtocol,
    generation: u64,
}

struct PreparedRuntime {
    server_js: PathBuf,
    runtime_path: String,
}

const SIDECAR_NAME: &str = "sahelflow-whatsapp";
const PROCESS_TREE_STOP_TIMEOUT: Duration = Duration::from_secs(10);
const MANDATORY_RUNTIME_READY_TIMEOUT: Duration = Duration::from_secs(90);
const RUNTIME_STDERR_CLASSIFICATIONS: &[(&str, &str)] = &[
    ("SF_NODE_ENTRYPOINT_MISSING", "node-entrypoint-missing"),
    ("SF_NODE_ENTRYPOINT_INVALID", "node-entrypoint-invalid"),
    (
        "PRISMACLIENTINITIALIZATIONERROR",
        "prisma-initialization-failed",
    ),
    ("ERR_DLOPEN_FAILED", "native-module-load-failed"),
    ("MODULE_NOT_FOUND", "module-not-found"),
    ("EACCES", "access-denied"),
    ("EPERM", "operation-not-permitted"),
    ("ENOENT", "file-not-found"),
    ("EISDIR", "path-is-directory"),
];
const NODE_ENTRYPOINT_ENV: &str = "SF_NODE_ENTRYPOINT";
const NODE_ENTRYPOINT_BOOTSTRAP: &str = r#"(entry=>{if(!entry)throw(Error('SF_NODE_ENTRYPOINT_missing'));if(entry.length<3||entry[1]!==':'||entry[2]!=='/')throw(Error('SF_NODE_ENTRYPOINT_invalid'));process.argv[1]=entry;require(entry)})(process.env.SF_NODE_ENTRYPOINT)"#;

fn node_entrypoint_environment_value(path: &Path) -> Result<String, IoError> {
    let raw = path.to_str().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidData,
            "the installed Node entrypoint is not valid Unicode",
        )
    })?;

    #[cfg(windows)]
    {
        // Tauri may return an MSI resource path in Win32 verbatim form
        // (`\\?\C:\...`). Node's CommonJS realpath resolver does not accept
        // that namespace reliably. Keep the already validated protected file,
        // but transport it as an ordinary absolute drive path with separators
        // that do not cross another Windows escaping boundary.
        let conventional = raw.strip_prefix(r"\\?\").unwrap_or(raw);
        let normalized = conventional.replace('\\', "/");
        let bytes = normalized.as_bytes();
        if bytes.len() < 3
            || !bytes[0].is_ascii_alphabetic()
            || bytes[1] != b':'
            || bytes[2] != b'/'
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "the installed Node entrypoint is not an absolute local drive path",
            ));
        }
        Ok(normalized)
    }

    #[cfg(not(windows))]
    {
        if !path.is_absolute() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "the installed Node entrypoint is not absolute",
            ));
        }
        Ok(raw.to_owned())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                if window.is_visible().unwrap_or(false) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_stronghold::Builder::new(|password: &str| {
                use std::collections::hash_map::DefaultHasher;
                use std::hash::{Hash, Hasher};
                let mut hasher = DefaultHasher::new();
                password.hash(&mut hasher);
                hasher.finish().to_le_bytes().to_vec()
            })
            .build(),
        )
        .invoke_handler(tauri::generate_handler![get_machine_id])
        .on_window_event(|_window, _event| {
            #[cfg(not(debug_assertions))]
            if _window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = _event {
                    // Keep the WebView and event loop alive while the contained
                    // trees stop off-thread. Repeated close requests share the
                    // same coordinator and cannot start competing shutdowns.
                    api.prevent_close();
                    begin_normal_close(_window.app_handle().clone());
                }
            }
        })
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                let app_data_dir = app.path().app_data_dir()?;
                app.manage(std::sync::Mutex::new(SpawnedChildren::new()));
                app.manage(std::sync::Mutex::new(SidecarRespawnState::default()));
                app.manage(ShutdownCoordinator::default());
                let app_handle = app.handle().clone();
                startup_recovery::reset_startup_trace(&app_data_dir);
                startup_recovery::record_startup_stage(
                    &app_data_dir,
                    "workspace-window-pending",
                    None,
                );

                // Migration, runtime-tree verification and service startup can
                // take materially longer on HDD systems. Keep them off Tauri's
                // event loop while the main window remains non-visible until
                // the authenticated workspace has hydrated.
                std::thread::spawn(move || {
                    let resource_dir = match app_handle.path().resource_dir() {
                        Ok(path) => path,
                        Err(error) => {
                            let detail = format!("the packaged resource directory is unavailable: {error}");
                            let _ = startup_recovery::show_blocked(
                                &app_handle,
                                "SF-RUNTIME-STARTUP-BLOCKED",
                                &detail,
                            );
                            return;
                        }
                    };

                    // Validate the registry and migrate every registered shop
                    // before any business server can observe a database.
                    runtime_protocol::remove_manifest(&app_data_dir);
                    startup_recovery::record_startup_stage(
                        &app_data_dir,
                        "migration-started",
                        None,
                    );
                    let authority = match migration_coordinator::prepare_installation(
                        &app_data_dir,
                        &resource_dir,
                    ) {
                        Ok(authority) => authority,
                        Err(error) => {
                            let detail = error.to_string();
                            eprintln!("[sahelflow] FATAL: all-shop migration blocked: {detail}");
                            let _ = startup_recovery::show_blocked(
                                &app_handle,
                                "SF-MIGRATION-BLOCKED",
                                &detail,
                            );
                            return;
                        }
                    };
                    startup_recovery::record_startup_stage(
                        &app_data_dir,
                        "migration-complete",
                        None,
                    );
                    if !app_handle.manage(std::sync::Mutex::new(authority)) {
                        let detail = "the desktop could not register active shop authority";
                        let _ = startup_recovery::show_blocked(
                            &app_handle,
                            "SF-RUNTIME-STARTUP-BLOCKED",
                            detail,
                        );
                        return;
                    }

                    let runtime = match spawn_initial_services(&app_handle) {
                        Ok(runtime) => runtime,
                        Err(error) => {
                            let detail = error.to_string();
                            eprintln!(
                                "[sahelflow] FATAL: mandatory local service startup failed: {detail}"
                            );
                            let _ = startup_recovery::show_blocked(
                                &app_handle,
                                "SF-RUNTIME-STARTUP-BLOCKED",
                                &detail,
                            );
                            return;
                        }
                    };

                    if let Err(error) = startup_recovery::show_ready(
                        &app_handle,
                        &runtime.protocol.bootstrap_url(),
                    ) {
                        if let Some(state) =
                            app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>()
                        {
                            if let Ok(mut children) = state.lock() {
                                children.kill_all();
                            }
                        }
                        runtime_protocol::remove_manifest(&app_data_dir);
                        let detail = format!("the verified workspace could not be opened: {error}");
                        let _ = startup_recovery::show_blocked(
                            &app_handle,
                            "SF-WINDOW-NAVIGATION-BLOCKED",
                            &detail,
                        );
                    }
                });
            }

            #[cfg(debug_assertions)]
            startup_recovery::show_ready(app.handle(), "http://localhost:3000")?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building SahelFlow application")
        .run(|_app_handle, _event| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                let shutdown = matches!(
                    _event,
                    tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
                );
                if shutdown {
                    let normal_close_finished = _app_handle
                        .try_state::<ShutdownCoordinator>()
                        .is_some_and(|state| state.is_finished());
                    if !normal_close_finished {
                        if let Some(state) =
                            _app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>()
                        {
                            if let Ok(mut children) = state.lock() {
                                children.kill_all();
                            }
                        }
                    }
                    if let Ok(app_data_dir) = _app_handle.path().app_data_dir() {
                        runtime_protocol::remove_manifest(&app_data_dir);
                    }
                }
            }
        });
}

#[cfg(not(debug_assertions))]
fn begin_normal_close(app: tauri::AppHandle) {
    use tauri::Manager;

    let Some(coordinator) = app.try_state::<ShutdownCoordinator>() else {
        eprintln!("[sahelflow] CRITICAL: shutdown coordinator is unavailable");
        app.exit(1);
        return;
    };
    if !coordinator.begin() {
        return;
    }

    std::thread::spawn(move || {
        if let Some(state) = app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
            if let Ok(mut children) = state.lock() {
                children.kill_all();
            }
        }
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            runtime_protocol::remove_manifest(&app_data_dir);
        }
        if let Some(coordinator) = app.try_state::<ShutdownCoordinator>() {
            coordinator.finish();
        }

        // AppHandle::exit drives Tauri's ExitRequested/Exit lifecycle. App::run
        // owns final framework cleanup and process exit after the off-thread
        // child teardown has completed.
        app.exit(0);
    });
}

/// Environment passed only to the mandatory application server.
fn server_env(
    app: &tauri::AppHandle,
    runtime: &RuntimeProtocol,
    authority: &migration_coordinator::ActiveShopAuthority,
    auth: &packaged_auth::PackagedAuth,
) -> Result<Vec<(String, String)>, Box<dyn std::error::Error>> {
    use tauri::Manager;
    let app_data_dir = app.path().app_data_dir()?;
    let compile_cache_dir = app
        .path()
        .app_local_data_dir()?
        .join("node-compile-cache")
        .join(env!("CARGO_PKG_VERSION"));
    let token_file = app_data_dir.join("sidecar-token");
    let resource_dir = app.path().resource_dir()?;

    let mut environment = vec![
        (
            "DATABASE_URL".to_string(),
            format!("file:{}", authority.database_path.display()),
        ),
        (
            "SF_DATA_DIR".to_string(),
            app_data_dir.to_string_lossy().into_owned(),
        ),
        (
            "SIDECAR_TOKEN".to_string(),
            runtime.sidecar_token()…5431 tokens truncated…generation, attempt) {
            Ok(runtime) => {
                if let Err(error) =
                    startup_recovery::show_ready(&app_handle, &runtime.protocol.bootstrap_url())
                {
                    let detail = format!(
                        "Automatic runtime restart attempt {attempt}/3 became ready but navigation failed: {error}"
                    );
                    eprintln!("[sahelflow] {detail}");
                    if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
                        runtime_protocol::remove_manifest(&app_data_dir);
                    }
                    match fail_runtime_generation(&app_handle, runtime.generation) {
                        Ok(decision) => handle_server_restart_decision(
                            &app_handle,
                            &detail,
                            decision,
                            runtime.generation,
                        ),
                        Err(error) => {
                            show_containment_blocked(&app_handle, &format!("{detail}: {error}"))
                        }
                    }
                }
            }
            Err(error) => {
                let detail =
                    format!("Automatic runtime restart attempt {attempt}/3 failed: {error}");
                eprintln!("[sahelflow] {detail}");
                let (generation, decision, containment_blocked) = app_handle
                    .try_state::<std::sync::Mutex<SpawnedChildren>>()
                    .and_then(|state| {
                        state.lock().ok().map(|mut children| {
                            let generation = children.supervisor.current_generation();
                            let decision = if children.server.is_none() {
                                children.supervisor.record_restart_failure(generation)
                            } else {
                                RestartDecision::Ignore
                            };
                            (
                                generation,
                                decision,
                                decision == RestartDecision::Ignore
                                    && children.supervisor.in_safe_mode(),
                            )
                        })
                    })
                    .unwrap_or((expected_generation, RestartDecision::Ignore, false));
                if containment_blocked {
                    show_containment_blocked(&app_handle, &detail);
                } else {
                    handle_server_restart_decision(&app_handle, &detail, decision, generation);
                }
            }
        }
    });
}

fn fail_runtime_generation(
    app_handle: &tauri::AppHandle,
    generation: u64,
) -> Result<RestartDecision, IoError> {
    use tauri::Manager;
    let processes = app_handle
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .and_then(|state| {
            state.lock().ok().and_then(|mut children| {
                if children.supervisor.current_generation() != generation
                    || children.server.is_none()
                {
                    return None;
                }
                children.sidecar_starting = None;
                Some((children.server.take(), children.sidecar.take()))
            })
        });
    let Some((server, sidecar)) = processes else {
        return Ok(RestartDecision::Ignore);
    };

    let stop_result = server
        .as_ref()
        .map(|child| stop_process_tree(child, "failed runtime server"))
        .transpose()
        .and_then(|_| {
            sidecar
                .as_ref()
                .map(|child| stop_process_tree(child, "failed runtime sidecar"))
                .transpose()
        });
    if let Err(error) = stop_result {
        if let Some(state) = app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
            if let Ok(mut children) = state.lock() {
                children.supervisor.enter_safe_mode(generation);
            }
        }
        return Err(error);
    }

    Ok(app_handle
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .and_then(|state| {
            state
                .lock()
                .ok()
                .map(|mut children| children.supervisor.record_restart_failure(generation))
        })
        .unwrap_or(RestartDecision::Ignore))
}

fn spawn_sidecar_and_watch(
    app_handle: tauri::AppHandle,
    env: Vec<(String, String)>,
    generation: u64,
) -> Result<(), IoError> {
    use tauri::Manager;

    if !claim_sidecar_spawn(&app_handle, generation) {
        return Ok(());
    }
    let sidecar_path = match bundled_sidecar() {
        Ok(path) => path,
        Err(error) => {
            eprintln!(
                "[sahelflow] WhatsApp sidecar binary not found; inbox remains degraded: {error}"
            );
            release_sidecar_spawn(&app_handle, generation);
            return Ok(());
        }
    };
    let child = match child_containment::ContainedChild::spawn(
        &sidecar_path,
        &[],
        &process_environment(&env),
    ) {
        Ok(child) => child,
        Err(error) => {
            if error.containment_uncertain() {
                let detail = format!(
                    "the WhatsApp sidecar failed during contained creation and cleanup could not be proven: {error}"
                );
                enter_runtime_safe_mode(&app_handle, generation);
                if let Err(teardown) = fail_runtime_generation(&app_handle, generation) {
                    show_containment_blocked(
                        &app_handle,
                        &format!("{detail}; mandatory runtime teardown also failed: {teardown}"),
                    );
                    return Err(IoError::other(format!("{detail}; {teardown}")));
                }
                show_containment_blocked(&app_handle, &detail);
                return Err(IoError::other(detail));
            }
            release_sidecar_spawn(&app_handle, generation);
            eprintln!("[sahelflow] failed to spawn contained WhatsApp sidecar: {error}");
            return Ok(());
        }
    };

    let port = env
        .iter()
        .find_map(|(key, value)| (key == "SIDECAR_PORT").then_some(value.as_str()))
        .unwrap_or("dynamic");
    let sidecar_pid = child.pid();
    eprintln!("[sahelflow] contained WhatsApp sidecar spawned on port {port}");
    let mut registered = false;
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            if children.supervisor.current_generation() == generation
                && children.supervisor.runtime_ready()
                && children.supervisor.allows_restart()
                && children.sidecar_starting == Some(generation)
                && children.sidecar.is_none()
            {
                children.sidecar = Some(child.clone());
                registered = true;
            }
            if children.sidecar_starting == Some(generation) {
                children.sidecar_starting = None;
            }
        }
    }
    if !registered {
        if let Err(error) = stop_process_tree(&child, "unregistered WhatsApp sidecar") {
            let detail = format!("rejected WhatsApp sidecar tree did not stop: {error}");
            enter_runtime_safe_mode(&app_handle, generation);
            let _ = fail_runtime_generation(&app_handle, generation);
            show_containment_blocked(&app_handle, &detail);
            return Err(IoError::other(detail));
        }
        return Ok(());
    }
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SidecarRespawnState>>() {
        if let Ok(mut respawn) = state.lock() {
            respawn.register_spawn(generation);
        }
    }

    let env_for_respawn = env.clone();
    let app_handle_for_watch = app_handle.clone();
    std::thread::spawn(move || {
        let exit = child.wait_for_exit_and_close_tree(PROCESS_TREE_STOP_TIMEOUT);
        match &exit {
            Ok(payload) => eprintln!("[whatsapp] terminated with exit code {}", payload.code),
            Err(error) => eprintln!(
                "[whatsapp] process tree could not be proven stopped after termination: {error}"
            ),
        }
        let was_current = clear_sidecar_handle(&app_handle_for_watch, generation, sidecar_pid);
        if was_current && exit.is_ok() {
            schedule_sidecar_respawn(
                app_handle_for_watch.clone(),
                env_for_respawn.clone(),
                generation,
            );
        }
    });
    Ok(())
}

fn claim_sidecar_spawn(app_handle: &tauri::AppHandle, generation: u64) -> bool {
    use tauri::Manager;
    app_handle
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .and_then(|state| {
            state.lock().ok().map(|mut children| {
                let allowed = children.supervisor.current_generation() == generation
                    && children.supervisor.runtime_ready()
                    && children.supervisor.allows_restart()
                    && children.sidecar.is_none()
                    && children.sidecar_starting.is_none();
                if allowed {
                    children.sidecar_starting = Some(generation);
                }
                allowed
            })
        })
        .unwrap_or(false)
}

fn release_sidecar_spawn(app_handle: &tauri::AppHandle, generation: u64) {
    use tauri::Manager;
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            if children.sidecar_starting == Some(generation) {
                children.sidecar_starting = None;
            }
        }
    }
}

fn clear_sidecar_handle(app_handle: &tauri::AppHandle, generation: u64, sidecar_pid: u32) -> bool {
    use tauri::Manager;
    app_handle
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .and_then(|state| {
            state.lock().ok().map(|mut children| {
                if children.supervisor.current_generation() != generation
                    || !children
                        .sidecar
                        .as_ref()
                        .is_some_and(|child| child.pid() == sidecar_pid)
                {
                    return false;
                }
                children.sidecar.take();
                true
            })
        })
        .unwrap_or(false)
}

fn schedule_sidecar_respawn(
    app_handle: tauri::AppHandle,
    env: Vec<(String, String)>,
    generation: u64,
) {
    use tauri::Manager;

    const MAX_ATTEMPTS: u8 = 3;
    let runtime_allows_respawn = app_handle
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .and_then(|state| {
            state.lock().ok().map(|children| {
                children.supervisor.current_generation() == generation
                    && children.supervisor.runtime_ready()
                    && children.supervisor.allows_restart()
                    && children.sidecar.is_none()
                    && children.sidecar_starting.is_none()
            })
        })
        .unwrap_or(false);
    if !runtime_allows_respawn {
        return;
    }

    let Some((alive_seconds, next_attempt)) =
        (if let Some(state) = app_handle.try_state::<std::sync::Mutex<SidecarRespawnState>>() {
            if let Ok(mut respawn) = state.lock() {
                respawn.next_attempt(generation)
            } else {
                None
            }
        } else {
            None
        })
    else {
        return;
    };

    if next_attempt > MAX_ATTEMPTS {
        eprintln!(
            "[sahelflow] CRITICAL: WhatsApp sidecar exceeded its restart budget; inbox remains offline until restart"
        );
        return;
    }

    let delay_seconds = match next_attempt {
        1 => 5,
        2 => 15,
        _ => 60,
    };
    eprintln!(
        "[sahelflow] WhatsApp sidecar crashed after {alive_seconds}s; respawning in {delay_seconds}s (attempt {next_attempt}/{MAX_ATTEMPTS})"
    );

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(delay_seconds));
        if let Err(error) = spawn_sidecar_and_watch(app_handle.clone(), env, generation) {
            show_containment_blocked(&app_handle, &error.to_string());
        }
    });
}

fn bundled_node(resource_dir: &std::path::Path) -> Option<String> {
    let executable = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };
    let candidate = resource_dir.join("runtime").join(executable);
    candidate
        .exists()
        .then(|| candidate.to_string_lossy().into_owned())
}

fn bundled_sidecar() -> Result<PathBuf, IoError> {
    let executable = if cfg!(target_os = "windows") {
        format!("{SIDECAR_NAME}.exe")
    } else {
        SIDECAR_NAME.to_string()
    };
    let current = std::env::current_exe()?;
    let parent = current
        .parent()
        .ok_or_else(|| IoError::other("desktop executable has no parent directory"))?;
    let candidate = parent.join(executable);
    if !candidate.is_file() {
        return Err(IoError::new(
            ErrorKind::NotFound,
            format!("sidecar is missing at {}", candidate.display()),
        ));
    }
    Ok(candidate)
}

fn process_environment(values: &[(String, String)]) -> Vec<(OsString, OsString)> {
    let mut environment = windows_safe_parent_environment();
    environment.extend(
        values
            .iter()
            .map(|(key, value)| (OsString::from(key), OsString::from(value))),
    );
    environment
}

fn summarize_runtime_stderr(raw: &str) -> Option<String> {
    if !raw
        .chars()
        .any(|character| character != '\0' && !character.is_whitespace())
    {
        return None;
    }

    let uppercase = raw.to_ascii_uppercase();
    let categories = RUNTIME_STDERR_CLASSIFICATIONS
        .iter()
        .filter_map(|(signature, category)| uppercase.contains(signature).then_some(*category))
        .collect::<Vec<_>>();

    if categories.is_empty() {
        Some("runtime process emitted stderr before readiness; raw output suppressed".to_string())
    } else {
        Some(format!(
            "runtime process emitted stderr before readiness (categories: {}); raw output suppressed",
            categories.join(", ")
        ))
    }
}

fn stop_process_tree(
    child: &child_containment::ContainedChild,
    label: &str,
) -> Result<(), IoError> {
    child
        .terminate_tree_and_wait(PROCESS_TREE_STOP_TIMEOUT)
        .map_err(|error| IoError::other(format!("{label} tree termination failed: {error}")))
}

fn stop_runtime_launch(
    app: &tauri::AppHandle,
    generation: u64,
    child: &child_containment::ContainedChild,
    label: &str,
) -> Result<(), IoError> {
    use tauri::Manager;
    if let Err(error) = stop_process_tree(child, label) {
        if let Some(state) = app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
            if let Ok(mut children) = state.lock() {
                children.supervisor.enter_safe_mode(generation);
            }
        }
        return Err(error);
    }
    Ok(())
}

fn enter_runtime_safe_mode(app: &tauri::AppHandle, generation: u64) {
    use tauri::Manager;
    if let Some(state) = app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            if children.sidecar_starting == Some(generation) {
                children.sidecar_starting = None;
            }
            children.supervisor.enter_safe_mode(generation);
        }
    }
}

/// Preserve only OS paths required by Windows process/runtime APIs. Product
/// configuration and credentials must always be injected explicitly above.
fn windows_safe_parent_environment() -> Vec<(std::ffi::OsString, std::ffi::OsString)> {
    std::env::vars_os()
        .filter(|(key, _)| is_windows_safe_parent_environment_key(key))
        .collect()
}

fn is_windows_safe_parent_environment_key(key: &std::ffi::OsStr) -> bool {
    let key = key.to_string_lossy();
    ["SystemRoot", "WINDIR", "TEMP", "TMP"]
        .iter()
        .any(|allowed| key.eq_ignore_ascii_case(allowed))
}

#[cfg(test)]
mod child_environment_tests {
    use super::{
        is_windows_safe_parent_environment_key, node_entrypoint_environment_value,
        summarize_runtime_stderr, ShutdownCoordinator,
    };
    use std::ffi::OsStr;
    use std::path::Path;

    #[cfg(windows)]
    #[test]
    fn node_entrypoint_uses_a_conventional_absolute_drive_path() {
        let normalized = node_entrypoint_environment_value(Path::new(
            r"\\?\C:\Program Files\SahelFlow\standalone\server.js",
        ))
        .expect("normalize installed entrypoint");
        assert_eq!(
            normalized,
            "C:/Program Files/SahelFlow/standalone/server.js"
        );
    }

    #[cfg(windows)]
    #[test]
    fn node_entrypoint_rejects_non_local_or_drive_relative_paths() {
        for invalid in [
            r"\\server\share\server.js",
            r"\\?\UNC\server\share\server.js",
            r"C:standalone\server.js",
            r"standalone\server.js",
        ] {
            let error = node_entrypoint_environment_value(Path::new(invalid))
                .expect_err("reject unsupported Node entrypoint authority");
            assert!(error.to_string().contains("absolute local drive path"));
        }
    }

    #[test]
    fn child_environment_allowlist_excludes_ambient_credentials_and_configuration() {
        assert!(is_windows_safe_parent_environment_key(OsStr::new(
            "SystemRoot"
        )));
        assert!(is_windows_safe_parent_environment_key(OsStr::new("temp")));
        assert!(!is_windows_safe_parent_environment_key(OsStr::new(
            "AUTH_SECRET"
        )));
        assert!(!is_windows_safe_parent_environment_key(OsStr::new(
            "DATABASE_URL"
        )));
        assert!(!is_windows_safe_parent_environment_key(OsStr::new("PATH")));
    }

    #[test]
    fn runtime_stderr_summary_exposes_only_allowlisted_categories() {
        let raw = "PrismaClientInitializationError: SELECT * FROM orders WHERE seller = \
                   'private-seller'; MODULE_NOT_FOUND at C:\\seller\\shop.db; EISDIR; \
                   runtime-token-that-must-never-escape";
        let summary = summarize_runtime_stderr(raw).expect("summarize stderr");

        assert!(summary.contains("prisma-initialization-failed"));
        assert!(summary.contains("module-not-found"));
        assert!(summary.contains("path-is-directory"));
        assert!(summary.contains("raw output suppressed"));
        for private_value in [
            "SELECT",
            "orders",
            "private-seller",
            "C:\\seller\\shop.db",
            "runtime-token-that-must-never-escape",
        ] {
            assert!(!summary.contains(private_value));
        }
    }

    #[test]
    fn unclassified_runtime_stderr_is_suppressed_without_echoing_child_text() {
        let private_message = "seller Amira owes 12000 DZD";
        let summary = summarize_runtime_stderr(private_message).expect("summarize stderr");

        assert_eq!(
            summary,
            "runtime process emitted stderr before readiness; raw output suppressed"
        );
        assert!(!summary.contains(private_message));
    }

    #[test]
    fn empty_runtime_stderr_has_no_summary() {
        assert_eq!(summarize_runtime_stderr(" \r\n\t\0 "), None);
    }

    #[test]
    fn normal_close_has_one_shutdown_owner_and_a_visible_completion_state() {
        let coordinator = ShutdownCoordinator::default();

        assert!(coordinator.begin());
        assert!(!coordinator.begin());
        assert!(!coordinator.is_finished());

        coordinator.finish();
        assert!(coordinator.is_finished());
        assert!(!coordinator.begin());
    }
}
