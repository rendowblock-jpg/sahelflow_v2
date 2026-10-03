//! FD-068 launch screen: a branded window painted from the first frame while
//! the contained runtime starts (FD-025's hidden `main` window remains the only
//! readiness authority).
//!
//! The launch screen is presentation only. It has no IPC capability, never
//! navigates, carries no business data and never decides readiness: it mirrors
//! the durable startup trace into honest stage copy and closes as soon as the
//! `main` window becomes visible, whether that is the authenticated workspace
//! or the bounded recovery document.

use serde::Deserialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LAUNCH_WINDOW_LABEL: &str = "launch";
// Deliberately not "SahelFlow": installed evidence identifies the workspace
// window by that exact title.
const LAUNCH_WINDOW_TITLE: &str = "SahelFlow - Starting";
const WORKSPACE_WINDOW_LABEL: &str = "main";
const STARTUP_TRACE_FILE: &str = "startup-trace.json";
const PREVIOUS_UI_READY_FILE: &str = "runtime-ui-ready.json";
const MAX_LOCALE_EVIDENCE_BYTES: u64 = 64 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(200);
const SLOW_HINT_AFTER: Duration = Duration::from_secs(15);
const MAX_LIFETIME: Duration = Duration::from_secs(10 * 60);
const TEMPLATE: &str = include_str!("launch_screen.html");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Locale {
    Ar,
    Fr,
    En,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Preparing,
    Starting,
    Retrying,
    Opening,
}

impl Phase {
    fn attribute(self) -> &'static str {
        match self {
            Phase::Preparing => "preparing",
            Phase::Starting => "starting",
            Phase::Retrying => "retrying",
            Phase::Opening => "opening",
        }
    }
}

struct LaunchCopy {
    lang: &'static str,
    dir: &'static str,
    tagline: &'static str,
    preparing: &'static str,
    starting: &'static str,
    retrying: &'static str,
    opening: &'static str,
    slow_hint: &'static str,
}

fn copy(locale: Locale) -> LaunchCopy {
    match locale {
        Locale::Ar => LaunchCopy {
            lang: "ar",
            dir: "rtl",
            tagline: "إدارة الدفع عند الاستلام",
            preparing: "جارٍ تجهيز بياناتك",
            starting: "جارٍ تشغيل SahelFlow",
            retrying: "إعادة المحاولة…",
            opening: "جارٍ فتح مساحة عملك",
            slow_hint: "أول تشغيل بعد التحديث يستغرق وقتاً أطول قليلاً.",
        },
        Locale::Fr => LaunchCopy {
            lang: "fr",
            dir: "ltr",
            tagline: "Gestion COD",
            preparing: "Préparation de vos données",
            starting: "Démarrage de SahelFlow",
            retrying: "Nouvelle tentative…",
            opening: "Ouverture de votre espace",
            slow_hint: "Le premier lancement après une mise à jour prend un peu plus de temps.",
        },
        Locale::En => LaunchCopy {
            lang: "en",
            dir: "ltr",
            tagline: "COD management",
            preparing: "Preparing your data",
            starting: "Starting SahelFlow",
            retrying: "Retrying…",
            opening: "Opening your workspace",
            slow_hint: "The first launch after an update takes a little longer.",
        },
    }
}

pub fn render_html(locale: Locale, version: &str) -> String {
    let text = copy(locale);
    TEMPLATE
        .replace("{{LANG}}", text.lang)
        .replace("{{DIR}}", text.dir)
        .replace("{{TAGLINE}}", text.tagline)
        .replace("{{PREPARING}}", text.preparing)
        .replace("{{STARTING}}", text.starting)
        .replace("{{RETRYING}}", text.retrying)
        .replace("{{OPENING}}", text.opening)
        .replace("{{SLOW_HINT}}", text.slow_hint)
        .replace("{{VERSION}}", &escape_text(version))
}

fn escape_text(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '+')
        })
        .collect()
}

pub fn locale_from_tag(tag: &str) -> Option<Locale> {
    let primary = tag
        .split(['-', '_'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    match primary.as_str() {
        "ar" => Some(Locale::Ar),
        "fr" => Some(Locale::Fr),
        "en" => Some(Locale::En),
        _ => None,
    }
}

#[derive(Deserialize)]
struct PreviousUiReady {
    locale: Option<String>,
}

/// The seller's last workspace language (recorded by the previous launch's
/// UI-ready receipt), else the Windows display language, else French — the
/// workspace default.
fn launch_locale(app_data_dir: &Path) -> Locale {
    let previous = app_data_dir.join(PREVIOUS_UI_READY_FILE);
    let recorded = fs::metadata(&previous)
        .ok()
        .filter(|metadata| metadata.is_file() && metadata.len() <= MAX_LOCALE_EVIDENCE_BYTES)
        .and_then(|_| fs::read(&previous).ok())
        .and_then(|bytes| serde_json::from_slice::<PreviousUiReady>(&bytes).ok())
        .and_then(|receipt| receipt.locale)
        .and_then(|tag| locale_from_tag(&tag));
    recorded
        .or_else(|| tauri_plugin_os::locale().and_then(|tag| locale_from_tag(&tag)))
        .unwrap_or(Locale::Fr)
}

#[derive(Deserialize)]
struct TraceEvent {
    stage: String,
}

#[derive(Deserialize)]
struct Trace {
    events: Vec<TraceEvent>,
}

fn latest_stage(trace_path: &Path) -> Option<String> {
    let bytes = fs::read(trace_path).ok()?;
    let trace = serde_json::from_slice::<Trace>(&bytes).ok()?;
    trace.events.into_iter().last().map(|event| event.stage)
}

/// Each recorded stage maps to a phase and a progress band. Progress only
/// creeps inside the band, so the bar never claims a stage that has not
/// happened and never reaches the end before the workspace is visible.
pub fn stage_band(stage: Option<&str>) -> (Phase, f32, f32) {
    match stage.unwrap_or_default() {
        "migration-started" => (Phase::Preparing, 0.16, 0.34),
        "migration-complete" => (Phase::Preparing, 0.36, 0.42),
        "runtime-prepare-started" => (Phase::Starting, 0.44, 0.52),
        "runtime-prepare-complete" | "runtime-attempt-started" => (Phase::Starting, 0.54, 0.72),
        "runtime-attempt-failed" => (Phase::Retrying, 0.50, 0.60),
        "runtime-listening" => (Phase::Starting, 0.74, 0.82),
        "runtime-ready" => (Phase::Opening, 0.84, 0.96),
        _ => (Phase::Preparing, 0.06, 0.15),
    }
}

pub fn next_progress(shown: f32, floor: f32, ceiling: f32) -> f32 {
    if shown < floor {
        floor
    } else if shown >= ceiling {
        shown
    } else {
        shown + (ceiling - shown) * 0.025
    }
}

fn launch_url(app_data_dir: &Path, html: &str) -> Option<WebviewUrl> {
    let path = app_data_dir.join("launch-screen.html");
    if fs::write(&path, html.as_bytes()).is_ok() {
        let href = format!("file:///{}", path.to_string_lossy().replace('\\', "/"));
        if let Ok(parsed) = href.parse() {
            return Some(WebviewUrl::External(parsed));
        }
    }
    format!("data:text/html;charset=utf-8,{}", urlencoding::encode(html))
        .parse()
        .ok()
        .map(WebviewUrl::External)
}

/// Paint the launch window immediately. Failure to create it is never a
/// startup failure: the workspace handoff continues exactly as before.
pub fn open(app: &AppHandle, app_data_dir: &Path) {
    let html = render_html(launch_locale(app_data_dir), env!("CARGO_PKG_VERSION"));
    let Some(url) = launch_url(app_data_dir, &html) else {
        return;
    };
    let window = match WebviewWindowBuilder::new(app, LAUNCH_WINDOW_LABEL, url)
        .title(LAUNCH_WINDOW_TITLE)
        .inner_size(720.0, 460.0)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .shadow(true)
        .center()
        .always_on_top(true)
        .visible(true)
        .focused(true)
        .background_color(tauri::window::Color(5, 10, 17, 255))
        .build()
    {
        Ok(window) => window,
        Err(error) => {
            eprintln!("[sahelflow] launch screen unavailable: {error}");
            return;
        }
    };
    let app = app.clone();
    let trace_path = app_data_dir.join(STARTUP_TRACE_FILE);
    let _ = thread::Builder::new()
        .name("sahelflow-launch-screen".to_string())
        .spawn(move || follow_startup(app, window, trace_path));
}

fn workspace_visible(app: &AppHandle) -> bool {
    app.get_webview_window(WORKSPACE_WINDOW_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn follow_startup(app: AppHandle, window: WebviewWindow, trace_path: PathBuf) {
    let started_at = Instant::now();
    let mut shown = 0.06_f32;
    let mut slow_hint_shown = false;
    while started_at.elapsed() < MAX_LIFETIME {
        if workspace_visible(&app) {
            break;
        }
        if app.get_webview_window(LAUNCH_WINDOW_LABEL).is_none() {
            return;
        }
        let (phase, floor, ceiling) = stage_band(latest_stage(&trace_path).as_deref());
        shown = next_progress(shown, floor, ceiling);
        let percent = ((shown * 100.0).round() as i32).clamp(1, 99);
        let mut script = format!(
            "document.documentElement.dataset.stage='{}';document.documentElement.style.setProperty('--p','{:.3}');var n=document.querySelector('[data-pct]');if(n)n.textContent='{}%';",
            phase.attribute(),
            shown,
            percent
        );
        if !slow_hint_shown && started_at.elapsed() >= SLOW_HINT_AFTER {
            slow_hint_shown = true;
            script.push_str("document.documentElement.dataset.slow='1';");
        }
        let _ = window.eval(&script);
        thread::sleep(POLL_INTERVAL);
    }
    let _ = window.destroy();
}

/// A second launch while the workspace is still hidden brings the launch
/// screen forward instead of doing nothing.
pub fn focus(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LAUNCH_WINDOW_LABEL) {
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_every_locale_without_placeholders_or_scripts() {
        for locale in [Locale::Ar, Locale::Fr, Locale::En] {
            let html = render_html(locale, "1.0.0-internal.40");
            assert!(!html.contains("{{"), "unfilled placeholder for {locale:?}");
            assert!(!html.to_ascii_lowercase().contains("<script"));
            assert!(html.contains("1.0.0-internal.40"));
        }
        assert!(render_html(Locale::Ar, "1").contains("dir=\"rtl\""));
        assert!(render_html(Locale::Fr, "1").contains("dir=\"ltr\""));
    }

    #[test]
    fn version_text_cannot_inject_markup() {
        assert!(!render_html(Locale::En, "<b>1</b>").contains("<b>1</b>"));
    }

    #[test]
    fn maps_language_tags() {
        assert_eq!(locale_from_tag("ar-DZ"), Some(Locale::Ar));
        assert_eq!(locale_from_tag("fr_FR"), Some(Locale::Fr));
        assert_eq!(locale_from_tag("EN-us"), Some(Locale::En));
        assert_eq!(locale_from_tag("de-DE"), None);
    }

    #[test]
    fn progress_never_passes_its_stage_ceiling() {
        let mut shown = 0.0;
        let (_, floor, ceiling) = stage_band(Some("migration-started"));
        for _ in 0..10_000 {
            shown = next_progress(shown, floor, ceiling);
        }
        assert!(shown >= floor && shown <= ceiling);
        assert!(stage_band(Some("runtime-ready")).2 < 1.0);
        assert_eq!(
            stage_band(Some("runtime-attempt-failed")).0,
            Phase::Retrying
        );
        assert_eq!(stage_band(None).0, Phase::Preparing);
    }
}
