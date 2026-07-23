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
const STARTUP_DIAGNOSTIC_FILE: &str = "startup-diagnostic.json";
const PACKAGED_UI_READY_TIMEOUT: Duration = Duration::from_secs(60);
const UI_READY_POLL_INTERVAL: Duration = Duration::from_millis(100);
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
    let window = app.get_webview_window("main").ok_or_else(|| {
        IoError::new(
            ErrorKind::NotFound,
            "the configured main desktop window was not created",
        )
    })?;

    let Some(handoff) = packaged_handoff(&requested_url)? else {
        window.navigate(requested_url)?;
        window.show()?;
        window.set_focus()?;
        return Ok(());
    };

    let app_data_dir = app.path().app_data_dir()?;
    clear_file(&app_data_dir.join(RUNTIME_UI_READY_FILE))?;
    clear_file(&app_data_dir.join(STARTUP_DIAGNOSTIC_FILE))?;

    window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;
    window.navigate(handoff.workspace_url)?;

    monitor_packaged_ui(app.clone(), window, app_data_dir);
    Ok(())
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

fn monitor_packaged_ui(app: tauri::AppHandle, window: WebviewWindow, app_data_dir: PathBuf) {
    thread::spawn(move || {
        if wait_for_matching_ui_ready(&app_data_dir, PACKAGED_UI_READY_TIMEOUT) {
            if let Err(error) = window.show().and_then(|_| window.set_focus()) {
                let detail = format!("the authenticated workspace was ready but the desktop window could not be shown: {error}");
                eprintln!("[sahelflow] FATAL: {detail}");
                let _ = show_blocked(&app, "SF-WINDOW-SHOW-BLOCKED", &detail);
            }
            return;
        }

        let detail = "the hidden desktop WebView did not produce a matching authenticated UI-ready acknowledgment";
        eprintln!("[sahelflow] FATAL: {detail}");
        let _ = show_blocked(&app, "SF-RUNTIME-UI-BLOCKED", detail);
    });
}

fn wait_for_matching_ui_ready(app_data_dir: &Path, timeout: Duration) -> bool {
    let endpoint_path = app_data_dir.join(RUNTIME_ENDPOINT_FILE);
    let ui_ready_path = app_data_dir.join(RUNTIME_UI_READY_FILE);
    let started_at = Instant::now();

    while started_at.elapsed() < timeout {
        if matching_ui_ready(&endpoint_path, &ui_ready_path) {
            return true;
        }
        thread::sleep(UI_READY_POLL_INTERVAL);
    }
    false
}

fn matching_ui_ready(endpoint_path: &Path, ui_ready_path: &Path) -> bool {
    let Ok(endpoint_bytes) = fs::read(endpoint_path) else {
        return false;
    };
    let Ok(ui_ready_bytes) = fs::read(ui_ready_path) else {
        return false;
    };
    if endpoint_bytes.len() > 64 * 1024 || ui_ready_bytes.len() > 64 * 1024 {
        return false;
    }

    let Ok(endpoint) = serde_json::from_slice::<RuntimeEndpoint>(&endpoint_bytes) else {
        return false;
    };
    let Ok(ui_ready) = serde_json::from_slice::<RuntimeUiReady>(&ui_ready_bytes) else {
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

    let window = app.get_webview_window("main").ok_or_else(|| {
        IoError::new(
            ErrorKind::NotFound,
            "the configured main desktop window was not created",
        )
    })?;
    window.navigate(url)?;
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
        assert!(!matching_ui_ready(&endpoint_path, &ui_ready_path));

        fs::write(
            &ui_ready_path,
            format!(
                r#"{{"formatVersion":1,"protocolVersion":1,"state":"ready","instanceId":"instance-a","appVersion":"{}","pageUrl":"http://127.0.0.1:43123"}}"#,
                env!("CARGO_PKG_VERSION")
            ),
        )
        .unwrap();
        assert!(matching_ui_ready(&endpoint_path, &ui_ready_path));
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
}
