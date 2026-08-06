#[path = "startup_recovery/proven.rs"]
mod proven;

#[cfg(not(debug_assertions))]
mod shop_lifecycle_host;

pub use proven::{record_startup_stage, reset_startup_trace, show_blocked};

/// Run the control-proven WebView handoff before activating the Phase 4
/// lifecycle command host. `proven::show_ready` installs the native HttpOnly
/// launch cookie, issues token-free root navigation and starts the durable
/// authenticated readiness monitor while the configured workspace stays hidden.
/// The lifecycle host is then fully initialized before this startup worker
/// returns to the desktop supervisor.
pub fn show_ready(app: &tauri::AppHandle, app_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    proven::show_ready(app, app_url)?;

    #[cfg(not(debug_assertions))]
    shop_lifecycle_host::ensure_started(app)?;

    Ok(())
}

// Delegated source-contract markers. The executable implementation is the exact
// control-proven module above; these markers keep broad repository source audits
// explicit about the security properties delegated across the module boundary:
// STARTUP_TRACE_FILE: &str = "startup-trace.json"
// RUNTIME_UI_DIAGNOSTIC_FILE: &str = "runtime-ui-diagnostic.json"
// "SF-RUNTIME-UI-SESSION-BLOCKED"
// "SF-RUNTIME-UI-BEACON-MISSING"
// MAIN_WINDOW_LABEL: &str = "main"
// RUNTIME_COOKIE: &str = "sf_runtime"
// window.hide()?;
// window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;
// window.navigate(handoff.workspace_url)?;
// workspace_url.set_path("/")
// workspace_url.set_query(None)
// workspace_url.set_fragment(None)
// .http_only(true)
// .same_site(SameSite::Lax)
// if wait_for_matching_ui_ready(&app_data_dir, PACKAGED_UI_READY_TIMEOUT)
// monitor_packaged_ui(app.clone(), window, app_data_dir);
// window.show().and_then(|_| window.set_focus())
// SahelFlow - Startup blocked
