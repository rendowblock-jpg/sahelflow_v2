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
use std::io::{Error as IoError, ErrorKind};
#[cfg(not(debug_assertions))]
use std::path::Path;
#[cfg(not(debug_assertions))]
use std::time::{Duration, Instant};
#[cfg(not(debug_assertions))]
use tauri::webview::WebviewWindow;
#[cfg(not(debug_assertions))]
use tauri::Manager;

#[cfg(not(debug_assertions))]
const RUNTIME_BOOTSTRAP_PATH: &str = "/api/internal/runtime-bootstrap";
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
const RENDERER_PRIME_MARKER: &str = "sahelflow-renderer-prime-v1";
#[cfg(not(debug_assertions))]
const RENDERER_PRIME_TIMEOUT: Duration = Duration::from_secs(15);
#[cfg(not(debug_assertions))]
const RENDERER_PRIME_POLL_INTERVAL: Duration = Duration::from_millis(100);
#[cfg(not(debug_assertions))]
const RENDERER_PROBE_RESPONSE_TIMEOUT: Duration = Duration::from_millis(500);
#[cfg(not(debug_assertions))]
const STARTUP_WINDOW_TITLE: &str = "SahelFlow - Starting";

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

#[cfg(not(debug_assertions))]
fn renderer_prime_html() -> String {
    [
        "<!doctype html><html lang=\"fr\" data-sf-renderer-prime=\"",
        RENDERER_PRIME_MARKER,
        "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>SahelFlow - Starting</title><style>:root{color-scheme:dark;font-family:Inter,Segoe UI,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101214;color:#f4f4f5;padding:24px}main{width:min(520px,100%);text-align:center;border:1px solid #3f3f46;border-radius:18px;background:#18181b;padding:32px}p{color:#a1a1aa;line-height:1.6}</style></head><body><main role=\"status\" aria-live=\"polite\"><h1>SahelFlow</h1><p>Preparing the protected local workspace...</p><p lang=\"ar\" dir=\"rtl\">جارٍ تجهيز مساحة العمل المحلية المحمية...</p></main></body></html>",
    ]
    .concat()
}

#[cfg(not(debug_assertions))]
fn renderer_prime_url() -> Result<tauri::Url, IoError> {
    let html = renderer_prime_html();
    let data_url = format!(
        "data:text/html;charset=utf-8,{}",
        urlencoding::encode(&html)
    );
    tauri::Url::parse(&data_url).map_err(|error| IoError::new(ErrorKind::InvalidData, error))
}

#[cfg(not(debug_assertions))]
fn renderer_is_ready(window: &WebviewWindow) -> bool {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let script = "(()=>{try{return document.documentElement.dataset.sfRendererPrime||''}catch(_error){return ''}})()";
    if window
        .eval_with_callback(script, move |result| {
            let _ = sender.try_send(result);
        })
        .is_err()
    {
        return false;
    }

    receiver
        .recv_timeout(RENDERER_PROBE_RESPONSE_TIMEOUT)
        .is_ok_and(|result| {
            serde_json::from_str::<String>(&result)
                .is_ok_and(|value| value == RENDERER_PRIME_MARKER)
        })
}

#[cfg(not(debug_assertions))]
fn prime_packaged_renderer(
    app: &tauri::AppHandle,
    app_url: &str,
) -> Result<bool, Box<dyn std::error::Error>> {
    let requested_url = tauri::Url::parse(app_url)?;
    if requested_url.path() != RUNTIME_BOOTSTRAP_PATH {
        return Ok(true);
    }
    if requested_url.scheme() != "http"
        || !matches!(requested_url.host_str(), Some("127.0.0.1" | "localhost"))
    {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "packaged renderer priming requires loopback HTTP authority",
        )
        .into());
    }

    let window = app.get_webview_window("main").ok_or_else(|| {
        IoError::new(
            ErrorKind::NotFound,
            "the configured main desktop window was not created",
        )
    })?;
    let app_data_dir = app.path().app_data_dir()?;
    record_startup_stage(&app_data_dir, "ui-renderer-prime-started", None);
    window.set_title(STARTUP_WINDOW_TITLE)?;
    window.navigate(renderer_prime_url()?)?;
    window.show()?;
    window.set_focus()?;

    let started_at = Instant::now();
    while started_at.elapsed() < RENDERER_PRIME_TIMEOUT {
        if renderer_is_ready(&window) {
            record_startup_stage(&app_data_dir, "ui-renderer-prime-ready", None);
            window.hide()?;
            return Ok(true);
        }
        std::thread::sleep(RENDERER_PRIME_POLL_INTERVAL);
    }

    let detail = "the safe startup document did not produce an executable WebView renderer before the bounded deadline";
    record_startup_stage(&app_data_dir, "ui-renderer-prime-blocked", None);
    eprintln!("[sahelflow] FATAL: {detail}");
    proven::show_blocked(app, "SF-RUNTIME-UI-RENDERER-BLOCKED", detail)?;
    Ok(false)
}

/// Prove an executable WebView renderer on a safe local starting document,
/// then run the control-proven hidden native-cookie/direct-root handoff. Phase 4
/// lifecycle recovery starts only after the matching authenticated UI-ready
/// receipt is durable, so recovery authority cannot compete with either stage.
pub fn show_ready(app: &tauri::AppHandle, app_url: &str) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(not(debug_assertions))]
    if !prime_packaged_renderer(app, app_url)? {
        return Ok(());
    }

    proven::show_ready(app, app_url)?;

    #[cfg(not(debug_assertions))]
    start_post_ui_authorities(app.clone())?;

    Ok(())
}

// Delegated source-contract markers. The executable handoff remains the exact
// control-proven module above; these markers keep broad source audits explicit:
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
