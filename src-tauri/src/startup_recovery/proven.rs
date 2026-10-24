use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs::{self, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::webview::{cookie::SameSite, Cookie, WebviewWindow};
use tauri::Manager;

const RUNTIME_BOOTSTRAP_PATH: &str = "/api/internal/runtime-bootstrap";
const RUNTIME_COOKIE: &str = "sf_runtime";
const RUNTIME_ENDPOINT_FILE: &str = "runtime-endpoint.json";
const RUNTIME_UI_READY_FILE: &str = "runtime-ui-ready.json";
const RUNTIME_UI_DIAGNOSTIC_FILE: &str = "runtime-ui-diagnostic.json";
const STARTUP_DIAGNOSTIC_FILE: &str = "startup-diagnostic.json";
const STARTUP_TRACE_FILE: &str = "startup-trace.json";
const MAIN_WINDOW_LABEL: &str = "main";
const MAIN_WINDOW_TITLE: &str = "SahelFlow";
const BLOCKED_WINDOW_TITLE: &str = "SahelFlow - Startup blocked";
const PACKAGED_UI_READY_TIMEOUT: Duration = Duration::from_secs(90);
const UI_READY_POLL_INTERVAL: Duration = Duration::from_millis(100);
const WORKSPACE_WINDOW_WAIT: Duration = Duration::from_secs(30);
const RUNTIME_PROTOCOL_VERSION: u8 = 1;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupDiagnostic<'a> {
    state: &'static str,
    code: &'a str,
    detail: &'a str,
    app_version: &'static str,
    created_at_unix_seconds: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEndpoint {
    state: String,
    instance_id: String,
    app_version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeUiReady {
    format_version: u8,
    protocol_version: u8,
    state: String,
    instance_id: String,
    app_version: String,
    page_url: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupTrace {
    format_version: u8,
    app_version: String,
    events: Vec<StartupTraceEvent>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupTraceEvent {
    stage: String,
    attempt: Option<u8>,
    created_at_unix_milliseconds: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeUiDiagnostic {
    format_version: u8,
    state: String,
    code: String,
    attempt: u64,
    instance_id: Option<String>,
    app_version: Option<String>,
}

struct PackagedHandoff {
    workspace_url: tauri::Url,
    host: String,
    token: String,
}

/// Navigate the configured WebView to a ready application.
///
/// Development URLs are shown immediately. A packaged bootstrap URL is never
/// loaded into the WebView: the per-launch credential is extracted in Rust,
/// injected into the native cookie store, and removed from browser navigation.
/// The hidden window is shown only after a hydrated page reports an authenticated
/// UI acknowledgment matching the current runtime endpoint instance.
pub fn show_ready(app: &tauri::AppHandle, app_url: &str) -> Result<(), Box<dyn Error>> {
    let requested_url = tauri::Url::parse(app_url)?;
    let window = workspace_window(app)?;
    window.set_title(MAIN_WINDOW_TITLE)?;

    let Some(handoff) = packaged_handoff(&requested_url)? else {
        window.navigate(requested_url)?;
        maximize_before_show(&window);
        window.show()?;
        window.set_focus()?;
        return Ok(());
    };

    let app_data_dir = app.path().app_data_dir()?;
    clear_file(&app_data_dir.join(RUNTIME_UI_READY_FILE))?;
    clear_file(&app_data_dir.join(RUNTIME_UI_DIAGNOSTIC_FILE))?;
    clear_file(&app_data_dir.join(STARTUP_DIAGNOSTIC_FILE))?;
    record_startup_stage(&app_data_dir, "ui-navigation-started", None);

    window.hide()?;
    window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;
    window.navigate(handoff.workspace_url)?;

    monitor_packaged_ui(app.clone(), window, app_data_dir);
    Ok(())
}

/// The single configured workspace window. It is built on the main thread
/// right after the startup thread begins, so WebView2 initialization overlaps
/// migration and runtime startup; a startup thread that is faster than that
/// waits here briefly instead of failing.
fn workspace_window(app: &tauri::AppHandle) -> Result<WebviewWindow, IoError> {
    let deadline = Instant::now() + WORKSPACE_WINDOW_WAIT;
    loop {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            return Ok(window);
        }
        if Instant::now() >= deadline {
            return Err(IoError::new(
                ErrorKind::NotFound,
                "the configured main desktop window was not created",
            ));
        }
        thread::sleep(Duration::from_millis(25));
    }
}

pub fn reset_startup_trace(app_data_dir: &Path) {
    let _guard = TRACE_WRITE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let trace = StartupTrace {
        format_version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        events: vec![StartupTraceEvent {
            stage: "native-started".to_string(),
            attempt: None,
            created_at_unix_milliseconds: unix_milliseconds(),
        }],
    };
    let _ = write_startup_trace(app_data_dir, &trace);
}

pub fn record_startup_stage(app_data_dir: &Path, stage: &str, attempt: Option<u8>) {
    record_startup_stage_at(app_data_dir, stage, attempt, unix_milliseconds());
}

/// Several threads record stages during startup (the startup thread, the
/// main thread's window creation, the launch-splash follower); one lock keeps
/// their read-modify-write of the trace from losing events.
static TRACE_WRITE: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Record a stage that happened at `at_unix_ms`, kept in chronological order
/// (process start and the first splash paint happen before the trace reset).
pub fn record_startup_stage_at(
    app_data_dir: &Path,
    stage: &str,
    attempt: Option<u8>,
    at_unix_ms: u64,
) {
    if stage.is_empty()
        || stage.len() > 64
        || !stage
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return;
    }
    let _guard = TRACE_WRITE
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let path = app_data_dir.join(STARTUP_TRACE_FILE);
    let mut trace = fs::read(&path)
        .ok()
        .filter(|bytes| bytes.len() <= 64 * 1024)
        .and_then(|bytes| serde_json::from_slice::<StartupTrace>(&bytes).ok())
        .filter(|trace| trace.format_version == 1 && trace.app_version == env!("CARGO_PKG_VERSION"))
        .unwrap_or_else(|| StartupTrace {
            format_version: 1,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            events: Vec::new(),
        });
    if trace.events.len() >= 32 {
        return;
    }
    let position = trace
        .events
        .iter()
        .position(|event| event.created_at_unix_milliseconds > at_unix_ms)
        .unwrap_or(trace.events.len());
    trace.events.insert(
        position,
        StartupTraceEvent {
            stage: stage.to_string(),
            attempt,
            created_at_unix_milliseconds: at_unix_ms,
        },
    );
    let _ = write_startup_trace(app_data_dir, &trace);
}

fn write_startup_trace(app_data_dir: &Path, trace: &StartupTrace) -> Result<(), IoError> {
    fs::create_dir_all(app_data_dir)?;
    let path = app_data_dir.join(STARTUP_TRACE_FILE);
    let temporary_path = app_data_dir.join("startup-trace.json.tmp");
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temporary_path)?;
    serde_json::to_writer_pretty(&mut file, trace)
        .map_err(|error| IoError::new(ErrorKind::InvalidData, error))?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    if path.exists() {
        fs::remove_file(&path)?;
    }
    fs::rename(temporary_path, path)
}

fn unix_milliseconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn packaged_handoff(url: &tauri::Url) -> Result<Option<PackagedHandoff>, IoError> {
    if url.path() != RUNTIME_BOOTSTRAP_PATH {
        return Ok(None);
    }
    if url.scheme() != "http" {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "packaged runtime bootstrap must use loopback HTTP",
        ));
    }
    let host = url.host_str().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidInput,
            "packaged runtime bootstrap URL has no host",
        )
    })?;
    if host != "127.0.0.1" && host != "localhost" {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "packaged runtime bootstrap host is not loopback",
        ));
    }

    let token = url
        .query_pairs()
        .find_map(|(name, value)| (name == "token").then(|| value.into_owned()))
        .ok_or_else(|| {
            IoError::new(
                ErrorKind::PermissionDenied,
                "packaged runtime bootstrap credential is missing",
            )
        })?;
    if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "packaged runtime bootstrap credential is malformed",
        ));
    }

    let mut workspace_url = url.clone();
    workspace_url.set_path("/");
    workspace_url.set_query(None);
    workspace_url.set_fragment(None);

    Ok(Some(PackagedHandoff {
        workspace_url,
        host: host.to_string(),
        token,
    }))
}

fn runtime_cookie(host: &str, token: &str) -> Result<Cookie<'static>, IoError> {
    if host != "127.0.0.1" && host != "localhost" {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "runtime cookie host is not loopback",
        ));
    }
    if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "runtime cookie credential is malformed",
        ));
    }

    // The initial workspace load is a top-level navigation from Tauri's
    // configured data: document. Lax sends the host-scoped cookie on that GET
    // while still withholding it from cross-site state-changing requests.
    Ok(
        Cookie::build((RUNTIME_COOKIE.to_string(), token.to_string()))
            .domain(host.to_string())
            .path("/")
            .http_only(true)
            .same_site(SameSite::Lax)
            .secure(false)
            .build(),
    )
}

/// The workspace window is configured hidden and *not* maximized (see
/// `tauri.conf.json`). tao 0.35 applies `ShowWindow(SW_MAXIMIZE)` to a hidden
/// window whose maximized flag is set, so a window created (or flagged)
/// maximized while hidden is briefly visible long before the authenticated UI
/// is ready; tao 0.37.0 fixed this upstream (tauri-apps/tao#1306). Maximize
/// only here, immediately before a show that is already authorized, and never
/// let a failed maximize block showing the workspace.
fn maximize_before_show(window: &WebviewWindow) {
    if let Err(error) = window.maximize() {
        eprintln!(
            "[sahelflow] the workspace window could not be maximized before it was shown: {error}"
        );
    }
}

/// A bounded retry schedule: `attempts` tries in total, waiting `first_delay`
/// after the first failure and doubling the wait up to `max_delay`.
#[derive(Clone, Copy)]
struct Backoff {
    attempts: u8,
    first_delay: Duration,
    max_delay: Duration,
}

/// Showing the workspace window sends a message to the WebView. Right after a
/// quick close and reopen (or a protected-key rotation relaunch) that message
/// can fail for a moment ("failed to send message to the webview") while the
/// previous instance's WebView is still going down. 8 tries over about 4.5 s
/// (100, 200, 400, 800, then 1000 ms waits) ride that out; a permanent failure
/// still ends in SF-WINDOW-SHOW-BLOCKED.
const WINDOW_SHOW_BACKOFF: Backoff = Backoff {
    attempts: 8,
    first_delay: Duration::from_millis(100),
    max_delay: Duration::from_secs(1),
};

/// Run `operation` (given the 1-based attempt number) until it succeeds or the
/// attempts are used up. `on_failure` sees every failed attempt, `sleep` is the
/// wait between attempts (never after the last one). Returns the number of
/// attempts made with the final result; on exhaustion that is the LAST error.
fn retry_with_backoff<T, E>(
    backoff: Backoff,
    mut operation: impl FnMut(u8) -> Result<T, E>,
    mut on_failure: impl FnMut(u8, &E),
    mut sleep: impl FnMut(Duration),
) -> (u8, Result<T, E>) {
    let attempts = backoff.attempts.max(1);
    let mut delay = backoff.first_delay.min(backoff.max_delay);
    let mut attempt = 1;
    loop {
        match operation(attempt) {
            Ok(value) => return (attempt, Ok(value)),
            Err(error) => {
                on_failure(attempt, &error);
                if attempt >= attempts {
                    return (attempt, Err(error));
                }
                sleep(delay);
                delay = delay.saturating_mul(2).min(backoff.max_delay);
                attempt += 1;
            }
        }
    }
}

fn window_show_blocked_detail(attempts: u8, error: &dyn std::fmt::Display) -> String {
    format!(
        "the authenticated workspace was ready but the desktop window could not be shown: {error} (after {attempts} attempts)"
    )
}

fn monitor_packaged_ui(app: tauri::AppHandle, window: WebviewWindow, app_data_dir: PathBuf) {
    thread::spawn(move || {
        if wait_for_matching_ui_ready(&app_data_dir, PACKAGED_UI_READY_TIMEOUT) {
            record_startup_stage(&app_data_dir, "ui-ready", None);
            // The maximize is part of each attempt: if it hit the same
            // transient, the retry gives the window its size back too.
            let (attempts, shown) = retry_with_backoff(
                WINDOW_SHOW_BACKOFF,
                |_attempt| {
                    maximize_before_show(&window);
                    window.show().and_then(|_| window.set_focus())
                },
                |attempt, error| {
                    record_startup_stage(&app_data_dir, "window-show-failed", Some(attempt));
                    eprintln!(
                        "[sahelflow] the workspace window could not be shown (attempt {attempt} of {}): {error}",
                        WINDOW_SHOW_BACKOFF.attempts
                    );
                },
                thread::sleep,
            );
            if let Err(error) = shown {
                let detail = window_show_blocked_detail(attempts, &error);
                eprintln!("[sahelflow] FATAL: {detail}");
                let _ = show_blocked(&app, "SF-WINDOW-SHOW-BLOCKED", &detail);
            }
            return;
        }

        let (code, detail) = ui_ready_failure(&app_data_dir);
        record_startup_stage(&app_data_dir, "ui-blocked", None);
        eprintln!("[sahelflow] FATAL: {detail}");
        let _ = show_blocked(&app, code, &detail);
    });
}

fn ui_ready_failure(app_data_dir: &Path) -> (&'static str, String) {
    let diagnostic_path = app_data_dir.join(RUNTIME_UI_DIAGNOSTIC_FILE);
    let endpoint_path = app_data_dir.join(RUNTIME_ENDPOINT_FILE);
    let Ok(bytes) = fs::read(&diagnostic_path) else {
        return (
            "SF-RUNTIME-UI-BEACON-MISSING",
            "the desktop page did not reach the authenticated UI-ready route before the bounded startup deadline".to_string(),
        );
    };
    if bytes.len() > 64 * 1024 {
        return (
            "SF-RUNTIME-UI-DIAGNOSTIC-INVALID",
            "the UI-ready diagnostic exceeded its bounded size limit".to_string(),
        );
    }
    let Ok(diagnostic) = serde_json::from_slice::<RuntimeUiDiagnostic>(&bytes) else {
        return (
            "SF-RUNTIME-UI-DIAGNOSTIC-INVALID",
            "the UI-ready diagnostic was not valid structured evidence".to_string(),
        );
    };
    let safe_code = !diagnostic.code.is_empty()
        && diagnostic.code.len() <= 64
        && diagnostic
            .code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_');
    let safe_state = !diagnostic.state.is_empty()
        && diagnostic.state.len() <= 16
        && diagnostic
            .state
            .bytes()
            .all(|byte| byte.is_ascii_lowercase());
    if diagnostic.format_version != 1 || diagnostic.attempt == 0 || !safe_code || !safe_state {
        return (
            "SF-RUNTIME-UI-DIAGNOSTIC-INVALID",
            "the UI-ready diagnostic contained an invalid code or state".to_string(),
        );
    }
    let endpoint = fs::read(endpoint_path)
        .ok()
        .filter(|value| value.len() <= 64 * 1024)
        .and_then(|value| serde_json::from_slice::<RuntimeEndpoint>(&value).ok());
    let diagnostic_matches = endpoint.as_ref().is_some_and(|current| {
        current.state == "ready"
            && current.app_version == env!("CARGO_PKG_VERSION")
            && diagnostic.instance_id.as_deref() == Some(current.instance_id.as_str())
            && diagnostic.app_version.as_deref() == Some(env!("CARGO_PKG_VERSION"))
    });
    if !diagnostic_matches {
        return (
            "SF-RUNTIME-UI-INSTANCE-MISMATCH",
            "the UI-ready diagnostic did not bind the current runtime instance and app version"
                .to_string(),
        );
    }

    let detail = format!(
        "the UI-ready route reported {} state {} on attempt {}, but no matching durable acknowledgment was accepted",
        diagnostic.code, diagnostic.state, diagnostic.attempt
    );
    match diagnostic.code.as_str() {
        "RUNTIME_SESSION_REQUIRED" => ("SF-RUNTIME-UI-SESSION-BLOCKED", detail),
        "RUNTIME_UI_READY_UNAVAILABLE" => ("SF-RUNTIME-UI-ROUTE-BLOCKED", detail),
        "RUNTIME_UI_READY_PERSIST_FAILED" => ("SF-RUNTIME-UI-PERSIST-BLOCKED", detail),
        "RUNTIME_UI_DIAGNOSTIC_PERSIST_FAILED" => {
            ("SF-RUNTIME-UI-DIAGNOSTIC-PERSIST-BLOCKED", detail)
        }
        "RUNTIME_UI_READY_PERSISTED" => ("SF-RUNTIME-UI-ACK-MISMATCH", detail),
        "RUNTIME_UI_READY_REQUEST_RECEIVED" => ("SF-RUNTIME-UI-ACK-INCOMPLETE", detail),
        _ => ("SF-RUNTIME-UI-BLOCKED", detail),
    }
}

fn wait_for_matching_ui_ready(app_data_dir: &Path, timeout: Duration) -> bool {
    let endpoint_path = app_data_dir.join(RUNTIME_ENDPOINT_FILE);
    let ui_ready_path = app_data_dir.join(RUNTIME_UI_READY_FILE);
    let diagnostic_path = app_data_dir.join(RUNTIME_UI_DIAGNOSTIC_FILE);
    let started_at = Instant::now();

    while started_at.elapsed() < timeout {
        if matching_ui_ready(&endpoint_path, &ui_ready_path, &diagnostic_path) {
            return true;
        }
        thread::sleep(UI_READY_POLL_INTERVAL);
    }
    false
}

fn matching_ui_ready(endpoint_path: &Path, ui_ready_path: &Path, diagnostic_path: &Path) -> bool {
    let Ok(endpoint_bytes) = fs::read(endpoint_path) else {
        return false;
    };
    let Ok(ui_ready_bytes) = fs::read(ui_ready_path) else {
        return false;
    };
    let Ok(diagnostic_bytes) = fs::read(diagnostic_path) else {
        return false;
    };
    if endpoint_bytes.len() > 64 * 1024
        || ui_ready_bytes.len() > 64 * 1024
        || diagnostic_bytes.len() > 64 * 1024
    {
        return false;
    }

    let Ok(endpoint) = serde_json::from_slice::<RuntimeEndpoint>(&endpoint_bytes) else {
        return false;
    };
    let Ok(ui_ready) = serde_json::from_slice::<RuntimeUiReady>(&ui_ready_bytes) else {
        return false;
    };
    let Ok(diagnostic) = serde_json::from_slice::<RuntimeUiDiagnostic>(&diagnostic_bytes) else {
        return false;
    };

    endpoint.state == "ready"
        && endpoint.app_version == env!("CARGO_PKG_VERSION")
        && !endpoint.instance_id.is_empty()
        && ui_ready.format_version == 1
        && ui_ready.protocol_version == RUNTIME_PROTOCOL_VERSION
        && ui_ready.state == "ready"
        && ui_ready.app_version == env!("CARGO_PKG_VERSION")
        && ui_ready.instance_id == endpoint.instance_id
        && diagnostic.format_version == 1
        && diagnostic.state == "ready"
        && diagnostic.code == "RUNTIME_UI_READY_PERSISTED"
        && diagnostic.attempt > 0
        && diagnostic.app_version.as_deref() == Some(env!("CARGO_PKG_VERSION"))
        && diagnostic.instance_id.as_deref() == Some(endpoint.instance_id.as_str())
        && (ui_ready.page_url.starts_with("http://127.0.0.1:")
            || ui_ready.page_url.starts_with("http://localhost:"))
}

fn clear_file(path: &Path) -> Result<(), IoError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

pub fn show_blocked(
    app: &tauri::AppHandle,
    code: &str,
    detail: &str,
) -> Result<(), Box<dyn Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;

    let report_path = app_data_dir.join(STARTUP_DIAGNOSTIC_FILE);
    let temp_report_path = app_data_dir.join("startup-diagnostic.json.tmp");
    let safe_detail = redact_secrets(detail);
    let diagnostic = StartupDiagnostic {
        state: "blocked",
        code,
        detail: &safe_detail,
        app_version: env!("CARGO_PKG_VERSION"),
        created_at_unix_seconds: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
    };
    let mut report = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(&temp_report_path)?;
    report.write_all(&serde_json::to_vec_pretty(&diagnostic)?)?;
    report.write_all(b"\n")?;
    report.sync_all()?;
    if report_path.exists() {
        fs::remove_file(&report_path)?;
    }
    fs::rename(&temp_report_path, &report_path)?;

    let html = recovery_html(code, &safe_detail, &report_path.to_string_lossy());
    let data_url = format!(
        "data:text/html;charset=utf-8,{}",
        urlencoding::encode(&html)
    );
    let url = tauri::Url::parse(&data_url)?;

    let window = workspace_window(app)?;
    window.navigate(url)?;
    window.set_title(BLOCKED_WINDOW_TITLE)?;
    window.show()?;
    window.set_focus()?;
    Ok(())
}

fn recovery_html(code: &str, detail: &str, report_path: &str) -> String {
    let code = escape_html(code);
    let detail = escape_html(detail);
    let report_path = escape_html(report_path);

    format!(
        r#"<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SahelFlow — démarrage bloqué</title>
  <style>
    :root {{ color-scheme: dark; font-family: Inter, Segoe UI, system-ui, sans-serif; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101214; color: #f4f4f5; padding: 24px; }}
    main {{ width: min(720px, 100%); border: 1px solid #3f3f46; border-radius: 18px; background: #18181b; padding: 32px; box-shadow: 0 24px 80px rgba(0,0,0,.42); }}
    .badge {{ display: inline-flex; align-items: center; border: 1px solid #7f1d1d; background: #450a0a; color: #fecaca; border-radius: 999px; padding: 6px 10px; font-size: 13px; font-weight: 700; }}
    h1 {{ margin: 18px 0 10px; font-size: clamp(26px, 5vw, 40px); line-height: 1.05; }}
    p {{ color: #d4d4d8; line-height: 1.65; }}
    .steps {{ margin: 24px 0; padding: 18px 20px; border-radius: 14px; background: #0f172a; border: 1px solid #334155; }}
    .steps strong {{ color: #e2e8f0; }}
    code {{ display: block; overflow-wrap: anywhere; margin-top: 8px; padding: 12px; border-radius: 10px; background: #09090b; color: #a5f3fc; font-size: 12px; }}
    details {{ margin-top: 18px; color: #a1a1aa; }}
    summary {{ cursor: pointer; color: #e4e4e7; font-weight: 650; }}
    .arabic {{ direction: rtl; text-align: right; font-family: Tahoma, Arial, sans-serif; }}
  </style>
</head>
<body>
  <main role="alert" aria-live="assertive">
    <span class="badge">Démarrage bloqué · Startup blocked</span>
    <h1>SahelFlow ne peut pas s’ouvrir en toute sécurité.</h1>
    <p>The business workspace was not opened because a required local service failed its startup checks. No alternate shop or partial workspace was loaded.</p>
    <p class="arabic" lang="ar">تعذّر تشغيل ساهل فلو بأمان. لم يتم فتح متجر بديل أو واجهة عمل غير مكتملة.</p>
    <section class="steps">
      <strong>Safe retry</strong>
      <p>Close SahelFlow, then open it again. If this screen returns, reinstall the current candidate or send the diagnostic file below to support.</p>
      <code>{report_path}</code>
    </section>
    <p><strong>Diagnostic code:</strong> {code}</p>
    <details>
      <summary>Technical detail</summary>
      <code>{detail}</code>
    </details>
  </main>
</body>
</html>"#
    )
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn redact_secrets(value: &str) -> String {
    let mut redacted = String::with_capacity(value.len());
    let chars: Vec<char> = value.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if chars[index].is_ascii_hexdigit() {
            let start = index;
            while index < chars.len() && chars[index].is_ascii_hexdigit() {
                index += 1;
            }
            if index - start >= 32 {
                redacted.push_str("[REDACTED]");
            } else {
                redacted.extend(chars[start..index].iter());
            }
            continue;
        }
        redacted.push(chars[index]);
        index += 1;
    }

    if let Ok(profile) = std::env::var("USERPROFILE") {
        if !profile.is_empty() {
            redacted = redacted.replace(&profile, "%USERPROFILE%");
        }
    }
    redacted
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packaged_handoff_removes_the_credential_from_browser_navigation() {
        let token = "a".repeat(64);
        let url = tauri::Url::parse(&format!(
            "http://127.0.0.1:43123{RUNTIME_BOOTSTRAP_PATH}?token={token}"
        ))
        .unwrap();

        let handoff = packaged_handoff(&url).unwrap().unwrap();
        assert_eq!(handoff.workspace_url.as_str(), "http://127.0.0.1:43123/");
        assert_eq!(handoff.host, "127.0.0.1");
        assert_eq!(handoff.token, token);
        assert!(!handoff.workspace_url.as_str().contains("token="));
    }

    #[test]
    fn runtime_cookie_is_loopback_scoped_http_only_and_lax() {
        let token = "b".repeat(64);
        let cookie = runtime_cookie("127.0.0.1", &token).unwrap();

        assert_eq!(cookie.name(), RUNTIME_COOKIE);
        assert_eq!(cookie.value(), token);
        assert_eq!(cookie.domain(), Some("127.0.0.1"));
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(cookie.http_only(), Some(true));
        assert_eq!(cookie.same_site(), Some(SameSite::Lax));
        assert_eq!(cookie.secure(), Some(false));
    }

    #[test]
    fn ui_ready_must_match_the_current_runtime_instance() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-ui-ready-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let endpoint_path = root.join(RUNTIME_ENDPOINT_FILE);
        let ui_ready_path = root.join(RUNTIME_UI_READY_FILE);
        let diagnostic_path = root.join(RUNTIME_UI_DIAGNOSTIC_FILE);
        fs::write(
            &endpoint_path,
            format!(
                r#"{{"state":"ready","instanceId":"instance-a","appVersion":"{}"}}"#,
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        fs::write(
            &ui_ready_path,
            format!(
                r#"{{"formatVersion":1,"protocolVersion":1,"state":"ready","instanceId":"instance-b","appVersion":"{}","pageUrl":"http://127.0.0.1:43123"}}"#,
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        fs::write(
            &diagnostic_path,
            format!(
                r#"{{"formatVersion":1,"state":"ready","code":"RUNTIME_UI_READY_PERSISTED","attempt":1,"instanceId":"instance-a","appVersion":"{}"}}"#,
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        assert!(!matching_ui_ready(
            &endpoint_path,
            &ui_ready_path,
            &diagnostic_path
        ));

        fs::write(
            &ui_ready_path,
            format!(
                r#"{{"formatVersion":1,"protocolVersion":1,"state":"ready","instanceId":"instance-a","appVersion":"{}","pageUrl":"http://127.0.0.1:43123"}}"#,
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        assert!(matching_ui_ready(
            &endpoint_path,
            &ui_ready_path,
            &diagnostic_path
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn ui_ready_timeout_distinguishes_missing_beacon_and_session_rejection() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-ui-diagnostic-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let (code, _) = ui_ready_failure(&root);
        assert_eq!(code, "SF-RUNTIME-UI-BEACON-MISSING");

        fs::write(
            root.join(RUNTIME_ENDPOINT_FILE),
            format!(
                r#"{{"state":"ready","instanceId":"instance-a","appVersion":"{}"}}"#,
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        fs::write(
            root.join(RUNTIME_UI_DIAGNOSTIC_FILE),
            format!(
                r#"{{"formatVersion":1,"state":"blocked","code":"RUNTIME_SESSION_REQUIRED","attempt":3,"instanceId":"instance-a","appVersion":"{}"}}"#,
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        let (code, detail) = ui_ready_failure(&root);
        assert_eq!(code, "SF-RUNTIME-UI-SESSION-BLOCKED");
        assert!(detail.contains("attempt 3"));
        assert!(!detail.contains("sf_runtime"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn diagnostics_redact_launch_credentials_and_profile_paths() {
        let token = "a".repeat(64);
        let detail = format!("Bearer {token} at C:\\Users\\seller\\data");
        std::env::set_var("USERPROFILE", "C:\\Users\\seller");

        let redacted = redact_secrets(&detail);

        assert!(!redacted.contains(&token));
        assert!(!redacted.contains("C:\\Users\\seller"));
        assert!(redacted.contains("[REDACTED]"));
        assert!(redacted.contains("%USERPROFILE%"));
    }

    #[test]
    fn recovery_html_escapes_diagnostic_content() {
        let html = recovery_html("SF-TEST", "<script>bad()</script>", "C:\\report.json");
        assert!(!html.contains("<script>bad()</script>"));
        assert!(html.contains("&lt;script&gt;bad()&lt;/script&gt;"));
    }

    /// Runs `retry_with_backoff` against a scripted operation that fails the
    /// first `failures` times, recording every call, failure and sleep.
    fn run_scripted_retry(
        backoff: Backoff,
        failures: u8,
    ) -> (u8, Result<u8, String>, Vec<u8>, Vec<u8>, Vec<u64>) {
        let mut calls = Vec::new();
        let mut failed = Vec::new();
        let mut sleeps = Vec::new();
        let (attempts, result) = retry_with_backoff(
            backoff,
            |attempt| {
                calls.push(attempt);
                if attempt <= failures {
                    Err(format!("webview not ready on attempt {attempt}"))
                } else {
                    Ok(attempt)
                }
            },
            |attempt, _error| failed.push(attempt),
            |delay| sleeps.push(delay.as_millis() as u64),
        );
        (attempts, result, calls, failed, sleeps)
    }

    #[test]
    fn window_show_retry_succeeds_on_the_first_attempt_without_sleeping() {
        let (attempts, result, calls, failed, sleeps) = run_scripted_retry(WINDOW_SHOW_BACKOFF, 0);

        assert_eq!(attempts, 1);
        assert_eq!(result, Ok(1));
        assert_eq!(calls, vec![1]);
        assert!(failed.is_empty());
        assert!(sleeps.is_empty());
    }

    #[test]
    fn window_show_retry_recovers_after_three_transient_failures() {
        let (attempts, result, calls, failed, sleeps) = run_scripted_retry(WINDOW_SHOW_BACKOFF, 3);

        assert_eq!(attempts, 4);
        assert_eq!(result, Ok(4));
        assert_eq!(calls, vec![1, 2, 3, 4]);
        assert_eq!(failed, vec![1, 2, 3]);
        assert_eq!(sleeps, vec![100, 200, 400]);
    }

    #[test]
    fn window_show_retry_gives_up_with_the_last_error_and_a_capped_schedule() {
        let (attempts, result, calls, failed, sleeps) =
            run_scripted_retry(WINDOW_SHOW_BACKOFF, u8::MAX);

        assert_eq!(attempts, 8);
        assert_eq!(
            result,
            Err("webview not ready on attempt 8".to_string()),
            "the error of the LAST attempt is the one reported"
        );
        assert_eq!(calls, vec![1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(failed, vec![1, 2, 3, 4, 5, 6, 7, 8]);
        // No sleep after the last attempt; doubling stops at the 1 s cap.
        assert_eq!(sleeps, vec![100, 200, 400, 800, 1000, 1000, 1000]);
        assert!(sleeps.iter().sum::<u64>() <= 5_000);
    }

    #[test]
    fn window_show_retry_always_makes_at_least_one_attempt() {
        let backoff = Backoff {
            attempts: 0,
            ..WINDOW_SHOW_BACKOFF
        };
        let (attempts, result, calls, _, sleeps) = run_scripted_retry(backoff, u8::MAX);

        assert_eq!(attempts, 1);
        assert!(result.is_err());
        assert_eq!(calls, vec![1]);
        assert!(sleeps.is_empty());
    }

    #[test]
    fn window_show_blocked_detail_keeps_the_text_and_adds_the_attempt_count() {
        let detail = window_show_blocked_detail(8, &"failed to send message to the webview");

        assert!(detail.starts_with(
            "the authenticated workspace was ready but the desktop window could not be shown: failed to send message to the webview"
        ));
        assert!(detail.contains("8 attempts"));
    }
}
