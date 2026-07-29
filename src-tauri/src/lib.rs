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
use std::io::{Error as IoError, ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU8, Ordering};
use std::time::{Duration, Instant};
#[cfg(not(debug_assertions))]
use tauri::Manager;

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
    shutdown_authority: Option<RuntimeShutdownAuthority>,
    supervisor: RuntimeSupervisor,
}

impl SpawnedChildren {
    fn new() -> Self {
        Self {
            server: None,
            sidecar: None,
            sidecar_starting: None,
            shutdown_authority: None,
            supervisor: RuntimeSupervisor::default(),
        }
    }

    fn kill_all(&mut self) {
        self.supervisor.begin_shutdown();
        self.sidecar_starting = None;
        if self.server.is_some() {
            if let Some(authority) = self.shutdown_authority.take() {
                if let Err(error) = authority.flush_compile_cache() {
                    eprintln!(
                        "[sahelflow] compile cache could not be flushed before shutdown: {error}"
                    );
                }
            }
        }
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
                    // Remove the workspace from interaction synchronously so a
                    // seller cannot begin another mutation while the shutdown
                    // worker flushes the cache and stops the contained trees.
                    let _ = _window.hide();
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

                    remember_runtime_shutdown_authority(&app_handle, &runtime.protocol);
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

fn remember_runtime_shutdown_authority(app: &tauri::AppHandle, protocol: &RuntimeProtocol) {
    use tauri::Manager;

    if let Some(state) = app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            children.shutdown_authority = Some(RuntimeShutdownAuthority::from_protocol(protocol));
        }
    }
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
            runtime.sidecar_token().to_string(),
        ),
        (
            "SIDECAR_TOKEN_FILE".to_string(),
            token_file.to_string_lossy().into_owned(),
        ),
        (
            "PRISMA_MIGRATIONS_DIR".to_string(),
            resource_dir
                .join("prisma/migrations")
                .to_string_lossy()
                .into_owned(),
        ),
        (
            "PRISMA_QUERY_ENGINE_LIBRARY".to_string(),
            resource_dir
                .join("runtime/query_engine-windows.dll.node")
                .to_string_lossy()
                .into_owned(),
        ),
        ("HOSTNAME".to_string(), "127.0.0.1".to_string()),
        ("PORT".to_string(), runtime.app_port().to_string()),
        ("SF_APP_URL".to_string(), runtime.app_url()),
        (
            "SF_RUNTIME_INSTANCE_ID".to_string(),
            runtime.instance_id().to_string(),
        ),
        (
            "SF_RUNTIME_TOKEN".to_string(),
            runtime.runtime_token().to_string(),
        ),
        (
            "SF_RUNTIME_APP_TOKEN".to_string(),
            runtime.app_token().to_string(),
        ),
        (
            "SF_RUNTIME_PORT".to_string(),
            runtime.app_port().to_string(),
        ),
        (
            "SF_RUNTIME_MANIFEST_PATH".to_string(),
            runtime.manifest_path().to_string_lossy().into_owned(),
        ),
        ("SF_MIGRATION_STATUS".to_string(), "ready".to_string()),
        (
            "SF_WORKSPACE_ID".to_string(),
            authority.workspace_id.clone(),
        ),
        (
            "SF_INSTALLATION_ID".to_string(),
            authority.installation_id.clone(),
        ),
        ("SF_ACTIVE_SHOP_ID".to_string(), authority.shop_id.clone()),
        (
            "SF_SHOP_INCARNATION_ID".to_string(),
            authority.shop_incarnation_id.clone(),
        ),
        (
            "SF_DATABASE_FILE_ID".to_string(),
            authority.database_file_id.clone(),
        ),
        (
            "SF_REGISTRY_REVISION".to_string(),
            authority.registry_revision.to_string(),
        ),
        (
            "SF_MIGRATION_SET_SHA256".to_string(),
            authority.migration_set_sha256.clone(),
        ),
        ("WHATSAPP_SIDECAR_URL".to_string(), runtime.sidecar_url()),
        (
            "WHATSAPP_SIDECAR_PORT".to_string(),
            runtime.sidecar_port().to_string(),
        ),
        (
            "APP_VERSION".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        ),
        ("NODE_ENV".to_string(), "production".to_string()),
        (
            "NODE_COMPILE_CACHE".to_string(),
            compile_cache_dir.to_string_lossy().into_owned(),
        ),
        ("SF_AUTH_MODE".to_string(), auth.mode().as_str().to_string()),
    ];
    if let Some(secret) = auth.secret() {
        environment.push(("AUTH_SECRET".to_string(), secret.to_string()));
    }
    Ok(environment)
}

/// Least-privilege environment for the degradable WhatsApp sidecar.
fn sidecar_env(
    app: &tauri::AppHandle,
    runtime: &RuntimeProtocol,
) -> Result<Vec<(String, String)>, Box<dyn std::error::Error>> {
    use tauri::Manager;
    let app_data_dir = app.path().app_data_dir()?;
    let token_file = app_data_dir.join("sidecar-token");

    Ok(vec![
        (
            "SF_DATA_DIR".to_string(),
            app_data_dir.to_string_lossy().into_owned(),
        ),
        (
            "SIDECAR_TOKEN".to_string(),
            runtime.sidecar_token().to_string(),
        ),
        (
            "SIDECAR_TOKEN_FILE".to_string(),
            token_file.to_string_lossy().into_owned(),
        ),
        ("SF_APP_URL".to_string(), runtime.app_url()),
        (
            "SIDECAR_PORT".to_string(),
            runtime.sidecar_port().to_string(),
        ),
        ("SIDECAR_HOST".to_string(), "127.0.0.1".to_string()),
        ("NODE_ENV".to_string(), "production".to_string()),
    ])
}

/// Validate and start the mandatory Next.js standalone server, prove it is
/// reachable, and only then start the optional WhatsApp sidecar.
fn spawn_initial_services(
    app: &tauri::AppHandle,
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    use tauri::Manager;

    const MAX_INITIAL_ATTEMPTS: u8 = 2;
    let app_data_dir = app.path().app_data_dir()?;
    startup_recovery::record_startup_stage(&app_data_dir, "runtime-prepare-started", None);
    let prepared = prepare_runtime(app)?;
    startup_recovery::record_startup_stage(&app_data_dir, "runtime-prepare-complete", None);
    let mut last_error = None;
    for attempt in 1..=MAX_INITIAL_ATTEMPTS {
        startup_recovery::record_startup_stage(
            &app_data_dir,
            "runtime-attempt-started",
            Some(attempt),
        );
        match spawn_services(app, &prepared) {
            Ok(runtime) => {
                startup_recovery::record_startup_stage(
                    &app_data_dir,
                    "runtime-ready",
                    Some(attempt),
                );
                return Ok(runtime);
            }
            Err(error) => {
                startup_recovery::record_startup_stage(
                    &app_data_dir,
                    "runtime-attempt-failed",
                    Some(attempt),
                );
                eprintln!(
                    "[sahelflow] initial runtime launch {attempt}/{MAX_INITIAL_ATTEMPTS} failed: {error}"
                );
                last_error = Some(error);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| IoError::other("initial runtime launch failed").into()))
}

/// One initial supervisor attempt maps to exactly one contained child launch,
/// while reusing the runtime tree verified once for this desktop launch.
fn spawn_services(
    app: &tauri::AppHandle,
    prepared: &PreparedRuntime,
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    let generation = begin_runtime_generation(app)?;
    finish_runtime_generation_launch(app, generation, prepared)
}

fn spawn_restart_services(
    app: &tauri::AppHandle,
    expected_generation: u64,
    attempt: u8,
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    let generation = begin_restart_runtime_generation(app, expected_generation, attempt)?;
    let prepared = prepare_runtime(app)?;
    finish_runtime_generation_launch(app, generation, &prepared)
}

fn finish_runtime_generation_launch(
    app: &tauri::AppHandle,
    generation: u64,
    prepared: &PreparedRuntime,
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    match spawn_runtime_generation(app, generation, prepared) {
        Ok(runtime) => Ok(runtime),
        Err(error) => {
            cancel_runtime_generation(app, generation);
            Err(error)
        }
    }
}

fn spawn_runtime_generation(
    app: &tauri::AppHandle,
    generation: u64,
    prepared: &PreparedRuntime,
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    use tauri::Manager;

    let app_data_dir = app.path().app_data_dir()?;
    let server_working_dir = app.path().app_local_data_dir()?.join("runtime-work");
    std::fs::create_dir_all(&server_working_dir)?;

    let authority = current_shop_authority(app)?;
    let auth = packaged_auth::load(&authority.database_path)?;
    let runtime_protocol =
        RuntimeProtocol::allocate(&app_data_dir, auth.mode().as_str(), &authority)?;
    let mut env = server_env(app, &runtime_protocol, &authority, &auth)?;
    env.push((
        NODE_ENTRYPOINT_ENV.to_string(),
        node_entrypoint_environment_value(&prepared.server_js)?,
    ));
    let sidecar_environment = sidecar_env(app, &runtime_protocol)?;
    let process_environment = process_environment(&env);
    let server_child = child_containment::ContainedChild::spawn_in_capturing_stderr(
        Path::new(&prepared.runtime_path),
        &[
            OsString::from("--eval"),
            OsString::from(NODE_ENTRYPOINT_BOOTSTRAP),
        ],
        &process_environment,
        Some(&server_working_dir),
    )
    .map_err(|error| {
        if error.containment_uncertain() {
            enter_runtime_safe_mode(app, generation);
        }
        IoError::other(format!(
            "failed to spawn the contained Next.js standalone server: {error}"
        ))
    })?;
    eprintln!(
        "[sahelflow] contained Next.js server spawned with bundled Node.js at {}",
        runtime_protocol.app_url()
    );

    let mut listening_recorded = false;
    match runtime_protocol.wait_until_ready(
        MANDATORY_RUNTIME_READY_TIMEOUT,
        || {
            server_child
                .try_wait()
                .map(|exit| exit.map(|exit| exit.code))
        },
        || {
            if !listening_recorded {
                startup_recovery::record_startup_stage(&app_data_dir, "runtime-listening", None);
                listening_recorded = true;
            }
        },
    )? {
        runtime_protocol::ReadinessOutcome::Ready => {}
        runtime_protocol::ReadinessOutcome::ProcessExited(code) => {
            stop_runtime_launch(app, generation, &server_child, "exited Next.js server")?;
            runtime_protocol::remove_manifest(&app_data_dir);
            let captured = server_child
                .stderr_snapshot(Duration::from_secs(1))
                .ok()
                .and_then(|raw| summarize_runtime_stderr(&raw));
            let captured = captured
                .map(|detail| format!("; stderr summary: {detail}"))
                .unwrap_or_default();
            return Err(IoError::other(format!(
                "the mandatory local server exited before authenticated readiness (exit code {code}){captured}"
            ))
            .into());
        }
        runtime_protocol::ReadinessOutcome::TimedOut => {
            stop_runtime_launch(app, generation, &server_child, "unready Next.js server")?;
            runtime_protocol::remove_manifest(&app_data_dir);
            return Err(IoError::new(
                ErrorKind::TimedOut,
                "the mandatory local server failed its authenticated readiness attempt",
            )
            .into());
        }
    }

    if let Err(error) = runtime_protocol.publish_manifest(env!("CARGO_PKG_VERSION")) {
        stop_runtime_launch(app, generation, &server_child, "unpublished Next.js server")?;
        return Err(error.into());
    }

    let registration = match app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        Some(state) => match state.lock() {
            Ok(mut children) => {
                if children.server.is_some() {
                    Err(IoError::other(
                        "refusing to overwrite a live mandatory server handle",
                    ))
                } else if let Err(error) = children.supervisor.register_ready(generation) {
                    Err(IoError::other(error))
                } else {
                    children.server = Some(server_child.clone());
                    Ok(())
                }
            }
            Err(_) => Err(IoError::other(
                "the desktop could not acquire its child-process supervisor state",
            )),
        },
        None => Err(IoError::other(
            "the desktop child-process supervisor state was not registered",
        )),
    };
    if let Err(error) = registration {
        stop_runtime_launch(
            app,
            generation,
            &server_child,
            "unregistered Next.js server",
        )?;
        runtime_protocol::remove_manifest(&app_data_dir);
        return Err(error.into());
    }

    watch_server(app.clone(), app_data_dir.clone(), generation, server_child);
    // WhatsApp is degradable. Do not start it until the business server is ready.
    spawn_sidecar_and_watch(app.clone(), sidecar_environment, generation)?;
    Ok(SpawnedRuntime {
        protocol: runtime_protocol,
        generation,
    })
}

fn prepare_runtime(app: &tauri::AppHandle) -> Result<PreparedRuntime, Box<dyn std::error::Error>> {
    use tauri::Manager;

    let resource_dir = app.path().resource_dir()?;
    let packaged_standalone = resource_dir.join("standalone");
    let server_js = packaged_runtime::resolve_installed_standalone(
        &packaged_standalone,
        env!("CARGO_PKG_VERSION"),
    )
    .map_err(|error| {
        IoError::new(
            ErrorKind::InvalidData,
            format!("failed to resolve the installed standalone runtime: {error}"),
        )
    })?;
    let runtime_path = bundled_node(&resource_dir).ok_or_else(|| {
        IoError::new(
            ErrorKind::NotFound,
            "The bundled JavaScript runtime is missing. Reinstall SahelFlow.",
        )
    })?;
    Ok(PreparedRuntime {
        server_js,
        runtime_path,
    })
}

fn begin_runtime_generation(app: &tauri::AppHandle) -> Result<u64, Box<dyn std::error::Error>> {
    use tauri::Manager;
    let state = app
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .ok_or_else(|| IoError::other("desktop child-process supervisor state is missing"))?;
    let mut children = state
        .lock()
        .map_err(|_| IoError::other("desktop child-process supervisor state is poisoned"))?;
    if children.server.is_some() {
        return Err(IoError::other("a mandatory server handle is already live").into());
    }
    children
        .supervisor
        .begin_generation()
        .map_err(|error| IoError::other(error).into())
}

fn begin_restart_runtime_generation(
    app: &tauri::AppHandle,
    expected_generation: u64,
    attempt: u8,
) -> Result<u64, Box<dyn std::error::Error>> {
    use tauri::Manager;
    let state = app
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .ok_or_else(|| IoError::other("desktop child-process supervisor state is missing"))?;
    let mut children = state
        .lock()
        .map_err(|_| IoError::other("desktop child-process supervisor state is poisoned"))?;
    if children.server.is_some() {
        return Err(IoError::other("a mandatory server handle is already live").into());
    }
    children
        .supervisor
        .begin_restart_generation(expected_generation, attempt)
        .map_err(|error| IoError::other(error).into())
}

fn cancel_runtime_generation(app: &tauri::AppHandle, generation: u64) {
    use tauri::Manager;
    if let Some(state) = app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            children.supervisor.cancel_generation(generation);
        }
    }
}

fn current_shop_authority(
    app: &tauri::AppHandle,
) -> Result<migration_coordinator::ActiveShopAuthority, Box<dyn std::error::Error>> {
    use tauri::Manager;
    let state