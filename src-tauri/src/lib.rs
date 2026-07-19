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
mod runtime_protocol;
mod runtime_supervisor;
mod startup_recovery;

use runtime_protocol::RuntimeProtocol;
use runtime_supervisor::{RestartDecision, RuntimeSupervisor};
use std::ffi::OsString;
use std::io::{Error as IoError, ErrorKind};
use std::path::{Path, PathBuf};
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

const SIDECAR_NAME: &str = "sahelflow-whatsapp";
const PROCESS_TREE_STOP_TIMEOUT: Duration = Duration::from_secs(10);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
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
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                let app_data_dir = app.path().app_data_dir()?;
                let resource_dir = app.path().resource_dir()?;
                app.manage(std::sync::Mutex::new(SpawnedChildren::new()));
                app.manage(std::sync::Mutex::new(SidecarRespawnState::default()));

                // Validate the registry and migrate every registered shop before
                // any business server can observe a database.
                runtime_protocol::remove_manifest(&app_data_dir);
                let authority =
                    match migration_coordinator::prepare_installation(&app_data_dir, &resource_dir)
                    {
                        Ok(authority) => authority,
                        Err(error) => {
                            let detail = error.to_string();
                            eprintln!("[sahelflow] FATAL: all-shop migration blocked: {detail}");
                            startup_recovery::show_blocked(
                                app.handle(),
                                "SF-MIGRATION-BLOCKED",
                                &detail,
                            )?;
                            return Ok(());
                        }
                    };
                app.manage(std::sync::Mutex::new(authority));

                let runtime = match spawn_initial_services(app.handle()) {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        let detail = error.to_string();
                        eprintln!(
                            "[sahelflow] FATAL: mandatory local service startup failed: {detail}"
                        );
                        startup_recovery::show_blocked(
                            app.handle(),
                            "SF-RUNTIME-STARTUP-BLOCKED",
                            &detail,
                        )?;
                        return Ok(());
                    }
                };

                if let Err(error) =
                    startup_recovery::show_ready(app.handle(), &runtime.protocol.bootstrap_url())
                {
                    if let Some(state) = app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
                        if let Ok(mut children) = state.lock() {
                            children.kill_all();
                        }
                    }
                    runtime_protocol::remove_manifest(&app_data_dir);
                    return Err(error);
                }
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
                if matches!(
                    _event,
                    tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
                ) {
                    if let Some(state) =
                        _app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>()
                    {
                        if let Ok(mut children) = state.lock() {
                            children.kill_all();
                        }
                    }
                    if let Ok(app_data_dir) = _app_handle.path().app_data_dir() {
                        runtime_protocol::remove_manifest(&app_data_dir);
                    }
                }
            }
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
        ("SF_ACTIVE_SHOP_ID".to_string(), authority.shop_id.clone()),
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
    const MAX_INITIAL_ATTEMPTS: u8 = 3;
    let mut last_error = None;
    for attempt in 1..=MAX_INITIAL_ATTEMPTS {
        match spawn_services(app) {
            Ok(runtime) => return Ok(runtime),
            Err(error) => {
                eprintln!(
                    "[sahelflow] initial runtime launch {attempt}/{MAX_INITIAL_ATTEMPTS} failed: {error}"
                );
                last_error = Some(error);
            }
        }
    }
    Err(last_error.unwrap_or_else(|| IoError::other("initial runtime launch failed").into()))
}

/// One supervisor restart attempt maps to exactly one contained child launch.
fn spawn_services(app: &tauri::AppHandle) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    let generation = begin_runtime_generation(app)?;
    finish_runtime_generation_launch(app, generation)
}

fn spawn_restart_services(
    app: &tauri::AppHandle,
    expected_generation: u64,
    attempt: u8,
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    let generation = begin_restart_runtime_generation(app, expected_generation, attempt)?;
    finish_runtime_generation_launch(app, generation)
}

fn finish_runtime_generation_launch(
    app: &tauri::AppHandle,
    generation: u64,
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    match spawn_runtime_generation(app, generation) {
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
) -> Result<SpawnedRuntime, Box<dyn std::error::Error>> {
    use tauri::Manager;

    let app_data_dir = app.path().app_data_dir()?;
    let resource_dir = app.path().resource_dir()?;
    let server_js = resource_dir.join("standalone").join("server.js");

    if !server_js.exists() {
        return Err(IoError::new(
            ErrorKind::NotFound,
            format!(
                "Next.js standalone server is missing at {}. Reinstall SahelFlow or rebuild the candidate.",
                server_js.display()
            ),
        )
        .into());
    }

    let runtime_path = match bundled_bun(&resource_dir) {
        Some(path) => path,
        None => {
            return Err(IoError::new(
                ErrorKind::NotFound,
                "The bundled JavaScript runtime is missing. Reinstall SahelFlow.",
            )
            .into());
        }
    };

    let authority = current_shop_authority(app)?;
    let auth = packaged_auth::load(&authority.database_path)?;
    let runtime_protocol = RuntimeProtocol::allocate(&app_data_dir, auth.mode().as_str())?;
    let env = server_env(app, &runtime_protocol, &authority, &auth)?;
    let sidecar_environment = sidecar_env(app, &runtime_protocol)?;
    let server_child = child_containment::ContainedChild::spawn(
        Path::new(&runtime_path),
        &[server_js.as_os_str().to_os_string()],
        &process_environment(&env),
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
        "[sahelflow] contained Next.js server spawned with bundled Bun at {}",
        runtime_protocol.app_url()
    );

    if !runtime_protocol.wait_until_ready(Duration::from_secs(60)) {
        stop_runtime_launch(app, generation, &server_child, "unready Next.js server")?;
        runtime_protocol::remove_manifest(&app_data_dir);
        return Err(IoError::new(
            ErrorKind::TimedOut,
            "the mandatory local server failed its authenticated readiness attempt",
        )
        .into());
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
    let state = app
        .try_state::<std::sync::Mutex<migration_coordinator::ActiveShopAuthority>>()
        .ok_or_else(|| IoError::new(ErrorKind::NotFound, "shop authority state is missing"))?;
    let migration_set_sha256 = state
        .lock()
        .map_err(|_| IoError::other("shop authority state is poisoned"))?
        .migration_set_sha256
        .clone();
    let app_data_dir = app.path().app_data_dir()?;
    migration_coordinator::active_authority(&app_data_dir, &migration_set_sha256)
}

fn watch_server(
    app_handle: tauri::AppHandle,
    app_data_dir: PathBuf,
    generation: u64,
    server: child_containment::ContainedChild,
) {
    use tauri::Manager;

    let server_pid = server.pid();
    let started_at = Instant::now();
    std::thread::spawn(move || {
        let exit = server.wait_for_exit_and_close_tree(PROCESS_TREE_STOP_TIMEOUT);
        let sidecar = match take_terminated_generation(&app_handle, generation, server_pid) {
            Ok(Some(sidecar)) => sidecar,
            Ok(None) => return,
            Err(error) => {
                runtime_protocol::remove_manifest(&app_data_dir);
                enter_runtime_safe_mode(&app_handle, generation);
                show_containment_blocked(&app_handle, &error.to_string());
                return;
            }
        };

        let sidecar_stop = sidecar
            .as_ref()
            .map(|child| stop_process_tree(child, "sidecar from terminated runtime"))
            .transpose();
        let containment_error = exit
            .as_ref()
            .err()
            .map(ToString::to_string)
            .or_else(|| sidecar_stop.err().map(|error| error.to_string()));
        let decision = app_handle
            .try_state::<std::sync::Mutex<SpawnedChildren>>()
            .and_then(|state| {
                state.lock().ok().map(|mut children| {
                    if containment_error.is_some() {
                        children.supervisor.enter_safe_mode(generation);
                        RestartDecision::Ignore
                    } else {
                        children
                            .supervisor
                            .record_termination(generation, started_at.elapsed())
                    }
                })
            })
            .unwrap_or(RestartDecision::Ignore);

        runtime_protocol::remove_manifest(&app_data_dir);
        let detail = match exit {
            Ok(payload) => format!(
                "The mandatory local server terminated after readiness with exit code {}",
                payload.code
            ),
            Err(error) => format!(
                "The mandatory local server terminated but its process tree could not be proven stopped: {error}"
            ),
        };
        eprintln!("[sahelflow] FATAL: {detail}");
        if let Some(error) = containment_error {
            show_containment_blocked(&app_handle, &format!("{detail}: {error}"));
        } else {
            handle_server_restart_decision(&app_handle, &detail, decision, generation);
        }
    });
}

fn take_terminated_generation(
    app_handle: &tauri::AppHandle,
    generation: u64,
    server_pid: u32,
) -> Result<Option<Option<child_containment::ContainedChild>>, IoError> {
    use tauri::Manager;

    let deadline = Instant::now() + PROCESS_TREE_STOP_TIMEOUT;
    loop {
        let state = app_handle
            .try_state::<std::sync::Mutex<SpawnedChildren>>()
            .ok_or_else(|| IoError::other("desktop child-process supervisor state is missing"))?;
        let mut children = state
            .lock()
            .map_err(|_| IoError::other("desktop child-process supervisor state is poisoned"))?;
        let current = children.supervisor.current_generation() == generation
            && children
                .server
                .as_ref()
                .is_some_and(|child| child.pid() == server_pid);
        if !current {
            return Ok(None);
        }
        if children.sidecar_starting != Some(generation) {
            children.server.take();
            return Ok(Some(children.sidecar.take()));
        }
        drop(children);
        if Instant::now() >= deadline {
            return Err(IoError::new(
                ErrorKind::TimedOut,
                "the mandatory runtime terminated while a sidecar launch remained in flight; old-generation teardown is unproven",
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn show_containment_blocked(app_handle: &tauri::AppHandle, detail: &str) {
    if let Err(error) = startup_recovery::show_blocked(
        app_handle,
        "SF-RUNTIME-CONTAINMENT-BLOCKED",
        &format!(
            "{detail}. SahelFlow will not launch another runtime until the desktop is restarted."
        ),
    ) {
        eprintln!("[sahelflow] could not show containment failure: {error}");
    }
}

fn handle_server_restart_decision(
    app_handle: &tauri::AppHandle,
    detail: &str,
    decision: RestartDecision,
    generation: u64,
) {
    match decision {
        RestartDecision::Ignore => {}
        RestartDecision::Retry { attempt, delay } => {
            let retry_detail = format!(
                "{detail}. SahelFlow will retry the local runtime in {} seconds (attempt {attempt}/3).",
                delay.as_secs()
            );
            if let Err(error) = startup_recovery::show_blocked(
                app_handle,
                "SF-RUNTIME-RETRYING",
                &retry_detail,
            ) {
                eprintln!("[sahelflow] could not show runtime recovery: {error}");
            }
            schedule_server_restart(app_handle.clone(), generation, attempt, delay);
        }
        RestartDecision::EnterSafeMode { attempts } => {
            if let Err(error) = startup_recovery::show_blocked(
                app_handle,
                "SF-RUNTIME-CRASH-LOOP",
                &format!(
                    "{detail}. The automatic restart budget is exhausted after {attempts} attempts. SahelFlow is in safe mode until it is restarted."
                ),
            ) {
                eprintln!("[sahelflow] could not show runtime recovery: {error}");
            }
        }
    }
}

fn schedule_server_restart(
    app_handle: tauri::AppHandle,
    expected_generation: u64,
    attempt: u8,
    delay: Duration,
) {
    use tauri::Manager;

    std::thread::spawn(move || {
        std::thread::sleep(delay);
        let allows_restart = app_handle
            .try_state::<std::sync::Mutex<SpawnedChildren>>()
            .and_then(|state| {
                state.lock().ok().map(|children| {
                    children.server.is_none()
                        && children
                            .supervisor
                            .generation_can_restart(expected_generation, attempt)
                })
            })
            .unwrap_or(false);
        if !allows_restart {
            return;
        }

        match spawn_restart_services(&app_handle, expected_generation, attempt) {
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

fn bundled_bun(resource_dir: &std::path::Path) -> Option<String> {
    let executable = if cfg!(target_os = "windows") {
        "bun.exe"
    } else {
        "bun"
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
    use super::is_windows_safe_parent_environment_key;
    use std::ffi::OsStr;

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
}
