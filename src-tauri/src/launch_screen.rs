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
pub(crate) const LAUNCH_WINDOW_TITLE: &str = "SahelFlow - Starting";
const WORKSPACE_WINDOW_LABEL: &str = "main";
const STARTUP_TRACE_FILE: &str = "startup-trace.json";
const PREVIOUS_UI_READY_FILE: &str = "runtime-ui-ready.json";
/// Written by the workspace whenever the seller changes language, colour
/// mode or colour preset (and once at UI-ready), and never cleared, so the
/// next startup card matches what the seller last saw.
const LAUNCH_APPEARANCE_FILE: &str = "launch-appearance.json";
const MAX_LOCALE_EVIDENCE_BYTES: u64 = 64 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(200);
/// A normal first launch takes about 32 s, so a hint at 15 s told every
/// seller that something was wrong. Shared by the native card and the
/// WebView fallback.
pub(crate) const SLOW_HINT_AFTER_SECS: u64 = 45;
const SLOW_HINT_AFTER: Duration = Duration::from_secs(SLOW_HINT_AFTER_SECS);
const MAX_LIFETIME: Duration = Duration::from_secs(30 * 60);
const TEMPLATE: &str = include_str!("launch_screen.html");
/// Timing-only trace stages: they never move the progress model.
pub(crate) const INFORMATIONAL_STAGES: [&str; 3] = [
    "process-started",
    "splash-painted",
    "workspace-window-created",
];

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

pub(crate) struct LaunchCopy {
    lang: &'static str,
    dir: &'static str,
    pub(crate) tagline: &'static str,
    pub(crate) preparing: &'static str,
    pub(crate) starting: &'static str,
    pub(crate) retrying: &'static str,
    pub(crate) opening: &'static str,
    pub(crate) closing: &'static str,
    pub(crate) slow_hint: &'static str,
}

pub(crate) fn copy(locale: Locale) -> LaunchCopy {
    match locale {
        Locale::Ar => LaunchCopy {
            lang: "ar",
            dir: "rtl",
            tagline: "إدارة الدفع عند الاستلام",
            preparing: "جاري تجهيز بياناتك",
            starting: "جاري تشغيل الخدمات",
            retrying: "إعادة المحاولة…",
            opening: "جاري فتح مساحة عملك",
            closing: "جاري الإغلاق…",
            slow_hint: "يستغرق هذا وقتًا أطول قليلًا من المعتاد. أبقِ هذه النافذة مفتوحة.",
        },
        Locale::Fr => LaunchCopy {
            lang: "fr",
            dir: "ltr",
            tagline: "Gestion COD",
            preparing: "Préparation de vos données",
            starting: "Démarrage des services",
            retrying: "Nouvelle tentative…",
            opening: "Ouverture de votre espace",
            closing: "Fermeture…",
            slow_hint:
                "Cela prend un peu plus de temps que d'habitude. Gardez cette fenêtre ouverte.",
        },
        Locale::En => LaunchCopy {
            lang: "en",
            dir: "ltr",
            tagline: "COD management",
            preparing: "Preparing your data",
            starting: "Starting services",
            retrying: "Retrying…",
            opening: "Opening your workspace",
            closing: "Closing…",
            slow_hint: "This is taking a little longer than usual. Keep this window open.",
        },
    }
}

pub fn render_html(locale: Locale, appearance: Appearance, version: &str) -> String {
    let text = copy(locale);
    TEMPLATE
        .replace("{{LANG}}", text.lang)
        .replace("{{THEME}}", appearance.theme.attribute())
        .replace("{{PRESET}}", appearance.preset.attribute())
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

/// The two colour modes of the workspace, as the startup card shows them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Theme {
    Light,
    Dark,
}

impl Theme {
    fn attribute(self) -> &'static str {
        match self {
            Theme::Light => "light",
            Theme::Dark => "dark",
        }
    }
}

/// The workspace's four colour presets. Sahel is the default.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Preset {
    Sahel,
    Atlas,
    Oasis,
    Dune,
}

impl Preset {
    fn attribute(self) -> &'static str {
        match self {
            Preset::Sahel => "sahel",
            Preset::Atlas => "atlas",
            Preset::Oasis => "oasis",
            Preset::Dune => "dune",
        }
    }
}

/// What the startup card wears: the seller's colour mode and colour preset.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Appearance {
    pub theme: Theme,
    pub preset: Preset,
}

impl Appearance {
    /// The workspace default (dark, Sahel), used until a choice is recorded.
    pub const DEFAULT: Appearance = Appearance {
        theme: Theme::Dark,
        preset: Preset::Sahel,
    };
}

/// What the seller picked in Settings. "System" follows Windows.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ThemeChoice {
    Light,
    Dark,
    System,
}

pub(crate) fn theme_from_tag(tag: &str) -> Option<ThemeChoice> {
    match tag {
        "light" => Some(ThemeChoice::Light),
        "dark" => Some(ThemeChoice::Dark),
        "system" => Some(ThemeChoice::System),
        _ => None,
    }
}

pub(crate) fn preset_from_tag(tag: &str) -> Option<Preset> {
    match tag {
        "sahel" => Some(Preset::Sahel),
        "atlas" => Some(Preset::Atlas),
        "oasis" => Some(Preset::Oasis),
        "dune" => Some(Preset::Dune),
        _ => None,
    }
}

/// No recorded choice means the workspace default, which is dark.
pub(crate) fn resolve_theme(choice: Option<ThemeChoice>, system_is_light: bool) -> Theme {
    match choice {
        Some(ThemeChoice::Light) => Theme::Light,
        Some(ThemeChoice::System) if system_is_light => Theme::Light,
        Some(ThemeChoice::System | ThemeChoice::Dark) | None => Theme::Dark,
    }
}

#[derive(Deserialize)]
struct PreviousUiReady {
    locale: Option<String>,
}

/// What the workspace last recorded about how it looks.
#[derive(Deserialize)]
struct LaunchAppearanceRecord {
    locale: Option<String>,
    theme: Option<String>,
    preset: Option<String>,
}

/// A small JSON file under the app data directory, when it is present and
/// bounded. Anything else reads as "nothing recorded".
fn bounded_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    fs::metadata(path)
        .ok()
        .filter(|metadata| metadata.is_file() && metadata.len() <= MAX_LOCALE_EVIDENCE_BYTES)
        .and_then(|_| fs::read(path).ok())
        .and_then(|bytes| serde_json::from_slice::<T>(&bytes).ok())
}

fn appearance_record(app_data_dir: &Path) -> Option<LaunchAppearanceRecord> {
    bounded_json(&app_data_dir.join(LAUNCH_APPEARANCE_FILE))
}

/// Whether Windows apps are set to the light theme (a missing or unreadable
/// value reads as dark).
#[cfg(windows)]
fn system_prefers_light() -> bool {
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let subkey: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let value: Vec<u16> = "AppsUseLightTheme"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut data: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let status = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            value.as_ptr(),
            RRF_RT_REG_DWORD,
            std::ptr::null_mut(),
            (&mut data as *mut u32).cast(),
            &mut size,
        )
    };
    status == 0 && data != 0
}

#[cfg(not(windows))]
fn system_prefers_light() -> bool {
    false
}

/// The colour mode and preset the seller last used (recorded by the workspace),
/// else the workspace default. Windows is asked only when the seller follows
/// the system colour mode.
pub(crate) fn launch_appearance(app_data_dir: &Path) -> Appearance {
    let record = appearance_record(app_data_dir);
    let choice = record
        .as_ref()
        .and_then(|record| record.theme.as_deref())
        .and_then(theme_from_tag);
    let preset = record
        .as_ref()
        .and_then(|record| record.preset.as_deref())
        .and_then(preset_from_tag)
        .unwrap_or(Appearance::DEFAULT.preset);
    let system_is_light = choice == Some(ThemeChoice::System) && system_prefers_light();
    Appearance {
        theme: resolve_theme(choice, system_is_light),
        preset,
    }
}

/// The seller's last workspace language (recorded by the workspace, or by the
/// previous launch's UI-ready receipt from an older build), else the Windows
/// display language, else French, the workspace default.
pub(crate) fn launch_locale(app_data_dir: &Path) -> Locale {
    let recorded = appearance_record(app_data_dir)
        .and_then(|record| record.locale)
        .and_then(|tag| locale_from_tag(&tag))
        .or_else(|| {
            bounded_json::<PreviousUiReady>(&app_data_dir.join(PREVIOUS_UI_READY_FILE))
                .and_then(|receipt| receipt.locale)
                .and_then(|tag| locale_from_tag(&tag))
        });
    recorded
        .or_else(|| tauri_plugin_os::locale().and_then(|tag| locale_from_tag(&tag)))
        .unwrap_or(Locale::Fr)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TraceEvent {
    stage: String,
    #[serde(default)]
    created_at_unix_milliseconds: u64,
}

#[derive(Deserialize)]
struct Trace {
    events: Vec<TraceEvent>,
}

fn latest_stage(trace_path: &Path) -> Option<String> {
    latest_stage_with_origin(trace_path).and_then(|(_, stage)| stage)
}

/// The first event's timestamp (when this launch reset the trace) and the
/// latest recorded stage.
pub(crate) fn latest_stage_with_origin(trace_path: &Path) -> Option<(u64, Option<String>)> {
    let bytes = fs::read(trace_path).ok()?;
    let trace = serde_json::from_slice::<Trace>(&bytes).ok()?;
    let origin = trace.events.first()?.created_at_unix_milliseconds;
    let latest = trace
        .events
        .into_iter()
        .rev()
        .find(|event| !INFORMATIONAL_STAGES.contains(&event.stage.as_str()))
        .map(|event| event.stage);
    Some((origin, latest))
}

/// Each recorded stage maps to a phase and a progress band. Progress only
/// creeps inside the band, so the bar never claims a stage that has not
/// happened and never reaches the end before the workspace is visible.
pub(crate) fn stage_band(stage: Option<&str>) -> (Phase, f32, f32) {
    match stage.unwrap_or_default() {
        "migration-started" => (Phase::Preparing, 0.16, 0.34),
        "migration-complete" => (Phase::Preparing, 0.36, 0.42),
        "runtime-warm-started" | "runtime-warm-complete" => (Phase::Starting, 0.44, 0.62),
        "runtime-prepare-started" => (Phase::Starting, 0.44, 0.52),
        "runtime-prepare-complete" | "runtime-attempt-started" => (Phase::Starting, 0.54, 0.72),
        "runtime-attempt-failed" => (Phase::Retrying, 0.50, 0.60),
        "runtime-listening" => (Phase::Starting, 0.74, 0.82),
        "runtime-ready" => (Phase::Opening, 0.84, 0.94),
        // The workspace is loading and hydrating: the longest final wait must
        // keep saying "opening", not fall back to "preparing".
        "ui-navigation-started" => (Phase::Opening, 0.88, 0.97),
        "ui-ready" => (Phase::Opening, 0.97, 0.99),
        _ => (Phase::Preparing, 0.06, 0.15),
    }
}

pub(crate) fn next_progress(shown: f32, floor: f32, ceiling: f32) -> f32 {
    if shown < floor {
        floor
    } else if shown >= ceiling {
        shown
    } else {
        shown + (ceiling - shown) * 0.025
    }
}

/// Quitting from the startup card is held back only while the shop databases
/// are being migrated: that is the one stretch where an abrupt exit is not free.
fn quit_is_safe(trace_path: &Path) -> bool {
    !matches!(
        latest_stage(trace_path).as_deref(),
        None | Some("native-started" | "workspace-window-pending" | "migration-started")
    )
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
///
/// When the native splash already covers the wait (started at the top of
/// `main`, before any WebView existed), no second launch surface is built:
/// this only hands the splash its close signal for when `main` is visible.
pub fn open(app: &AppHandle, app_data_dir: &Path) {
    if crate::native_splash::is_active() {
        let app = app.clone();
        let trace_path = app_data_dir.join(STARTUP_TRACE_FILE);
        let _ = thread::Builder::new()
            .name("sahelflow-native-splash-follow".to_string())
            .spawn(move || {
                let started_at = Instant::now();
                let mut quitting = false;
                while started_at.elapsed() < MAX_LIFETIME && !workspace_visible(&app) {
                    // Closing the startup card means "quit SahelFlow", never
                    // "hide a launch that keeps running".
                    if !quitting
                        && crate::native_splash::quit_requested()
                        && quit_is_safe(&trace_path)
                    {
                        quitting = true;
                        quit_during_startup(&app);
                    }
                    thread::sleep(POLL_INTERVAL);
                }
                crate::native_splash::request_close();
                if let (Some(painted), Ok(app_data_dir)) = (
                    crate::native_splash::painted_unix_ms(),
                    app.path().app_data_dir(),
                ) {
                    crate::startup_recovery::record_startup_stage_at(
                        &app_data_dir,
                        "splash-painted",
                        None,
                        painted,
                    );
                }
            });
        return;
    }
    let appearance = launch_appearance(app_data_dir);
    let html = render_html(
        launch_locale(app_data_dir),
        appearance,
        env!("CARGO_PKG_VERSION"),
    );
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
        .background_color(match appearance.theme {
            Theme::Dark => tauri::window::Color(5, 10, 17, 255),
            Theme::Light => tauri::window::Color(241, 245, 249, 255),
        })
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

/// The seller closed the startup card: stop the way a normal close stops, so
/// the contained servers and sidecars end with the app.
fn quit_during_startup(app: &AppHandle) {
    #[cfg(not(debug_assertions))]
    crate::begin_normal_close(app.clone());
    #[cfg(debug_assertions)]
    app.exit(0);
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
    crate::native_splash::bring_to_front();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_every_locale_without_placeholders_or_scripts() {
        let presets = [Preset::Sahel, Preset::Atlas, Preset::Oasis, Preset::Dune];
        for locale in [Locale::Ar, Locale::Fr, Locale::En] {
            for theme in [Theme::Light, Theme::Dark] {
                for preset in presets {
                    let html =
                        render_html(locale, Appearance { theme, preset }, "1.0.0-internal.40");
                    assert!(!html.contains("{{"), "unfilled placeholder for {locale:?}");
                    assert!(!html.to_ascii_lowercase().contains("<script"));
                    assert!(html.contains("1.0.0-internal.40"));
                }
            }
        }
        let dark = Appearance::DEFAULT;
        assert!(render_html(Locale::Ar, dark, "1").contains("dir=\"rtl\""));
        assert!(render_html(Locale::Fr, dark, "1").contains("dir=\"ltr\""));
        let light_atlas = Appearance {
            theme: Theme::Light,
            preset: Preset::Atlas,
        };
        let html = render_html(Locale::En, light_atlas, "1");
        assert!(html.contains("data-theme=\"light\""));
        assert!(html.contains("data-preset=\"atlas\""));
        assert!(render_html(Locale::En, dark, "1").contains("data-theme=\"dark\""));
    }

    #[test]
    fn version_text_cannot_inject_markup() {
        let html = render_html(Locale::En, Appearance::DEFAULT, "<b>1</b>");
        assert!(!html.contains("<b>1</b>"));
    }

    #[test]
    fn maps_language_tags() {
        assert_eq!(locale_from_tag("ar-DZ"), Some(Locale::Ar));
        assert_eq!(locale_from_tag("fr_FR"), Some(Locale::Fr));
        assert_eq!(locale_from_tag("EN-us"), Some(Locale::En));
        assert_eq!(locale_from_tag("de-DE"), None);
    }

    #[test]
    fn maps_theme_and_preset_tags_and_defaults_to_the_workspace_look() {
        assert_eq!(theme_from_tag("light"), Some(ThemeChoice::Light));
        assert_eq!(theme_from_tag("dark"), Some(ThemeChoice::Dark));
        assert_eq!(theme_from_tag("system"), Some(ThemeChoice::System));
        assert_eq!(theme_from_tag("Light"), None, "the cookie value is exact");
        assert_eq!(theme_from_tag(""), None);
        assert_eq!(preset_from_tag("sahel"), Some(Preset::Sahel));
        assert_eq!(preset_from_tag("atlas"), Some(Preset::Atlas));
        assert_eq!(preset_from_tag("oasis"), Some(Preset::Oasis));
        assert_eq!(preset_from_tag("dune"), Some(Preset::Dune));
        assert_eq!(preset_from_tag("Dune"), None);
        assert_eq!(preset_from_tag("sepia"), None);
        // No recorded choice is the workspace default, whatever Windows says.
        assert_eq!(resolve_theme(None, true), Theme::Dark);
        assert_eq!(resolve_theme(Some(ThemeChoice::Dark), true), Theme::Dark);
        assert_eq!(resolve_theme(Some(ThemeChoice::Light), false), Theme::Light);
        assert_eq!(resolve_theme(Some(ThemeChoice::System), true), Theme::Light);
        assert_eq!(resolve_theme(Some(ThemeChoice::System), false), Theme::Dark);
        assert_eq!(Appearance::DEFAULT.theme, Theme::Dark);
        assert_eq!(Appearance::DEFAULT.preset, Preset::Sahel);
    }

    #[test]
    fn reads_language_mode_and_preset_from_the_launch_appearance_record() {
        let directory = std::env::temp_dir().join(format!("sf-launch-look-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let record = directory.join(LAUNCH_APPEARANCE_FILE);
        fs::write(
            &record,
            r#"{"formatVersion":1,"locale":"ar","theme":"light","preset":"dune","extra":1}"#,
        )
        .unwrap();
        assert_eq!(launch_locale(&directory), Locale::Ar);
        assert_eq!(
            launch_appearance(&directory),
            Appearance {
                theme: Theme::Light,
                preset: Preset::Dune
            }
        );
        // A partial record keeps what it has and defaults the rest.
        fs::write(&record, r#"{"preset":"oasis"}"#).unwrap();
        assert_eq!(
            launch_appearance(&directory),
            Appearance {
                theme: Theme::Dark,
                preset: Preset::Oasis
            }
        );
        // An unknown value never breaks the card.
        fs::write(
            &record,
            r#"{"locale":"en","theme":"sepia","preset":"neon"}"#,
        )
        .unwrap();
        assert_eq!(launch_appearance(&directory), Appearance::DEFAULT);
        assert_eq!(launch_locale(&directory), Locale::En);
        fs::write(&record, "not json").unwrap();
        assert_eq!(launch_appearance(&directory), Appearance::DEFAULT);
        fs::remove_file(&record).unwrap();
        assert_eq!(launch_appearance(&directory), Appearance::DEFAULT);
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn an_older_build_receipt_still_gives_the_language() {
        let directory =
            std::env::temp_dir().join(format!("sf-launch-receipt-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let receipt = directory.join(PREVIOUS_UI_READY_FILE);
        fs::write(&receipt, r#"{"state":"ready","locale":"ar"}"#).unwrap();
        assert_eq!(launch_locale(&directory), Locale::Ar);
        // The newer record wins when both exist.
        fs::write(directory.join(LAUNCH_APPEARANCE_FILE), r#"{"locale":"en"}"#).unwrap();
        assert_eq!(launch_locale(&directory), Locale::En);
        fs::remove_dir_all(&directory).unwrap();
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
    #[test]
    fn quitting_is_held_back_only_while_the_shops_migrate() {
        let directory = std::env::temp_dir().join(format!("sf-launch-quit-{}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let trace = directory.join(STARTUP_TRACE_FILE);
        let write = |stage: &str| {
            let body = format!(
                r#"{{"formatVersion":1,"appVersion":"x","events":[{{"stage":"{stage}","attempt":null,"createdAtUnixMilliseconds":1000}}]}}"#
            );
            fs::write(&trace, body).unwrap();
        };
        assert!(!quit_is_safe(&trace), "no trace yet");
        write("workspace-window-pending");
        assert!(!quit_is_safe(&trace));
        write("migration-started");
        assert!(!quit_is_safe(&trace));
        write("migration-complete");
        assert!(quit_is_safe(&trace));
        write("runtime-attempt-started");
        assert!(quit_is_safe(&trace));
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn arabic_copy_avoids_marks_the_native_renderer_draws_detached() {
        // GDI+ places the tanween of "جارٍ" beside the word instead of on it.
        let text = copy(Locale::Ar);
        for line in [
            text.preparing,
            text.starting,
            text.retrying,
            text.opening,
            text.closing,
        ] {
            assert!(
                !line.chars().any(|c| ('\u{064B}'..='\u{0652}').contains(&c)),
                "Arabic diacritic in {line:?}"
            );
        }
    }

    // A normal first launch takes about 32 s on the reference machine.
    const _: () = assert!(SLOW_HINT_AFTER_SECS >= 40);

    #[test]
    fn the_slow_hint_waits_longer_than_a_normal_launch() {
        // A normal first launch takes about 32 s on the reference machine.
        assert_eq!(SLOW_HINT_AFTER, Duration::from_secs(SLOW_HINT_AFTER_SECS));
    }

    #[test]
    fn every_locale_has_its_closing_and_hint_copy() {
        for locale in [Locale::Ar, Locale::Fr, Locale::En] {
            let text = copy(locale);
            assert!(!text.closing.is_empty() && !text.slow_hint.is_empty());
            assert!(
                !text.starting.contains("SahelFlow"),
                "the brand is already the wordmark; it must not repeat inside a sentence"
            );
        }
    }
}
