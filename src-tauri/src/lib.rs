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
use std::net::TcpStream;
#[cfg(not(debug_assertions))]
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

    "DEV-MOCK-MACHINE-ID-FALLBACK".to_string()
}

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
            // Only spawn services in release builds. In dev, the user runs
            // `bun run dev` + `bun run sidecar` manually (hot reload).
            #[cfg(not(debug_assertions))]
            {
                // Wave 2: Run Prisma migrations BEFORE spawning Next.js.
                // Ensures the user's SQLite schema is up-to-date on every
                // app launch. Uses bun to run scripts/run-migrations.ts.
                // Non-fatal — the app may still work if schema hasn't changed.
                let db_path = _app.path().app_data_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("shops/dev.db");
                let migration_result = std::process::Command::new("bun")
                    .arg("scripts/run-migrations.ts")
                    .env("DATABASE_URL", format!("file:{}", db_path.display()))
                    .output();
                match migration_result {
                    Ok(output) if output.status.success() => {
                        eprintln!("[sahelflow] Migrations applied successfully");
                    }
                    Ok(output) => {
                        eprintln!("[sahelflow] Migration warning: {}",
                            String::from_utf8_lossy(&output.stderr));
                    }
                    Err(e) => {
                        eprintln!("[sahelflow] Could not run migrations: {}", e);
                    }
                }

                if let Err(e) = spawn_services(_app) {
                    eprintln!("[sahelflow] service spawn error: {e}");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SahelFlow application");
}

/// In production: spawn the WhatsApp sidecar + the Next.js standalone server,
/// then wait for the server port to open before the webview loads.
#[cfg(not(debug_assertions))]
fn spawn_services(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_shell::process::CommandEvent;

    // 1. WhatsApp sidecar (compiled externalBin: sahelflow-whatsapp)
    match app.shell().sidecar("sahelflow-whatsapp") {
        Ok(cmd) => match cmd.spawn() {
            Ok((mut rx, _child)) => {
                eprintln!("[sahelflow] WhatsApp sidecar spawned on port 3001");
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
                            }
                            _ => {}
                        }
                    }
                });
            }
            Err(e) => eprintln!("[sahelflow] failed to spawn WhatsApp sidecar: {e}"),
        },
        Err(e) => eprintln!(
            "[sahelflow] WhatsApp sidecar binary not found (inbox falls back to demo mode): {e}"
        ),
    }

    // 2. Next.js standalone server (from bundled resources).
    let resource_dir = app.path().resource_dir()?;
    let server_js = resource_dir.join("standalone").join("server.js");

    if !server_js.exists() {
        eprintln!(
            "[sahelflow] Next.js standalone server not found at {}. Run `bun run build` first.",
            server_js.display()
        );
        return Ok(());
    }

    let server_path = server_js.to_string_lossy().into_owned();
    let spawn_result = if which_exists("bun") {
        app.shell().command("bun", &[server_path]).spawn()
    } else if which_exists("node") {
        app.shell().command("node", &[server_path]).spawn()
    } else {
        eprintln!(
            "[sahelflow] Neither `bun` nor `node` found on PATH. Install Bun or Node.js 20+."
        );
        return Ok(());
    };

    match spawn_result {
        Ok((_rx, _child)) => {
            eprintln!("[sahelflow] Next.js server spawned → http://localhost:3000");
        }
        Err(e) => eprintln!("[sahelflow] failed to spawn Next.js server: {e}"),
    }

    // Wait for the server port to open (max ~15s)
    wait_for_port("127.0.0.1", 3000, Duration::from_secs(15));

    Ok(())
}

#[cfg(not(debug_assertions))]
fn which_exists(cmd: &str) -> bool {
    std::process::Command::new(cmd)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}

#[cfg(not(debug_assertions))]
fn wait_for_port(host: &str, port: u16, timeout: Duration) {
    let start = Instant::now();
    let addr = format!("{host}:{port}");
    while start.elapsed() < timeout {
        if TcpStream::connect(&addr).is_ok() {
            eprintln!("[sahelflow] Next.js server is reachable at http://localhost:{port}");
            return;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    eprintln!("[sahelflow] Next.js server did not open port {port} within {timeout:?}");
}
