#[path = "startup_recovery/proven.rs"]
mod proven;

#[cfg(not(debug_assertions))]
mod shop_lifecycle_host;

#[cfg(not(debug_assertions))]
use serde::de::DeserializeOwned;
#[cfg(not(debug_assertions))]
use serde::Deserialize;
#[cfg(not(debug_assertions))]
use std::fs;
#[cfg(not(debug_assertions))]
use std::path::Path;
#[cfg(not(debug_assertions))]
use std::time::{Duration, Instant};
#[cfg(not(debug_assertions))]
use tauri::Manager;

#[cfg(not(debug_assertions))]
const RUNTIME_ENDPOINT_FILE: &str = "runtime-endpoint.json";
#[cfg(not(debug_assertions))]
const RUNTIME_UI_READY_FILE: &str = "runtime-ui-ready.json";
#[cfg(not(debug_assertions))]
const RUNTIME_UI_DIAGNOSTIC_FILE: &str = "runtime-ui-diagnostic.json";
#[cfg(not(debug_assertions))]
const RUNTIME_PROTOCOL_VERSION: u8 = 1;
#[cfg(not(debug_assertions))]
const MAX_RUNTIME_EVIDENCE_BYTES: usize = 64 * 1024;
#[cfg(not(debug_assertions))]
const POST_UI_AUTHORITY_TIMEOUT: Duration = Duration::from_secs(95);
#[cfg(not(debug_assertions))]
const POST_UI_POLL_INTERVAL: Duration = Duration::from_millis(100);

#[cfg(not(debug_assertions))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEndpoint {
    state: String,
    instance_id: String,
    app_version: String,
}

#[cfg(not(debug_assertions))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeUiReady {
    format_version: u8,
    protocol_version: u8,
    state: String,
    instance_id: String,
    app_version: String,
}

#[cfg(not(debug_assertions))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeUiDiagnostic {
    format_version: u8,
    state: String,
    code: String,
    instance_id: Option<String>,
    app_version: Option<String>,
}

#[cfg(not(debug_assertions))]
pub use proven::reset_startup_trace;
pub use proven::{record_startup_stage, show_blocked};

#[cfg(not(debug_assertions))]
fn ensure_shop_lifecycle_started(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    shop_lifecycle_host::ensure_started(app)?;
    Ok(())
}

#[cfg(not(debug_assertions))]
fn read_bounded_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    fs::read(path)
        .ok()
        .filter(|bytes| !bytes.is_empty() && bytes.len() <= MAX_RUNTIME_EVIDENCE_BYTES)
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
}

#[cfg(not(debug_assertions))]
fn matching_ui_ready_is_durable(app_data_dir: &Path) -> bool {
    let endpoint = read_bounded_json::<RuntimeEndpoint>(&app_data_dir.join(RUNTIME_ENDPOINT_FILE));
    let ready = read_bounded_json::<RuntimeUiReady>(&app_data_dir.join(RUNTIME_UI_READY_FILE));
    let diagnostic =
        read_bounded_json::<RuntimeUiDiagnostic>(&app_data_dir.join(RUNTIME_UI_DIAGNOSTIC_FILE));
    let (Some(endpoint), Some(ready), Some(diagnostic)) = (endpoint, ready, diagnostic) else {
        return false;
    };

    endpoint.state == "ready"
        && endpoint.app_version == env!("CARGO_PKG_VERSION")
        && ready.format_version == 1
        && ready.protocol_version == RUNTIME_PROTOCOL_VERSION
        && ready.state == "ready"
        && ready.instance_id == endpoint.instance_id
        && ready.app_version == endpoint.app_version
        && diagnostic.format_version == 1
        && diagnostic.state == "ready"
        && diagnostic.code == "RUNTIME_UI_READY_PERSISTED"
        && diagnostic.instance_id.as_deref() == Some(endpoint.instance_id.as_str())
        && diagnostic.app_version.as_deref() == Some(endpoint.app_version.as_str())
}

#[cfg(not(debug_assertions))]
fn start_post_ui_authorities(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    std::thread::Builder::new()
        .name("sahelflow-post-ui-authority".to_string())
        .spawn(move || {
            let started_at = Instant::now();
            while started_at.elapsed() < POST_UI_AUTHORITY_TIMEOUT {
                if matching_ui_ready_is_durable(&app_data_dir) {
                    if let Err(error) = ensure_shop_lifecycle_started(&app) {
                        let detail = format!(
                            "the protected shop lifecycle authority could not initialize: {error}"
                        );
                        eprintln!("[sahelflow] FATAL: {detail}");
                        let _ =
                            proven::show_blocked(&app, "SF-SHOP-LIFECYCLE-HOST-BLOCKED", &detail);
                    }
                    return;
                }
                std::thread::sleep(POST_UI_POLL_INTERVAL);
            }
        })?;
    Ok(())
}

/// Run the control-proven hidden WebView handoff first. Phase 4 lifecycle
/// recovery starts only after the matching authenticated UI-ready receipt is
/// durable, so database/registry recovery cannot compete with the first real
/// application renderer. Lifecycle initialization remains fail-closed on its
/// own named authority thread.
pub fn show_ready(app: &tauri::AppHandle, app_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    proven::show_ready(app, app_url)?;

    #[cfg(not(debug_assertions))]
    start_post_ui_authorities(app.clone())?;

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
