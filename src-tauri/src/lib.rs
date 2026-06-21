// SahelFlow Tauri library entry.
//
// The desktop shell wraps the Next.js webview and manages:
//   - Baileys WhatsApp sidecar (Phase 0 item #1) — compiled binary, spawned on launch
//   - Next.js standalone server — spawned on launch (production only)
//   - OS keychain access for secrets (future: tauri-plugin-stronghold)
//   - Auto-updater (signed GitHub Releases)
//   - License validation on launch (Phase 0 item #4)
//   - SQLite file management (multi-shop)
//
// Dev vs production:
//   - `tauri dev`: the user runs `bun run dev` + `bun run sidecar` manually.
//     This hook does nothing (cfg!(debug_assertions) is true) — preserves the
//     existing hot-reload workflow.
//   - `tauri build` (release): this hook spawns the compiled WhatsApp sidecar
//     (externalBin) and the Next.js standalone server (bundled resource),
//     waits for the server port to open, then the webview loads
//     http://localhost:3000.

use std::net::TcpStream;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Only spawn services in release builds. In dev, the user runs
            // `bun run dev` + `bun run sidecar` manually (hot reload).
            #[cfg(not(debug_assertions))]
            {
                if let Err(e) = spawn_services(app) {
                    eprintln!("[sahelflow] service spawn error: {e}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Tauri commands registered here as features are built
        ])
        .run(tauri::generate_context!())
        .expect("error while running SahelFlow application");
}

/// In production: spawn the WhatsApp sidecar + the Next.js standalone server,
/// then wait for the server port to open before the webview loads.
#[cfg(not(debug_assertions))]
fn spawn_services(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // 1. WhatsApp sidecar (compiled externalBin: sahelflow-whatsapp)
    match app.shell().sidecar("sahelflow-whatsapp") {
        Ok(cmd) => match cmd.spawn() {
            Ok((mut rx, _child)) => {
                eprintln!("[sahelflow] WhatsApp sidecar spawned on port 3001");
                // Drain sidecar output to stderr (for debugging)
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
    //    Requires `bun` (preferred) or `node` on PATH. The standalone
    //    server.js lives at <resource_dir>/standalone/server.js.
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
            "[sahelflow] Neither `bun` nor `node` found on PATH. Install Bun (https://bun.sh) \
             or Node.js 20+ so the Next.js server can start."
        );
        return Ok(());
    };

    match spawn_result {
        Ok((_rx, _child)) => {
            eprintln!("[sahelflow] Next.js server spawned → http://localhost:3000");
        }
        Err(e) => eprintln!("[sahelflow] failed to spawn Next.js server: {e}"),
    }

    // Wait for the server port to open (max ~15s) so the webview doesn't
    // load before it's ready.
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
