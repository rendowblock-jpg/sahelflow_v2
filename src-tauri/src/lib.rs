// SahelFlow Tauri library entry.
//
// Dev vs production:
//   - `tauri dev`: the user runs `bun run dev` manually. This hook does
//     nothing (cfg!(debug_assertions) is true) — preserves hot-reload.
//   - `tauri build` (release): this hook migrates the active database,
//     starts the mandatory Next.js server, proves readiness, and then starts
//     the degradable WhatsApp sidecar.

mod startup_recovery;

#[cfg(not(debug_assertions))]
use std::io::{Error as IoError, ErrorKind};
#[cfg(not(debug_assertions))]
use std::net::TcpStream;
#[cfg(not(debug_assertions))]
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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
            .args(&[
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
            .args(&["-rd1", "-c", "IOPlatformExpertDevice"])
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
#[cfg(not(debug_assertions))]
struct SpawnedChildren {
    server: Option<tauri_plugin_shell::process::CommandChild>,
    sidecar: Option<tauri_plugin_shell::process::CommandChild>,
}

#[cfg(not(debug_assertions))]
impl SpawnedChildren {
    fn kill_all(&mut self) {
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

#[cfg(not(debug_assertions))]
impl Default for SpawnedChildren {
    fn default() -> Self {
        Self {
            server: None,
            sidecar: None,
        }
    }
}

/// Sidecar respawn backoff state. The attempt counter resets when the sidecar
/// ran successfully for more than 60 seconds before crashing.
#[cfg(not(debug_assertions))]
struct SidecarRespawnState {
    attempts: u8,
    last_spawn: Instant,
}

#[cfg(not(debug_assertions))]
impl Default for SidecarRespawnState {
    fn default() -> Self {
        Self {
            attempts: 0,
            last_spawn: Instant::now(),
        }
    }
}

#[cfg(not(debug_assertions))]
const SIDECAR_NAME: &str = "sahelflow-whatsapp";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
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
                app.manage(SpawnedChildren::default());
                app.manage(std::sync::Mutex::new(SidecarRespawnState::default()));

                // Migrate the current database before any business server starts.
                let db_path = app
                    .path()
                    .app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("shops/dev.db");
                let resource_dir = app
                    .path()
                    .resource_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
                let migration_script = resource_dir.join("scripts/run-migrations.ts");
                let bun_cmd = bundled_bun(&resource_dir).unwrap_or_else(|| "bun".to_string());

                // Preserve a pre-migration copy when a database already exists.
                let mut backup_made = false;
                if db_path.exists() {
                    let timestamp = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|duration| duration.as_secs())
                        .unwrap_or(0);
                    let backup_path =
                        db_path.with_extension(format!("pre-migration-{timestamp}.db"));
                    match std::fs::copy(&db_path, &backup_path) {
                        Ok(_) => {
                            backup_made = true;
                            eprintln!(
                                "[sahelflow] DB backed up to {} before migration",
                                backup_path.display()
                            );
                        }
                        Err(error) => {
                            eprintln!(
                                "[sahelflow] WARNING: could not back up DB before migration ({error}). Continuing with migration without a rollback copy."
                            );
                        }
                    }
                }

                let migration_result = std::process::Command::new(&bun_cmd)
                    .arg(&migration_script)
                    .env("DATABASE_URL", format!("file:{}", db_path.display()))
                    .env(
                        "PRISMA_MIGRATIONS_DIR",
                        resource_dir
                            .join("prisma/migrations")
                            .to_str()
                            .unwrap_or(""),
                    )
                    .output();

                match migration_result {
                    Ok(output) if output.status.success() => {
                        eprintln!("[sahelflow] Migrations applied successfully");
                    }
                    Ok(output) => {
                        let backup_note = if backup_made {
                            "A pre-migration backup was saved next to the shop database."
                        } else {
                            "No pre-migration backup was available."
                        };
                        let detail = format!(
                            "Migration command failed with exit code {:?}. {backup_note}\n\nstdout:\n{}\n\nstderr:\n{}",
                            output.status.code(),
                            String::from_utf8_lossy(&output.stdout),
                            String::from_utf8_lossy(&output.stderr),
                        );
                        eprintln!("[sahelflow] FATAL: {detail}");
                        startup_recovery::show_blocked(
                            app,
                            "SF-MIGRATION-BLOCKED",
                            &detail,
                        )?;
                        return Ok(());
                    }
                    Err(error) => {
                        let backup_note = if backup_made {
                            "A pre-migration backup was saved next to the shop database."
                        } else {
                            "No pre-migration backup was available."
                        };
                        let detail = format!(
                            "Could not start the migration command using {bun_cmd}: {error}. {backup_note}"
                        );
                        eprintln!("[sahelflow] FATAL: {detail}");
                        startup_recovery::show_blocked(
                            app,
                            "SF-MIGRATION-RUNNER-MISSING",
                            &detail,
                        )?;
                        return Ok(());
                    }
                }

                if let Err(error) = spawn_services(app) {
                    let detail = error.to_string();
                    eprintln!(
                        "[sahelflow] FATAL: mandatory local service startup failed: {detail}"
                    );
                    startup_recovery::show_blocked(
                        app,
                        "SF-RUNTIME-STARTUP-BLOCKED",
                        &detail,
                    )?;
                    return Ok(());
                }
            }

            // The configured window starts hidden. Reveal it only after all
            // mandatory gates succeed (or through show_blocked above).
            startup_recovery::show_ready(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building SahelFlow application")
        .run(|app_handle, event| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                if matches!(
                    event,
                    tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
                ) {
                    if let Some(state) =
                        app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>()
                    {
                        if let Ok(mut children) = state.lock() {
                            children.kill_all();
                        }
                    }
                }
            }
        });
}

/// Shared environment passed to every spawned child.
#[cfg(not(debug_assertions))]
fn child_env(app: &tauri::App) -> Vec<(String, String)> {
    use tauri::Manager;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let db_path = app_data_dir.join("shops/dev.db");
    let token_file = app_data_dir.join("sidecar-token");

    let sidecar_token = std::env::var("SIDECAR_TOKEN").unwrap_or_else(|_| {
        std::fs::read_to_string(&token_file)
            .map(|value| value.trim().to_string())
            .unwrap_or_default()
    });

    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    vec![
        (
            "DATABASE_URL".to_string(),
            format!("file:{}", db_path.display()),
        ),
        (
            "SF_DATA_DIR".to_string(),
            app_data_dir.to_string_lossy().into_owned(),
        ),
        ("SIDECAR_TOKEN".to_string(), sidecar_token),
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
        ("NODE_ENV".to_string(), "production".to_string()),
    ]
}

/// Validate and start the mandatory Next.js standalone server, prove it is
/// reachable, and only then start the optional WhatsApp sidecar.
#[cfg(not(debug_assertions))]
fn spawn_services(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;

    let env = child_env(app);
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
    let (runtime, runtime_path) = match bundled_bun(&resource_dir) {
        Some(path) => ("bundled-bun", Some(path)),
        None if which_exists("bun") => ("bun", None),
        None if which_exists("node") => ("node", None),
        None => {
            return Err(IoError::new(
                ErrorKind::NotFound,
                "No JavaScript runtime is available: bundled Bun, PATH Bun, and PATH Node are all missing. Reinstall SahelFlow.",
            )
            .into());
        }
    };

    let runtime_arg = runtime_path.as_deref().unwrap_or(runtime);
    let mut command = app.shell().command(runtime_arg).arg(server_path);
    for (key, value) in &env {
        command = command.env(key, value);
    }

    let (_events, server_child) = command.spawn().map_err(|error| {
        IoError::new(
            ErrorKind::Other,
            format!("failed to spawn the Next.js standalone server: {error}"),
        )
    })?;
    eprintln!(
        "[sahelflow] Next.js server spawned with {runtime} → http://localhost:3000"
    );

    if !wait_for_port("127.0.0.1", 3000, Duration::from_secs(60)) {
        let _ = server_child.kill();
        return Err(IoError::new(
            ErrorKind::TimedOut,
            "the mandatory local server did not become ready within 60 seconds",
        )
        .into());
    }

    match app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        Some(state) => match state.lock() {
            Ok(mut children) => children.server = Some(server_child),
            Err(_) => {
                let _ = server_child.kill();
                return Err(IoError::new(
                    ErrorKind::Other,
                    "the desktop could not acquire its child-process supervisor state",
                )
                .into());
            }
        },
        None => {
            let _ = server_child.kill();
            return Err(IoError::new(
                ErrorKind::Other,
                "the desktop child-process supervisor state was not registered",
            )
            .into());
        }
    }

    // WhatsApp is degradable. Do not start it until the business server is ready.
    spawn_sidecar_and_watch(app.handle().clone(), env);
    Ok(())
}

#[cfg(not(debug_assertions))]
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

    eprintln!("[sahelflow] WhatsApp sidecar spawned on port 3001");
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            children.sidecar = Some(child);
        }
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
                    schedule_sidecar_respawn(
                        app_handle_for_watch.clone(),
                        env_for_respawn.clone(),
                    );
                }
                _ => {}
            }
        }
    });
}

#[cfg(not(debug_assertions))]
fn schedule_sidecar_respawn(app_handle: tauri::AppHandle, env: Vec<(String, String)>) {
    use tauri::Manager;

    const MAX_ATTEMPTS: u8 = 3;
    const RESET_THRESHOLD_SECS: u64 = 60;

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

#[cfg(not(debug_assertions))]
fn which_exists(command: &str) -> bool {
    which::which(command).is_ok()
}

#[cfg(not(debug_assertions))]
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

#[cfg(not(debug_assertions))]
fn wait_for_port(host: &str, port: u16, timeout: Duration) -> bool {
    let started_at = Instant::now();
    let address = format!("{host}:{port}");
    while started_at.elapsed() < timeout {
        if TcpStream::connect(&address).is_ok() {
            eprintln!("[sahelflow] Next.js server is reachable at http://localhost:{port}");
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    eprintln!("[sahelflow] Next.js server did not open port {port} within {timeout:?}");
    false
}
