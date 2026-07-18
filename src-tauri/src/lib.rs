#![cfg_attr(debug_assertions, allow(dead_code))]

// SahelFlow Tauri library entry.
//
// Dev vs production:
//   - `tauri dev`: the user runs `bun run dev` manually. This hook does
//     nothing (cfg!(debug_assertions) is true) — preserves hot-reload.
//   - `tauri build` (release): this hook migrates the active database,
//     starts the mandatory Next.js server, proves readiness, and then starts
//     the degradable WhatsApp sidecar.

mod migration_coordinator;
mod runtime_protocol;
mod runtime_supervisor;
mod startup_recovery;

use runtime_protocol::RuntimeProtocol;
use runtime_supervisor::{RestartDecision, RuntimeSupervisor};
use std::io::{Error as IoError, ErrorKind};
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
#[derive(Default)]
struct SpawnedChildren {
    server: Option<tauri_plugin_shell::process::CommandChild>,
    sidecar: Option<tauri_plugin_shell::process::CommandChild>,
    supervisor: RuntimeSupervisor,
}

impl SpawnedChildren {
    fn kill_all(&mut self) {
        self.supervisor.begin_shutdown();
        if let Some(child) = self.server.take() {
            let _ = child.kill();
            eprintln!("[sahelflow] killed Next.js server child on exit");
        }
        if let Some(child) = self.sidecar.take() {
            let _ = child.kill();
            eprintln!("[sahelflow] killed WhatsApp sidecar child on exit");
        }
    }
}

/// Sidecar respawn backoff state. The attempt counter resets when the sidecar
/// ran successfully for more than 60 seconds before crashing.
struct SidecarRespawnState {
    attempts: u8,
    last_spawn: Instant,
}

impl Default for SidecarRespawnState {
    fn default() -> Self {
        Self {
            attempts: 0,
            last_spawn: Instant::now(),
        }
    }
}

const SIDECAR_NAME: &str = "sahelflow-whatsapp";

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
                app.manage(std::sync::Mutex::new(SpawnedChildren::default()));
                app.manage(std::sync::Mutex::new(SidecarRespawnState::default()));

                // Validate the registry and migrate every registered shop before
                // any business server can observe a database.
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
                runtime_protocol::remove_manifest(&app_data_dir);
                let resource_dir = app
                    .path()
                    .resource_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
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

                let runtime = match spawn_services(app.handle()) {
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
                    startup_recovery::show_ready(app.handle(), &runtime.bootstrap_url())
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
) -> Vec<(String, String)> {
    use tauri::Manager;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let token_file = app_data_dir.join("sidecar-token");
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    vec![
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
    ]
}

/// Least-privilege environment for the degradable WhatsApp sidecar.
fn sidecar_env(app: &tauri::AppHandle, runtime: &RuntimeProtocol) -> Vec<(String, String)> {
    use tauri::Manager;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let token_file = app_data_dir.join("sidecar-token");

    vec![
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
        ("NODE_ENV".to_string(), "production".to_string()),
    ]
}

/// Validate and start the mandatory Next.js standalone server, prove it is
/// reachable, and only then start the optional WhatsApp sidecar.
fn spawn_services(app: &tauri::AppHandle) -> Result<RuntimeProtocol, Box<dyn std::error::Error>> {
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;

    const MAX_START_ATTEMPTS: u8 = 3;
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

    let server_path = server_js.to_string_lossy().into_owned();
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

    for attempt in 1..=MAX_START_ATTEMPTS {
        let runtime_protocol = RuntimeProtocol::allocate(&app_data_dir)?;
        let authority = current_shop_authority(app)?;
        let env = server_env(app, &runtime_protocol, &authority);
        let sidecar_environment = sidecar_env(app, &runtime_protocol);
        let mut command = app.shell().command(&runtime_path).arg(&server_path);
        for (key, value) in &env {
            command = command.env(key, value);
        }

        let (events, server_child) = command.spawn().map_err(|error| {
            IoError::other(format!(
                "failed to spawn the Next.js standalone server: {error}"
            ))
        })?;
        eprintln!(
            "[sahelflow] Next.js server spawned with bundled Bun at {} (attempt {attempt}/{MAX_START_ATTEMPTS})",
            runtime_protocol.app_url()
        );

        if !runtime_protocol.wait_until_ready(Duration::from_secs(60)) {
            let _ = server_child.kill();
            runtime_protocol::remove_manifest(&app_data_dir);
            if attempt < MAX_START_ATTEMPTS {
                eprintln!(
                    "[sahelflow] readiness failed; retrying with fresh endpoints and credentials"
                );
                continue;
            }
            return Err(IoError::new(
                ErrorKind::TimedOut,
                "the mandatory local server exhausted its authenticated readiness attempts",
            )
            .into());
        }

        if let Err(error) = runtime_protocol.publish_manifest(env!("CARGO_PKG_VERSION")) {
            let _ = server_child.kill();
            return Err(error.into());
        }

        match app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
            Some(state) => match state.lock() {
                Ok(mut children) => {
                    if let Err(error) = children.supervisor.register_ready() {
                        let _ = server_child.kill();
                        runtime_protocol::remove_manifest(&app_data_dir);
                        return Err(IoError::other(error).into());
                    }
                    children.server = Some(server_child);
                }
                Err(_) => {
                    let _ = server_child.kill();
                    runtime_protocol::remove_manifest(&app_data_dir);
                    return Err(IoError::other(
                        "the desktop could not acquire its child-process supervisor state",
                    )
                    .into());
                }
            },
            None => {
                let _ = server_child.kill();
                runtime_protocol::remove_manifest(&app_data_dir);
                return Err(IoError::other(
                    "the desktop child-process supervisor state was not registered",
                )
                .into());
            }
        }

        watch_server(app.clone(), events, app_data_dir.clone());
        // WhatsApp is degradable. Do not start it until the business server is ready.
        spawn_sidecar_and_watch(app.clone(), sidecar_environment);
        return Ok(runtime_protocol);
    }

    unreachable!("the bounded startup loop either returns ready or an error")
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
    mut events: tauri::async_runtime::Receiver<tauri_plugin_shell::process::CommandEvent>,
    app_data_dir: std::path::PathBuf,
) {
    use tauri::Manager;
    use tauri_plugin_shell::process::CommandEvent;

    let started_at = Instant::now();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            if let CommandEvent::Terminated(payload) = event {
                let decision = app_handle
                    .try_state::<std::sync::Mutex<SpawnedChildren>>()
                    .and_then(|state| {
                        state.lock().ok().map(|mut children| {
                            children.server = None;
                            if let Some(sidecar) = children.sidecar.take() {
                                let _ = sidecar.kill();
                            }
                            children.supervisor.record_termination(started_at.elapsed())
                        })
                    })
                    .unwrap_or(RestartDecision::Ignore);
                runtime_protocol::remove_manifest(&app_data_dir);
                if decision != RestartDecision::Ignore {
                    let detail = format!(
                        "The mandatory local server terminated after readiness: {payload:?}"
                    );
                    eprintln!("[sahelflow] FATAL: {detail}");
                    handle_server_restart_decision(&app_handle, &detail, decision);
                }
                break;
            }
        }
    });
}

fn handle_server_restart_decision(
    app_handle: &tauri::AppHandle,
    detail: &str,
    decision: RestartDecision,
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
            schedule_server_restart(app_handle.clone(), attempt, delay);
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

fn schedule_server_restart(app_handle: tauri::AppHandle, attempt: u8, delay: Duration) {
    use tauri::Manager;

    std::thread::spawn(move || {
        std::thread::sleep(delay);
        let allows_restart = app_handle
            .try_state::<std::sync::Mutex<SpawnedChildren>>()
            .and_then(|state| {
                state
                    .lock()
                    .ok()
                    .map(|children| children.supervisor.allows_restart())
            })
            .unwrap_or(false);
        if !allows_restart {
            return;
        }

        match spawn_services(&app_handle) {
            Ok(runtime) => {
                if let Err(error) =
                    startup_recovery::show_ready(&app_handle, &runtime.bootstrap_url())
                {
                    eprintln!(
                        "[sahelflow] restarted runtime could not reveal the workspace: {error}"
                    );
                }
            }
            Err(error) => {
                let detail =
                    format!("Automatic runtime restart attempt {attempt}/3 failed: {error}");
                eprintln!("[sahelflow] {detail}");
                let decision = app_handle
                    .try_state::<std::sync::Mutex<SpawnedChildren>>()
                    .and_then(|state| {
                        state
                            .lock()
                            .ok()
                            .map(|mut children| children.supervisor.record_restart_failure())
                    })
                    .unwrap_or(RestartDecision::EnterSafeMode { attempts: 3 });
                handle_server_restart_decision(&app_handle, &detail, decision);
            }
        }
    });
}

fn spawn_sidecar_and_watch(app_handle: tauri::AppHandle, env: Vec<(String, String)>) {
    use tauri::Manager;
    use tauri_plugin_shell::process::CommandEvent;
    use tauri_plugin_shell::ShellExt;

    let mut command = match app_handle.shell().sidecar(SIDECAR_NAME) {
        Ok(command) => command,
        Err(error) => {
            eprintln!(
                "[sahelflow] WhatsApp sidecar binary not found; inbox remains degraded: {error}"
            );
            return;
        }
    };
    for (key, value) in &env {
        command = command.env(key, value);
    }

    let (mut events, child) = match command.spawn() {
        Ok(spawned) => spawned,
        Err(error) => {
            eprintln!("[sahelflow] failed to spawn WhatsApp sidecar: {error}");
            return;
        }
    };

    let port = env
        .iter()
        .find_map(|(key, value)| (key == "SIDECAR_PORT").then_some(value.as_str()))
        .unwrap_or("dynamic");
    eprintln!("[sahelflow] WhatsApp sidecar spawned on port {port}");
    let mut child = Some(child);
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            if children.supervisor.runtime_ready() && children.supervisor.allows_restart() {
                children.sidecar = child.take();
            }
        }
    }
    if let Some(child) = child {
        let _ = child.kill();
        return;
    }
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SidecarRespawnState>>() {
        if let Ok(mut respawn) = state.lock() {
            respawn.last_spawn = Instant::now();
        }
    }

    let env_for_respawn = env.clone();
    let app_handle_for_watch = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    eprintln!("[whatsapp] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[whatsapp] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[whatsapp] terminated: {payload:?}");
                    schedule_sidecar_respawn(app_handle_for_watch.clone(), env_for_respawn.clone());
                }
                _ => {}
            }
        }
    });
}

fn schedule_sidecar_respawn(app_handle: tauri::AppHandle, env: Vec<(String, String)>) {
    use tauri::Manager;

    const MAX_ATTEMPTS: u8 = 3;
    const RESET_THRESHOLD_SECS: u64 = 60;

    let runtime_allows_respawn = app_handle
        .try_state::<std::sync::Mutex<SpawnedChildren>>()
        .and_then(|state| {
            state.lock().ok().map(|children| {
                children.supervisor.runtime_ready() && children.supervisor.allows_restart()
            })
        })
        .unwrap_or(false);
    if !runtime_allows_respawn {
        return;
    }

    let (alive_seconds, next_attempt) =
        if let Some(state) = app_handle.try_state::<std::sync::Mutex<SidecarRespawnState>>() {
            if let Ok(mut respawn) = state.lock() {
                let alive = respawn.last_spawn.elapsed().as_secs();
                if alive >= RESET_THRESHOLD_SECS {
                    respawn.attempts = 0;
                }
                respawn.attempts = respawn.attempts.saturating_add(1);
                (alive, respawn.attempts)
            } else {
                (0, 1)
            }
        } else {
            (0, 1)
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
        spawn_sidecar_and_watch(app_handle, env);
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
