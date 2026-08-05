// SahelFlow Tauri entry point.
// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The binary owns the pre-window survivability boundary. Replacement restore
// converges before the application server, Prisma, sidecars, or WebView can
// observe any live installation file.
mod backup_recovery;
mod installation_identity_rebind;
mod installation_root_key;
mod key_hierarchy;
mod native_command;
mod native_crypto;
mod protected_key_transport;
mod survivability_bridge;

fn main() {
    #[cfg(not(debug_assertions))]
    {
        let rotation_invocation =
            std::env::args_os().any(|argument| argument == "--rotate-installation-root");
        if rotation_invocation {
            if survivability_bridge::pending_restore_present().unwrap_or(true) {
                eprintln!("[sahelflow] installation-root rotation is blocked by a pending replacement restore");
                std::process::exit(1);
            }
            sahelflow_lib::run();
            return;
        }

        if survivability_bridge::recover_pending_before_run().is_err() {
            eprintln!("[sahelflow] protected replacement restore blocked");
            survivability_bridge::record_startup_failure("SF-REPLACEMENT-RESTORE-BLOCKED");
            std::process::exit(1);
        }
        let bridge = match survivability_bridge::start() {
            Ok(bridge) => bridge,
            Err(_) => {
                eprintln!("[sahelflow] protected survivability bridge unavailable");
                survivability_bridge::record_startup_failure(
                    "SF-SURVIVABILITY-BRIDGE-BLOCKED",
                );
                std::process::exit(1);
            }
        };
        sahelflow_lib::run();
        drop(bridge);
        return;
    }

    #[cfg(debug_assertions)]
    sahelflow_lib::run();
}
