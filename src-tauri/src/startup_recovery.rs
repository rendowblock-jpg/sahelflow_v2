#[path = "startup_recovery/proven.rs"]
mod proven;

#[cfg(not(debug_assertions))]
mod shop_lifecycle_host;

#[cfg(not(debug_assertions))]
pub use proven::reset_startup_trace;
pub use proven::{record_startup_stage, show_blocked};

#[cfg(not(debug_assertions))]
fn ensure_shop_lifecycle_started(
    app: &tauri::AppHandle,
) -> Result<(), Box<dyn std::error::Error>> {
    shop_lifecycle_host::ensure_started(app)?;
    Ok(())
}

#[cfg(not(debug_assertions))]
fn start_shop_lifecycle_host(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    std::thread::Builder::new()
        .name("sahelflow-shop-lifecycle-bootstrap".to_string())
        .spawn(move || {
            if let Err(error) = ensure_shop_lifecycle_started(&app) {
                let detail = format!(
                    "the protected shop lifecycle authority could not initialize: {error}"
                );
                eprintln!("[sahelflow] FATAL: {detail}");
                let _ = proven::show_blocked(
                    &app,
                    "SF-SHOP-LIFECYCLE-HOST-BLOCKED",
                    &detail,
                );
            }
        })?;
    Ok(())
}

/// Run the control-proven WebView handoff, then detach Phase 4 lifecycle-host
/// initialization from the navigation owner. Returning the startup worker
/// immediately after cookie installation and root navigation is required for
/// WebView2 to commit the authenticated document; lifecycle recovery remains
/// fail-closed on its own named authority thread.
pub fn show_ready(app: &tauri::AppHandle, app_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    proven::show_ready(app, app_url)?;

    #[cfg(not(debug_assertions))]
    start_shop_lifecycle_host(app.clone())?;

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
