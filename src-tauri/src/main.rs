// SahelFlow Tauri entry point.
// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod backup_recovery;
mod installation_identity_rebind;
mod installation_root_key;
mod key_hierarchy;
mod native_command;
mod native_crypto;
mod protected_key_transport;
mod survivability_bridge;
mod survivability_controller;

fn main() {
    #[cfg(not(debug_assertions))]
    {
        let rotation_invocation =
            std::env::args_os().any(|argument| argument == "--rotate-installation-root");
        if rotation_invocation {
            if survivability_controller::pending_restore_present().unwrap_or(true) {
                eprintln!(
                    "[sahelflow] installation-root rotation is blocked by pending replacement recovery"
                );
                std::process::exit(1);
            }
            sahelflow_lib::run();
            return;
        }

        if let Err(error) = survivability_controller::recover_pending_before_run() {
            eprintln!(
                "[sahelflow] protected replacement restore blocked ({})",
                error.kind()
            );
            std::process::exit(1);
        }
        let controller = match survivability_controller::SurvivabilityController::start() {
            Ok(controller) => controller,
            Err(error) => {
                eprintln!(
                    "[sahelflow] survivability controller could not start ({})",
                    error.kind()
                );
                std::process::exit(1);
            }
        };
        sahelflow_lib::run();
        drop(controller);
        return;
    }

    #[cfg(debug_assertions)]
    sahelflow_lib::run();
}
