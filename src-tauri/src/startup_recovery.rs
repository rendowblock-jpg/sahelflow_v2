use serde::Serialize;
use std::error::Error;
use std::fs;
use std::io::{Error as IoError, ErrorKind};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartupDiagnostic<'a> {
    state: &'static str,
    code: &'a str,
    detail: &'a str,
    app_version: &'static str,
    created_at_unix_seconds: u64,
}

pub fn show_ready(app: &tauri::App) -> Result<(), Box<dyn Error>> {
    let window = app.get_webview_window("main").ok_or_else(|| {
        IoError::new(
            ErrorKind::NotFound,
            "the configured main desktop window was not created",
        )
    })?;
    window.show()?;
    window.set_focus()?;
    Ok(())
}

pub fn show_blocked(
    app: &tauri::App,
    code: &str,
    detail: &str,
) -> Result<(), Box<dyn Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;

    let report_path = app_data_dir.join("startup-diagnostic.json");
    let temp_report_path = app_data_dir.join("startup-diagnostic.json.tmp");
    let diagnostic = StartupDiagnostic {
        state: "blocked",
        code,
        detail,
        app_version: env!("CARGO_PKG_VERSION"),
        created_at_unix_seconds: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0),
    };
    fs::write(&temp_report_path, serde_json::to_vec_pretty(&diagnostic)?)?;
    fs::rename(&temp_report_path, &report_path)?;

    let html = recovery_html(code, detail, &report_path.to_string_lossy());
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
