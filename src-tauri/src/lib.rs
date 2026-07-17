// SahelFlow Tauri library entry.
//
// Dev vs production:
//   - `tauri dev`: the user runs `bun run dev` manually. This hook does
//     nothing (cfg!(debug_assertions) is true) — preserves hot-reload.
//   - `tauri build` (release): this hook spawns the WhatsApp sidecar
//     and the Next.js standalone server, waits for the server port to open.
//
// Stronghold:
//   The tauri-plugin-stronghold v2 plugin is registered here and provides
//   built-in commands (plugin:stronghold|*) that can be invoked from the
//   webview. Custom Rust-side Stronghold commands are NOT used because the
//   plugin's internal StrongholdCollection state is private. The master key
//   is stored via the keyfile (data/master.key) on the server side; the
//   webview can use the plugin's commands for other secure storage needs.

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
            .args(&["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"])
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
                    let parts: Vec<&str> = line.split("=").collect();
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

    // T-P4: previously returned "DEV-MOCK-MACHINE-ID-FALLBACK" — a fake,
    // publicly-known ID. In release builds this is a security risk:
    // machine-id.ts falls through to a browser localStorage UUID when
    // it sees the sentinel, which a user can clear to bypass license
    // machine-pinning. In release builds, return an empty string so
    // machine-id.ts can detect "no real ID available" and the license
    // service can fail-closed. In debug builds keep the mock for dev convenience.
    #[cfg(debug_assertions)]
    return "DEV-MOCK-MACHINE-ID-FALLBACK".to_string();

    #[cfg(not(debug_assertions))]
    return String::new();
}

/// Handles to spawned child processes (Next.js server + WhatsApp sidecar)
/// kept in app state so they can be killed on app exit (T-S4). Without this,
/// closing the window orphans the children — they keep holding ports 3000/3001,
/// so the next launch's `wait_for_port` times out → blank window.
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
        Self { server: None, sidecar: None }
    }
}

/// W2-2: sidecar respawn backoff state. Stored as a Tauri managed state
/// (`Mutex<SidecarRespawnState>`). The `last_spawn` timestamp lets us reset the
/// attempt counter when the sidecar ran successfully for >60s before crashing —
/// a stable sidecar shouldn't be refused respawn for an occasional crash.
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
            // Stronghold v2: Builder::new() takes a password hash function.
            // This closure hashes the vault password before storing it.
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
        .setup(|_app| {
            // Register the spawned-children state so the RunEvent loop can
            // kill children on exit (T-S4).
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                _app.manage(SpawnedChildren::default());
                // W2-2: track sidecar respawn attempts for backoff. Reset on
                // successful run (>60s alive) — see schedule_sidecar_respawn.
                _app.manage(std::sync::Mutex::new(SidecarRespawnState::default()));

                // Run Prisma migrations BEFORE spawning Next.js.
                // Ensures the user's SQLite schema is up-to-date on every
                // app launch. Uses bun to run the migration script.
                // The script + prisma/migrations are bundled as Tauri resources.
                let db_path = _app.path().app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("shops/dev.db");
                let resource_dir = _app.path().resource_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."));
                let migration_script = resource_dir.join("scripts/run-migrations.ts");
                // T-S5: prefer the bundled Bun runtime so end users don't need Bun installed.
                let bun_cmd = bundled_bun(&resource_dir).unwrap_or_else(|| "bun".to_string());
                // W2-1: back up the existing DB before running migrations. A
                // partially-applied migration leaves the schema in an
                // inconsistent state — without a backup the user's data is
                // trapped in a bricked install. The backup lives next to
                // dev.db as dev.pre-migration-<epoch>.db so multiple attempts
                // don't clobber each other.
                let mut backup_made = false;
                if db_path.exists() {
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let backup_path =
                        db_path.with_extension(format!("pre-migration-{}.db", ts));
                    match std::fs::copy(&db_path, &backup_path) {
                        Ok(_) => {
                            backup_made = true;
                            eprintln!(
                                "[sahelflow] DB backed up to {} before migration",
                                backup_path.display()
                            );
                        }
                        Err(e) => {
                            eprintln!(
                                "[sahelflow] WARNING: could not back up DB before migration ({}). \
                                 Continuing with migration — no rollback path exists if it fails.",
                                e
                            );
                        }
                    }
                }

                let migration_result = std::process::Command::new(&bun_cmd)
                    .arg(&migration_script)
                    .env("DATABASE_URL", format!("file:{}", db_path.display()))
                    .env("PRISMA_MIGRATIONS_DIR", resource_dir.join("prisma/migrations").to_str().unwrap_or(""))
                    .output();
                match migration_result {
                    Ok(output) if output.status.success() => {
                        eprintln!("[sahelflow] Migrations applied successfully");
                    }
                    Ok(output) => {
                        // W2-1: migration failure is FATAL in release. A
                        // partially-applied migration leaves the schema
                        // inconsistent — launching the app anyway would silently
                        // brick the install and trap the user's data. Exit(1)
                        // so the founder can restore from the pre-migration
                        // backup before retrying.
                        //
                        // (This whole block is `#[cfg(not(debug_assertions))]`,
                        // so debug builds keep the old warn-only behavior —
                        // dev iteration isn't blocked by migration issues.)
                        eprintln!(
                            "[sahelflow] FATAL: migration failed (exit code {:?})",
                            output.status.code()
                        );
                        eprintln!(
                            "[sahelflow] --- stderr ---\n{}",
                            String::from_utf8_lossy(&output.stderr)
                        );
                        eprintln!(
                            "[sahelflow] --- stdout ---\n{}",
                            String::from_utf8_lossy(&output.stdout)
                        );
                        if backup_made {
                            eprintln!(
                                "[sahelflow] A pre-migration backup was saved next to dev.db \
                                 (dev.pre-migration-*.db). Restore it before retrying, or \
                                 contact support."
                            );
                        } else {
                            eprintln!(
                                "[sahelflow] No pre-migration backup was available (this was \
                                 likely a first launch with no existing DB). Delete \
                                 shops/dev.db and relaunch to retry, or contact support."
                            );
                        }
                        std::process::exit(1);
                    }
                    Err(e) => {
                        eprintln!("[sahelflow] FATAL: could not run migration command: {}", e);
                        if backup_made {
                            eprintln!(
                                "[sahelflow] A pre-migration backup was saved next to dev.db \
                                 (dev.pre-migration-*.db). Restore it before retrying, or \
                                 contact support."
                            );
                        } else {
                            eprintln!(
                                "[sahelflow] No pre-migration backup was available (this was \
                                 likely a first launch with no existing DB). Delete \
                                 shops/dev.db and relaunch to retry, or contact support."
                            );
                        }
                        std::process::exit(1);
                    }
                }

                if let Err(error) = spawn_services(_app) {
                    eprintln!("[sahelflow] FATAL: mandatory local service startup failed: {error}");
                    return Err(error);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building SahelFlow application")
        .run(|_app_handle, event| {
            // T-S4: kill spawned children on exit so they don't orphan + hold
            // ports 3000/3001 (which would make the next launch time out and
            // show a blank window). On Windows this also prevents bun.exe
            // process accumulation.
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                if let tauri::RunEvent::ExitRequested { .. } = event {
                    if let Some(state) = _app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
                        if let Ok(mut children) = state.lock() {
                            children.kill_all();
                        }
                    }
                }
                if let tauri::RunEvent::Exit = event {
                    if let Some(state) = _app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
                        if let Ok(mut children) = state.lock() {
                            children.kill_all();
                        }
                    }
                }
            }
        });
}

/// Shared env vars passed to EVERY spawned child (sidecar + Next.js server +
/// migration runner). Without these, the children inherit the Tauri process's
/// cwd-based defaults → DB/master-key/auth resolve to wrong paths (T-S2).
#[cfg(not(debug_assertions))]
fn child_env(app: &tauri::App) -> Vec<(String, String)> {
    use tauri::Manager;
    let app_data_dir = app.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let db_path = app_data_dir.join("shops/dev.db");
    let token_file = app_data_dir.join("sidecar-token");

    // Read the sidecar token (written by the sidecar on boot) if present so the
    // Next.js server can authenticate to the sidecar. Fall back to the env var.
    let sidecar_token = std::env::var("SIDECAR_TOKEN").unwrap_or_else(|_| {
        std::fs::read_to_string(&token_file)
            .map(|s| s.trim().to_string())
            .unwrap_or_default()
    });

    let resource_dir = app.path().resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    vec![
        ("DATABASE_URL".to_string(), format!("file:{}", db_path.display())),
        ("SF_DATA_DIR".to_string(), app_data_dir.to_string_lossy().into_owned()),
        ("SIDECAR_TOKEN".to_string(), sidecar_token),
        ("SIDECAR_TOKEN_FILE".to_string(), token_file.to_string_lossy().into_owned()),
        ("PRISMA_MIGRATIONS_DIR".to_string(),
            resource_dir.join("prisma/migrations").to_string_lossy().into_owned()),
        ("NODE_ENV".to_string(), "production".to_string()),
    ]
}

/// In production: validate and start the mandatory Next.js standalone server,
/// prove it is reachable, and only then start the optional WhatsApp sidecar.
/// A missing resource, missing runtime, spawn failure, or readiness timeout is
/// returned to Tauri setup so the desktop cannot enter a partial-ready state.
///
/// T-S2: every spawn receives the shared `child_env` so DATABASE_URL,
/// SF_DATA_DIR, SIDECAR_TOKEN, etc. resolve correctly inside the children.
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
    // T-S5: prefer the bundled Bun runtime (resource_dir/runtime/bun), then
    // PATH `bun`, then PATH `node`. End users are Algerian COD sellers who
    // will NOT have Bun/Node installed — the installer must bundle it.
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
    let mut cmd = app.shell().command(runtime_arg).arg(server_path.clone());
    for (key, value) in &env {
        cmd = cmd.env(key, value);
    }

    let (_rx, server_child) = cmd.spawn().map_err(|error| {
        IoError::new(
            ErrorKind::Other,
            format!("failed to spawn the Next.js standalone server: {error}"),
        )
    })?;
    eprintln!(
        "[sahelflow] Next.js server spawned with {runtime} → http://localhost:3000"
    );

    // Wait for the server port to open (max ~60s).
    // T-M8: bumped from 15s to 60s — cold starts can spend 30-45s downloading
    // the Prisma query engine binary on first launch, which exceeded the old
    // 15s budget and caused false-negative "server failed" fallbacks.
    let reachable = wait_for_port("127.0.0.1", 3000, Duration::from_secs(60));
    if !reachable {
        let _ = server_child.kill();
        eprintln!("[sahelflow] SERVER FAILED TO START. Diagnostic page:\n{}", SERVER_FAILED_HTML);
        return Err(IoError::new(
            ErrorKind::TimedOut,
            "the mandatory local server did not become ready within 60 seconds",
        )
        .into());
    }

    // Store the proven-ready server handle so the RunEvent loop can kill it on exit.
    match app.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        Some(state) => match state.lock() {
            Ok(mut children) => {
                children.server = Some(server_child);
            }
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

    // WhatsApp is currently a degradable capability. Start it only after the
    // mandatory application server has proven ready, so a failed shell launch
    // cannot leave an orphan sidecar behind.
    spawn_sidecar_and_watch(app.handle().clone(), env);

    Ok(())
}

/// W2-2: spawn the WhatsApp sidecar and watch its event stream. On
/// `CommandEvent::Terminated`, schedule a respawn with backoff (5s, 15s, 60s,
/// max 3 attempts). Resets the attempt counter if the sidecar ran for >60s
/// before crashing. Extracted from `spawn_services` so the same logic can be
/// invoked for the initial spawn AND for respawns.
#[cfg(not(debug_assertions))]
fn spawn_sidecar_and_watch(app_handle: tauri::AppHandle, env: Vec<(String, String)>) {
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_shell::process::CommandEvent;

    let mut cmd = match app_handle.shell().sidecar(SIDECAR_NAME) {
        Ok(cmd) => cmd,
        Err(e) => {
            eprintln!(
                "[sahelflow] WhatsApp sidecar binary not found (inbox falls back to demo mode): {e}"
            );
            return;
        }
    };
    // Apply the shared env vars to the sidecar spawn (T-S2).
    for (k, v) in &env {
        cmd = cmd.env(k, v);
    }
    let (mut rx, child) = match cmd.spawn() {
        Ok(spawned) => spawned,
        Err(e) => {
            eprintln!("[sahelflow] failed to spawn WhatsApp sidecar: {e}");
            return;
        }
    };

    eprintln!("[sahelflow] WhatsApp sidecar spawned on port 3001");

    // Store the child handle so the RunEvent loop can kill it on exit (T-S4).
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            children.sidecar = Some(child);
        }
    }
    // Record the spawn time so schedule_sidecar_respawn can reset the backoff
    // counter if the sidecar runs successfully for >60s before crashing (W2-2).
    if let Some(state) = app_handle.try_state::<std::sync::Mutex<SidecarRespawnState>>() {
        if let Ok(mut s) = state.lock() {
            s.last_spawn = Instant::now();
        }
    }

    // Clone env + app_handle for the respawn logic that runs on Terminated.
    // (The Terminated event fires once, then rx returns None and the loop exits.)
    let env_for_respawn = env.clone();
    let app_handle_for_watch = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    eprintln!("[whatsapp] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[whatsapp] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[whatsapp] terminated: {payload:?}");
                    // W2-2: schedule a respawn with backoff.
                    schedule_sidecar_respawn(app_handle_for_watch.clone(), env_for_respawn.clone());
                }
                _ => {}
            }
        }
    });
}

/// W2-2: decide whether to respawn the sidecar after it terminated, and
/// schedule the respawn with backoff (5s → 15s → 60s, max 3 attempts within a
/// 60s window). The respawn delay runs on a bare `std::thread` (not tokio)
/// because the `tokio::time` module isn't a direct dependency — `std::thread`
/// is always available and the sleep is non-blocking to the rest of the app.
/// The thread exits immediately after triggering the respawn.
#[cfg(not(debug_assertions))]
fn schedule_sidecar_respawn(app_handle: tauri::AppHandle, env: Vec<(String, String)>) {
    use tauri::Manager;

    const MAX_ATTEMPTS: u8 = 3;
    const RESET_THRESHOLD_SECS: u64 = 60;

    // Determine how long the sidecar was alive. If >=60s, reset the attempt
    // counter — a sidecar that ran successfully for a while shouldn't be
    // penalized for an occasional crash by being refused respawn.
    let (alive_secs, next_attempt) =
        if let Some(state) = app_handle.try_state::<std::sync::Mutex<SidecarRespawnState>>() {
            if let Ok(mut s) = state.lock() {
                let alive = s.last_spawn.elapsed().as_secs();
                if alive >= RESET_THRESHOLD_SECS {
                    s.attempts = 0;
                }
                s.attempts = s.attempts.saturating_add(1);
                (alive, s.attempts)
            } else {
                (0u64, 1u8)
            }
        } else {
            (0u64, 1u8)
        };

    if next_attempt > MAX_ATTEMPTS {
        eprintln!(
            "[sahelflow] CRITICAL: WhatsApp sidecar crashed {} times within {}s — giving up. \
             Inbox will stay offline until the app is restarted.",
            next_attempt, RESET_THRESHOLD_SECS
        );
        return;
    }

    let delay_secs = match next_attempt {
        1 => 5u64,
        2 => 15u64,
        3 => 60u64,
        _ => 60u64,
    };
    let reset_note = if alive_secs >= RESET_THRESHOLD_SECS {
        " (counter reset — was alive ≥60s)"
    } else {
        ""
    };
    eprintln!(
        "[sahelflow] WhatsApp sidecar crashed (alive for {}s{}) — respawning in {}s \
         (attempt {}/{})",
        alive_secs, reset_note, delay_secs, next_attempt, MAX_ATTEMPTS
    );

    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(delay_secs));
        eprintln!(
            "[sahelflow] respawning WhatsApp sidecar (attempt {}/{})...",
            next_attempt, MAX_ATTEMPTS
        );
        spawn_sidecar_and_watch(app_handle, env);
    });
}

#[cfg(not(debug_assertions))]
fn which_exists(cmd: &str) -> bool {
    // T-M1: use the `which` crate instead of `cmd --version` probing.
    // The old probe produced false negatives when the binary existed on PATH
    // but rejected `--version` (some shims/launchers exit non-zero on unknown
    // args), and also spawned a subprocess each call. `which::which` does a
    // pure PATH lookup + executable-bit check — no spawn, no false negatives.
    which::which(cmd).is_ok()
}


/// T-S5: resolve the Bun runtime to use for spawning the migration script +
/// Next.js server. Prefers a Bun binary bundled as a Tauri resource
/// (`<resource_dir>/runtime/bun[.exe]`) so end users do NOT need Bun or Node
/// installed on their machine. Falls back to PATH `bun`, then PATH `node`.
#[cfg(not(debug_assertions))]
fn bundled_bun(resource_dir: &std::path::Path) -> Option<String> {
    let exe = if cfg!(target_os = "windows") { "bun.exe" } else { "bun" };
    let candidate = resource_dir.join("runtime").join(exe);
    if candidate.exists() {
        return Some(candidate.to_string_lossy().into_owned());
    }
    None
}

#[cfg(not(debug_assertions))]
fn wait_for_port(host: &str, port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    let addr = format!("{host}:{port}");
    while start.elapsed() < timeout {
        if TcpStream::connect(&addr).is_ok() {
            eprintln!("[sahelflow] Next.js server is reachable at http://localhost:{port}");
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    eprintln!("[sahelflow] Next.js server did not open port {port} within {timeout:?}");
    false
}

/// Diagnostic HTML retained in startup logs when the mandatory Next.js server
/// fails readiness. The desktop now fails closed instead of opening a blank or
/// partial-ready shell; a later wave will surface the same state in a dedicated
/// seller-visible recovery window.
#[cfg(not(debug_assertions))]
const SERVER_FAILED_HTML: &str = r#"<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>SahelFlow — Server Failed</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a1a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.box{max-width:520px;padding:2rem}h1{color:#f87171;font-size:1.4rem}p{line-height:1.5;color:#a3a3a3}</style>
</head><body><div class="box"><h1>⚠️ SahelFlow n'a pas pu démarrer</h1>
<p>The internal server failed to start. This is usually a corrupted install.</p>
<p>Please reinstall SahelFlow. If the problem persists, contact support.</p>
</div></body></html>"#;
