//! FD-068 native launch splash: the first pixels SahelFlow paints.
//!
//! The WebView launch window could only appear after Tauri had built the
//! hidden workspace WebView2 and then a second WebView2 for itself, so a cold
//! launch showed nothing for seconds. This splash is a plain Win32 layered
//! window drawn with GDI+, started at the top of `main` before the
//! survivability controller, Tauri or any WebView exists. It paints within a
//! frame of the click.
//!
//! It keeps every FD-068 boundary: presentation only, no IPC and no business
//! data; it never navigates and never decides readiness. It mirrors the
//! durable startup trace into honest stage copy and a numeric percent that
//! never reaches 100 before the workspace is visible, and it fades out as soon
//! as the `main` window becomes visible (the workspace or the bounded recovery
//! document). It is never shown during installation-root rotation, nor when
//! another SahelFlow instance already runs. If it cannot start, the WebView
//! launch window remains the fallback; nothing about startup depends on it.
//!
//! The card follows the seller's language and colour mode (both recorded by the
//! previous launch) and carries Minimize and Close chips. Closing it means
//! "quit SahelFlow", never "hide a launch that carries on invisibly".

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, AtomicU8, Ordering};

use crate::launch_screen::{self, Appearance, Phase, Preset, Theme};

const STATE_IDLE: u8 = 0;
const STATE_STARTING: u8 = 1;
const STATE_RUNNING: u8 = 2;
const STATE_FAILED: u8 = 3;
const STATE_CLOSED: u8 = 4;

static STATE: AtomicU8 = AtomicU8::new(STATE_IDLE);
static CLOSE_REQUESTED: AtomicBool = AtomicBool::new(false);
static QUIT_REQUESTED: AtomicBool = AtomicBool::new(false);
static WINDOW: AtomicIsize = AtomicIsize::new(0);
static STARTED_UNIX_MS: AtomicU64 = AtomicU64::new(0);
static PAINTED_UNIX_MS: AtomicU64 = AtomicU64::new(0);

const IDENTIFIER: &str = "com.sahelflow.desktop";

/// Start the splash on its own UI thread. Returns immediately.
pub fn start() {
    if STATE
        .compare_exchange(
            STATE_IDLE,
            STATE_STARTING,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_err()
    {
        return;
    }
    let Some(app_data_dir) = app_data_dir() else {
        STATE.store(STATE_FAILED, Ordering::SeqCst);
        return;
    };
    let started_unix_ms = unix_milliseconds();
    STARTED_UNIX_MS.store(started_unix_ms, Ordering::SeqCst);
    let spawned = std::thread::Builder::new()
        .name("sahelflow-native-splash".to_string())
        .spawn(move || {
            #[cfg(windows)]
            imp::run(&app_data_dir, started_unix_ms);
            #[cfg(not(windows))]
            {
                let _ = (&app_data_dir, started_unix_ms);
                STATE.store(STATE_FAILED, Ordering::SeqCst);
            }
        });
    if spawned.is_err() {
        STATE.store(STATE_FAILED, Ordering::SeqCst);
    }
}

/// When `main` began (the splash starts on its first line), for the trace.
pub fn process_started_unix_ms() -> Option<u64> {
    Some(STARTED_UNIX_MS.load(Ordering::SeqCst)).filter(|value| *value > 0)
}

/// When the splash's first frame reached the screen, for the trace.
pub fn painted_unix_ms() -> Option<u64> {
    Some(PAINTED_UNIX_MS.load(Ordering::SeqCst)).filter(|value| *value > 0)
}

/// True while the native splash is starting or visible. When false, the
/// caller falls back to the WebView launch window.
pub fn is_active() -> bool {
    matches!(STATE.load(Ordering::SeqCst), STATE_STARTING | STATE_RUNNING)
}

/// Fade out and close. Safe to call at any time, from any thread.
pub fn request_close() {
    CLOSE_REQUESTED.store(true, Ordering::SeqCst);
}

/// True once the seller closed the startup card. Closing it means "quit
/// SahelFlow": it must never leave a launch running invisibly.
pub fn quit_requested() -> bool {
    QUIT_REQUESTED.load(Ordering::SeqCst)
}

/// A second launch while the workspace is still hidden brings the splash
/// forward instead of doing nothing.
pub fn bring_to_front() {
    #[cfg(windows)]
    imp::bring_to_front(WINDOW.load(Ordering::SeqCst));
}

fn app_data_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|root| PathBuf::from(root).join(IDENTIFIER))
    }
    #[cfg(not(windows))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share"))
            })
            .map(|root| root.join(IDENTIFIER))
    }
}

fn unix_milliseconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Platform-neutral model: layout, palette, window chips, timeline easing and
// honest progress. Unit-tested.
// ---------------------------------------------------------------------------

/// Logical size of the splash card in device-independent pixels.
pub(crate) const CARD_WIDTH: f32 = 600.0;
pub(crate) const CARD_HEIGHT: f32 = 360.0;
/// Transparent border around the card: room for its soft shadow.
pub(crate) const SHADOW_MARGIN: f32 = 40.0;
const SHADOW_LAYERS: u32 = 16;
const SHADOW_STEP: f32 = 1.75;
const SHADOW_DROP: f32 = 10.0;
const SHADOW_FALLOFF: f32 = 2.4;
const CARD_RADIUS: f32 = 14.0;
const MARK_SIZE: f32 = 78.0;
const MARK_TOP: f32 = 50.0;
const MARK_CENTER_Y: f32 = MARK_TOP + MARK_SIZE / 2.0;
const GLOW_RADIUS: f32 = 86.0;
const WORDMARK_TOP: f32 = 138.0;
const TAGLINE_TOP: f32 = 186.0;
const STATUS_TOP: f32 = 244.0;
const BAR_TOP: f32 = 275.0;
const BAR_HEIGHT: f32 = 3.0;
const HINT_TOP: f32 = 294.0;
const VERSION_TOP: f32 = 329.0;
/// Distance of the progress group from the card's start and end edges.
const EDGE_INSET: f32 = 48.0;
const PERCENT_WIDTH: f32 = 56.0;
const ENTRANCE_MS: f32 = 220.0;
const ENTRANCE_FLOOR: f32 = 0.55;
const SLOW_HINT_AFTER_MS: f32 = launch_screen::SLOW_HINT_AFTER_SECS as f32 * 1_000.0;
const FADE_OUT_MS: f32 = 170.0;
/// Every entrance animation has finished by this time. The static part of the
/// card (shadow, mark, wordmark, tagline, version) is then painted once and
/// cached, so a steady frame only redraws what can change.
const INTRO_LENGTH_MS: f32 = 1_700.0;
/// A launch still starting after this long is a hang, not a slow start. The
/// card stays until the workspace or the recovery document is visible.
const MAX_LIFETIME_MS: f32 = 30.0 * 60.0 * 1_000.0;

pub(crate) fn clamp01(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}

pub(crate) fn ease_out_cubic(value: f32) -> f32 {
    let inverse = 1.0 - clamp01(value);
    1.0 - inverse * inverse * inverse
}

/// Overshooting ease used when the dot "lands".
pub(crate) fn ease_out_back(value: f32) -> f32 {
    let t = clamp01(value);
    let c1 = 1.70158_f32;
    let c3 = c1 + 1.0;
    1.0 + c3 * (t - 1.0).powi(3) + c1 * (t - 1.0).powi(2)
}

/// Progress of one animated element: `delay` and `duration` in milliseconds.
pub(crate) fn timeline(elapsed_ms: f32, delay_ms: f32, duration_ms: f32) -> f32 {
    clamp01((elapsed_ms - delay_ms) / duration_ms)
}

/// An element rising into place: its opacity and how far below its final
/// position it still is (in card pixels).
pub(crate) fn rise(elapsed_ms: f32, delay_ms: f32) -> (f32, f32) {
    let progress = ease_out_cubic(timeline(elapsed_ms, delay_ms, 520.0));
    (progress, 6.0 * (1.0 - progress))
}

pub(crate) const fn argb(alpha: u8, red: u8, green: u8, blue: u8) -> u32 {
    ((alpha as u32) << 24) | ((red as u32) << 16) | ((green as u32) << 8) | blue as u32
}

/// An opaque colour from `0xRRGGBB`.
const fn rgb(hex: u32) -> u32 {
    0xFF00_0000 | hex
}

/// A colour from `0xRRGGBB` at a given opacity in percent.
const fn rgb_percent(hex: u32, percent: u32) -> u32 {
    (((percent * 255 + 50) / 100) << 24) | (hex & 0x00FF_FFFF)
}

pub(crate) fn with_alpha(color: u32, opacity: f32) -> u32 {
    let alpha = ((color >> 24) as f32 * clamp01(opacity)).round() as u32;
    (alpha << 24) | (color & 0x00FF_FFFF)
}

/// The colours that come straight from the workspace's own theme CSS (dark:
/// `theme-preset-system.css`; light: `product-system.css`). The contract test
/// `src/lib/__tests__/startup-card-palette-contract.test.ts` derives them from
/// those files and fails, printing the expected values, if this table drifts.
#[derive(Clone, Copy)]
struct Tokens {
    /// The card surface (`--card`, dark: `--surface-1`).
    top: u32,
    /// The canvas (`--background`, dark: `--surface-0`).
    bottom: u32,
    /// `--foreground`.
    ink: u32,
    /// `--muted-foreground`.
    muted: u32,
    /// The preset's accent (`--primary`).
    primary: u32,
    /// `--border` as an opaque colour and its opacity in percent.
    border: (u32, u32),
}

// BEGIN TOKENS (kept equal to the CSS by the contract test above)
const fn tokens(theme: Theme, preset: Preset) -> Tokens {
    match (theme, preset) {
        (Theme::Light, Preset::Sahel) => Tokens {
            top: 0xFEFEFC,
            bottom: 0xFAFAF7,
            ink: 0x0D0E08,
            muted: 0x505146,
            primary: 0x008528,
            border: (0xDDDFD6, 100),
        },
        (Theme::Dark, Preset::Sahel) => Tokens {
            top: 0x101113,
            bottom: 0x090A0C,
            ink: 0xF2F0EC,
            muted: 0xA7A49E,
            primary: 0x43B966,
            border: (0xEDEBE7, 12),
        },
        (Theme::Light, Preset::Atlas) => Tokens {
            top: 0xFEFEFF,
            bottom: 0xF8F8FE,
            ink: 0x0D0E08,
            muted: 0x505146,
            primary: 0x6B51DB,
            border: (0xD9D9E6, 100),
        },
        (Theme::Dark, Preset::Atlas) => Tokens {
            top: 0x101113,
            bottom: 0x090A0C,
            ink: 0xF2F0EC,
            muted: 0xA7A49E,
            primary: 0x9C95FE,
            border: (0xEDEBE7, 12),
        },
        (Theme::Light, Preset::Oasis) => Tokens {
            top: 0xFBFFFF,
            bottom: 0xF4FBFB,
            ink: 0x0D0E08,
            muted: 0x505146,
            primary: 0x007E8F,
            border: (0xCFDEE0, 100),
        },
        (Theme::Dark, Preset::Oasis) => Tokens {
            top: 0x101113,
            bottom: 0x090A0C,
            ink: 0xF2F0EC,
            muted: 0xA7A49E,
            primary: 0x00BDB6,
            border: (0xEDEBE7, 12),
        },
        (Theme::Light, Preset::Dune) => Tokens {
            top: 0xFFFDFB,
            bottom: 0xFEF8F3,
            ink: 0x0D0E08,
            muted: 0x505146,
            primary: 0xAB5A00,
            border: (0xE4D8CE, 100),
        },
        (Theme::Dark, Preset::Dune) => Tokens {
            top: 0x101113,
            bottom: 0x090A0C,
            ink: 0xF2F0EC,
            muted: 0xA7A49E,
            primary: 0xE4A250,
            border: (0xEDEBE7, 12),
        },
    }
}
// END TOKENS

/// One channel of `mix`.
const fn mix_channel(from: u32, to: u32, percent: u32, shift: u32) -> u32 {
    let a = (from >> shift) & 0xFF;
    let b = (to >> shift) & 0xFF;
    ((a * (100 - percent) + b * percent + 50) / 100) << shift
}

/// Blend `from` toward `to` by `percent` (per channel, rounded).
const fn mix(from: u32, to: u32, percent: u32) -> u32 {
    mix_channel(from, to, percent, 16)
        | mix_channel(from, to, percent, 8)
        | mix_channel(from, to, percent, 0)
}

/// Every colour of the card for one look. Text is checked against both ends of
/// the card gradient (4.5:1) and the bar and icons at 3:1, for all 8 looks, in
/// the tests.
#[derive(Clone, Copy)]
pub(crate) struct Palette {
    pub(crate) card_top: u32,
    pub(crate) card_bottom: u32,
    pub(crate) border: u32,
    /// The wordmark.
    pub(crate) ink: u32,
    /// The status line.
    pub(crate) text: u32,
    /// The tagline, percent, slow hint, version and chip icons.
    pub(crate) muted: u32,
    pub(crate) bar_start: u32,
    pub(crate) bar_end: u32,
    pub(crate) track: u32,
    pub(crate) chip_hover: u32,
    pub(crate) chip_pressed: u32,
    /// The light behind the mark: the brand sky, whatever the preset.
    pub(crate) glow: u32,
    /// The canonical SahelFlow mark (public/brand/sahelflow-logo.svg).
    pub(crate) mark_upper: (u32, u32),
    pub(crate) mark_lower: (u32, u32),
    pub(crate) mark_dot: u32,
    /// Opacity (out of 255) of the strongest shadow layer.
    pub(crate) shadow_peak: u8,
}

const WHITE: u32 = rgb(0xFFFFFF);
/// The Close chip under the pointer, the same red Windows uses.
const CLOSE_HOVER: u32 = rgb(0xC42B1C);
const CLOSE_PRESSED: u32 = rgb(0xA32519);

const fn build(theme: Theme, preset: Preset) -> Palette {
    let t = tokens(theme, preset);
    let dark = matches!(theme, Theme::Dark);
    Palette {
        card_top: rgb(t.top),
        card_bottom: rgb(t.bottom),
        border: rgb_percent(t.border.0, t.border.1),
        ink: rgb(t.ink),
        text: rgb(mix(t.ink, t.muted, 45)),
        muted: rgb(t.muted),
        // The bar runs from a deeper to a lighter step of the preset accent.
        bar_start: rgb(if dark {
            mix(t.primary, 0x000000, 12)
        } else {
            mix(t.primary, 0x000000, 14)
        }),
        bar_end: rgb(if dark {
            mix(t.primary, 0xFFFFFF, 28)
        } else {
            t.primary
        }),
        track: rgb_percent(t.ink, 10),
        chip_hover: rgb_percent(t.ink, 9),
        chip_pressed: rgb_percent(t.ink, 15),
        glow: if dark {
            rgb_percent(0x38BDF8, 14)
        } else {
            rgb_percent(0x0EA5E9, 10)
        },
        mark_upper: if dark {
            (rgb(0x7DD3FC), rgb(0x0EA5E9))
        } else {
            (rgb(0x38BDF8), rgb(0x0284C7))
        },
        mark_lower: if dark {
            (rgb(0x0284C7), rgb(0x0C4A6E))
        } else {
            (rgb(0x0369A1), rgb(0x0C4A6E))
        },
        mark_dot: if dark { rgb(0x7DD3FC) } else { rgb(0x0EA5E9) },
        shadow_peak: if dark { 17 } else { 10 },
    }
}

pub(crate) fn palette(look: Appearance) -> Palette {
    build(look.theme, look.preset)
}

/// The two window controls in the card's top corner at the end edge.
const CHIP_WIDTH: f32 = 36.0;
const CHIP_HEIGHT: f32 = 28.0;
const CHIP_INSET: f32 = 6.0;
const CHIP_GAP: f32 = 2.0;
const CHIP_RADIUS: f32 = 6.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Chip {
    Minimize,
    Close,
}

/// The chip's box in card pixels as `(x, y, width, height)`. Close sits in the
/// corner nearest the end edge (top right, or top left in Arabic) and Minimize
/// beside it, toward the centre.
pub(crate) fn chip_rect(chip: Chip, rtl: bool) -> (f32, f32, f32, f32) {
    let slot = match chip {
        Chip::Close => 0.0,
        Chip::Minimize => 1.0,
    };
    let offset = CHIP_INSET + slot * (CHIP_WIDTH + CHIP_GAP);
    let x = if rtl {
        offset
    } else {
        CARD_WIDTH - offset - CHIP_WIDTH
    };
    (x, CHIP_INSET, CHIP_WIDTH, CHIP_HEIGHT)
}

/// Which chip, if any, is under a point given in card pixels.
pub(crate) fn chip_at(x: f32, y: f32, rtl: bool) -> Option<Chip> {
    [Chip::Close, Chip::Minimize].into_iter().find(|chip| {
        let (left, top, width, height) = chip_rect(*chip, rtl);
        x >= left && x < left + width && y >= top && y < top + height
    })
}

/// The honest progress model. The trace stage sets a band; the shown value
/// creeps inside it and is eased on screen, never claiming a stage that has
/// not happened and never reaching 100 before the workspace is visible.
#[derive(Clone, Copy, Debug)]
pub(crate) struct Progress {
    pub(crate) phase: Phase,
    target: f32,
    pub(crate) shown: f32,
}

impl Progress {
    pub(crate) fn new() -> Self {
        Self {
            phase: Phase::Preparing,
            target: 0.04,
            shown: 0.0,
        }
    }

    /// Fold the latest trace stage in (called a few times per second).
    pub(crate) fn observe(&mut self, stage: Option<&str>) {
        let (phase, floor, ceiling) = launch_screen::stage_band(stage);
        self.phase = phase;
        self.target = launch_screen::next_progress(self.target, floor, ceiling);
    }

    /// Ease the displayed value toward the target (called every frame).
    pub(crate) fn tick(&mut self) {
        self.shown += (self.target - self.shown) * 0.12;
        self.shown = self.shown.clamp(0.0, 0.99);
    }

    pub(crate) fn percent(&self) -> u32 {
        ((self.shown * 100.0).round() as u32).clamp(1, 99)
    }
}

/// The trace on disk still holds the previous launch until this launch's
/// Tauri setup resets it. Only a trace whose first event was written after
/// this process started describes this launch.
pub(crate) fn current_launch_stage(trace_path: &Path, started_unix_ms: u64) -> Option<String> {
    let (first_event_ms, stage) = launch_screen::latest_stage_with_origin(trace_path)?;
    // Allow a little clock jitter between the splash and the trace writer.
    if first_event_ms + 2_000 < started_unix_ms {
        return None;
    }
    stage
}

// ---------------------------------------------------------------------------
// Windows renderer: Win32 layered window + GDI+.
// ---------------------------------------------------------------------------

#[cfg(windows)]
mod imp {
    use super::*;
    use crate::launch_screen::Locale;
    use std::cell::RefCell;
    use std::sync::atomic::AtomicU32;
    use std::time::Instant;

    use windows_sys::Win32::Foundation::{
        CloseHandle, COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM,
    };
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW,
        MonitorFromPoint, ReleaseDC, ScreenToClient, SelectObject, AC_SRC_ALPHA, AC_SRC_OVER,
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
        MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
    };
    use windows_sys::Win32::Graphics::GdiPlus::*;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::{OpenMutexW, SYNCHRONIZATION_SYNCHRONIZE};
    use windows_sys::Win32::UI::HiDpi::GetDpiForSystem;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{ReleaseCapture, SetCapture};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetCursorPos,
        GetMessageW, IsIconic, KillTimer, LoadCursorW, LoadImageW, PostQuitMessage,
        RegisterClassExW, SendMessageW, SetForegroundWindow, SetTimer, ShowWindow, ShowWindowAsync,
        SystemParametersInfoW, TranslateMessage, UpdateLayeredWindow, WindowFromPoint, HTCAPTION,
        HTCLIENT, ICON_BIG, ICON_SMALL, IDC_ARROW, IMAGE_ICON, LR_SHARED, MSG,
        SPI_GETCLIENTAREAANIMATION, SW_MINIMIZE, SW_RESTORE, SW_SHOW, ULW_ALPHA, WM_CANCELMODE,
        WM_CAPTURECHANGED, WM_CLOSE, WM_DESTROY, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_NCHITTEST,
        WM_SETICON, WM_TIMER, WNDCLASSEXW, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOPMOST,
        WS_MINIMIZEBOX, WS_POPUP,
    };

    const PIXEL_FORMAT_32BPP_PARGB: i32 = 0x000E_200B;
    const TIMER_ID: usize = 1;
    const INTRO_FRAME_MS: u32 = 33;
    const STEADY_FRAME_MS: u32 = 66;
    const TRACE_POLL_MS: u128 = 200;
    const APP_ICON_RESOURCE: usize = 32_512;
    /// Letter-spacing of the small Latin tagline, in card pixels.
    const TAGLINE_TRACKING: f32 = 1.8;

    thread_local! {
        static RENDERER: RefCell<Option<Renderer>> = const { RefCell::new(None) };
    }

    // The pointer state is shared with the window procedure through atomics, so
    // a hit test or a click never needs the renderer (which may be mid-frame).
    const NO_CHIP: u8 = 0;
    const MINIMIZE_CHIP: u8 = 1;
    const CLOSE_CHIP: u8 = 2;
    static HOVERED: AtomicU8 = AtomicU8::new(NO_CHIP);
    static PRESSED: AtomicU8 = AtomicU8::new(NO_CHIP);
    static HIT_SCALE_MILLI: AtomicU32 = AtomicU32::new(1_000);
    static HIT_RTL: AtomicBool = AtomicBool::new(false);

    fn chip_code(chip: Option<Chip>) -> u8 {
        match chip {
            None => NO_CHIP,
            Some(Chip::Minimize) => MINIMIZE_CHIP,
            Some(Chip::Close) => CLOSE_CHIP,
        }
    }

    fn chip_from_code(code: u8) -> Option<Chip> {
        match code {
            MINIMIZE_CHIP => Some(Chip::Minimize),
            CLOSE_CHIP => Some(Chip::Close),
            _ => None,
        }
    }

    /// Which chip is under a point given in window (device) pixels.
    fn chip_under(device_x: i32, device_y: i32) -> Option<Chip> {
        let scale = HIT_SCALE_MILLI.load(Ordering::Relaxed) as f32 / 1_000.0;
        let x = device_x as f32 / scale - SHADOW_MARGIN;
        let y = device_y as f32 / scale - SHADOW_MARGIN;
        chip_at(x, y, HIT_RTL.load(Ordering::Relaxed))
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    pub(super) fn bring_to_front(window: isize) {
        if window != 0 {
            unsafe {
                let handle = window as HWND;
                if IsIconic(handle) != 0 {
                    ShowWindowAsync(handle, SW_RESTORE);
                }
                SetForegroundWindow(handle);
            }
        }
    }

    /// Another SahelFlow instance owns the single-instance mutex: the click
    /// will only focus it, so no splash should flash.
    fn another_instance_running() -> bool {
        let name = wide(&format!("{IDENTIFIER}-sim"));
        unsafe {
            let handle = OpenMutexW(SYNCHRONIZATION_SYNCHRONIZE, 0, name.as_ptr());
            if handle.is_null() {
                false
            } else {
                CloseHandle(handle);
                true
            }
        }
    }

    fn reduced_motion() -> bool {
        let mut enabled: i32 = 1;
        let ok = unsafe {
            SystemParametersInfoW(
                SPI_GETCLIENTAREAANIMATION,
                0,
                (&mut enabled as *mut i32).cast(),
                0,
            )
        };
        ok != 0 && enabled == 0
    }

    struct Fonts {
        family: *mut GpFontFamily,
        word_family: *mut GpFontFamily,
        word: *mut GpFont,
        body: *mut GpFont,
        small: *mut GpFont,
        tiny: *mut GpFont,
        center: *mut GpStringFormat,
        center_rtl: *mut GpStringFormat,
        near: *mut GpStringFormat,
        near_rtl: *mut GpStringFormat,
        far: *mut GpStringFormat,
    }

    impl Fonts {
        unsafe fn create(locale: Locale) -> Option<Self> {
            let family_named = |name: &str| {
                let mut family: *mut GpFontFamily = std::ptr::null_mut();
                let name = wide(name);
                let status =
                    GdipCreateFontFamilyFromName(name.as_ptr(), std::ptr::null_mut(), &mut family);
                if status == Ok {
                    family
                } else {
                    std::ptr::null_mut()
                }
            };
            let mut family = family_named(if locale == Locale::Ar {
                "Segoe UI"
            } else {
                "Segoe UI Variable Text"
            });
            if family.is_null() {
                family = family_named("Segoe UI");
            }
            if family.is_null() {
                family = family_named("Tahoma");
            }
            if family.is_null() {
                return None;
            }
            // The wordmark is Segoe UI Semibold when installed (every supported
            // Windows), else the regular family in bold.
            let word_family = family_named("Segoe UI Semibold");
            let font = |source: *mut GpFontFamily, size: f32, style: i32| {
                let mut font: *mut GpFont = std::ptr::null_mut();
                GdipCreateFont(source, size, style, UnitPixel, &mut font);
                font
            };
            let word = if word_family.is_null() {
                font(family, 29.0, FontStyleBold)
            } else {
                font(word_family, 29.0, FontStyleRegular)
            };
            let format = |rtl: bool, align: StringAlignment| {
                let mut format: *mut GpStringFormat = std::ptr::null_mut();
                // NoClip: the measured box is the layout width. Clipping it
                // cut the last glyph, so an installed splash read "Sahe Flo".
                let mut flags = StringFormatFlagsNoWrap | StringFormatFlagsNoClip;
                if rtl {
                    flags |= StringFormatFlagsDirectionRightToLeft;
                }
                GdipCreateStringFormat(flags, 0, &mut format);
                GdipSetStringFormatAlign(format, align);
                GdipSetStringFormatLineAlign(format, StringAlignmentNear);
                format
            };
            let fonts = Self {
                family,
                word_family,
                word,
                body: font(family, 13.5, FontStyleRegular),
                small: font(family, 11.5, FontStyleRegular),
                tiny: font(family, 11.0, FontStyleRegular),
                center: format(false, StringAlignmentCenter),
                center_rtl: format(true, StringAlignmentCenter),
                near: format(false, StringAlignmentNear),
                near_rtl: format(true, StringAlignmentNear),
                far: format(false, StringAlignmentFar),
            };
            if fonts.word.is_null()
                || fonts.body.is_null()
                || fonts.small.is_null()
                || fonts.tiny.is_null()
                || fonts.center.is_null()
                || fonts.center_rtl.is_null()
                || fonts.near.is_null()
                || fonts.near_rtl.is_null()
                || fonts.far.is_null()
            {
                fonts.destroy();
                return None;
            }
            Some(fonts)
        }

        unsafe fn destroy(&self) {
            for font in [self.word, self.body, self.small, self.tiny] {
                if !font.is_null() {
                    GdipDeleteFont(font);
                }
            }
            for format in [
                self.center,
                self.center_rtl,
                self.near,
                self.near_rtl,
                self.far,
            ] {
                if !format.is_null() {
                    GdipDeleteStringFormat(format);
                }
            }
            for family in [self.family, self.word_family] {
                if !family.is_null() {
                    GdipDeleteFontFamily(family);
                }
            }
        }
    }

    /// What a steady frame draws, so an unchanged frame is not redrawn.
    type Signature = (i32, u32, u8, u8, u8, u8, bool);

    struct Renderer {
        window: HWND,
        width: i32,
        height: i32,
        scale: f32,
        memory_dc: HDC,
        dib: HBITMAP,
        previous: HGDIOBJ,
        bits: *mut u8,
        byte_len: usize,
        bitmap: *mut GpBitmap,
        graphics: *mut GpGraphics,
        fonts: Fonts,
        locale: Locale,
        palette: Palette,
        copy: launch_screen::LaunchCopy,
        version: String,
        trace_path: PathBuf,
        started_unix_ms: u64,
        shown_at: Instant,
        last_poll: Instant,
        progress: Progress,
        reduced_motion: bool,
        steady: bool,
        closing_since: Option<Instant>,
        /// The shadow and the card, painted once.
        base: Vec<u8>,
        /// Everything that no longer changes once the entrance has finished.
        settled: Vec<u8>,
        last_signature: Option<Signature>,
    }

    impl Renderer {
        unsafe fn destroy(&mut self) {
            if !self.graphics.is_null() {
                GdipDeleteGraphics(self.graphics);
            }
            if !self.bitmap.is_null() {
                GdipDisposeImage(self.bitmap.cast());
            }
            self.fonts.destroy();
            if !self.memory_dc.is_null() {
                SelectObject(self.memory_dc, self.previous);
                DeleteDC(self.memory_dc);
            }
            if !self.dib.is_null() {
                DeleteObject(self.dib);
            }
        }

        fn rtl(&self) -> bool {
            self.locale == Locale::Ar
        }

        fn elapsed_ms(&self) -> f32 {
            if self.reduced_motion {
                return 10_000.0;
            }
            self.shown_at.elapsed().as_secs_f32() * 1_000.0
        }

        /// The pointer is over a chip when the splash is the window under it.
        unsafe fn sync_hover(&self) {
            let mut point = POINT { x: 0, y: 0 };
            let mut hovered = NO_CHIP;
            if !quit_requested()
                && GetCursorPos(&mut point) != 0
                && WindowFromPoint(point) == self.window
                && ScreenToClient(self.window, &mut point) != 0
            {
                hovered = chip_code(chip_under(point.x, point.y));
            }
            HOVERED.store(hovered, Ordering::Relaxed);
        }

        fn signature(&self, lifetime_ms: f32) -> Signature {
            let track = CARD_WIDTH - EDGE_INSET * 2.0;
            let hint = clamp01((lifetime_ms - SLOW_HINT_AFTER_MS) / 800.0);
            (
                (self.progress.shown * track * self.scale) as i32,
                self.progress.percent(),
                self.progress.phase as u8,
                (hint * 16.0) as u8,
                HOVERED.load(Ordering::Relaxed),
                PRESSED.load(Ordering::Relaxed),
                quit_requested(),
            )
        }

        /// Returns false once the fade-out has finished.
        unsafe fn frame(&mut self) -> bool {
            if self.last_poll.elapsed().as_millis() >= TRACE_POLL_MS {
                self.last_poll = Instant::now();
                let stage = current_launch_stage(&self.trace_path, self.started_unix_ms);
                self.progress.observe(stage.as_deref());
            }
            self.progress.tick();

            let lifetime_ms = self.shown_at.elapsed().as_secs_f32() * 1_000.0;
            if self.closing_since.is_none()
                && (CLOSE_REQUESTED.load(Ordering::SeqCst) || lifetime_ms > MAX_LIFETIME_MS)
            {
                self.closing_since = Some(Instant::now());
            }
            let opacity = match self.closing_since {
                Some(since) => 1.0 - since.elapsed().as_secs_f32() * 1_000.0 / FADE_OUT_MS,
                None => 1.0,
            };
            if opacity <= 0.0 {
                return false;
            }

            let t = self.elapsed_ms();
            if !self.steady && t > INTRO_LENGTH_MS {
                self.steady = true;
                SetTimer(self.window, TIMER_ID, STEADY_FRAME_MS, None);
            }
            // Nothing to show while minimized; repaint on the way back.
            if IsIconic(self.window) != 0 {
                self.last_signature = None;
                return true;
            }
            self.sync_hover();

            // A short fade-in, so the card arrives instead of popping. It
            // starts already visible: the first frame is never blank.
            let entering = !self.reduced_motion && lifetime_ms < ENTRANCE_MS;
            let signature = self.signature(lifetime_ms);
            if self.steady
                && !entering
                && self.closing_since.is_none()
                && self.last_signature == Some(signature)
            {
                return true;
            }
            self.last_signature = Some(signature);

            let entrance = if entering {
                let arrival = ease_out_cubic(timeline(lifetime_ms, 0.0, ENTRANCE_MS));
                ENTRANCE_FLOOR + (1.0 - ENTRANCE_FLOOR) * arrival
            } else {
                1.0
            };
            self.paint(t);
            self.present(clamp01(opacity * entrance));
            true
        }

        unsafe fn present(&self, opacity: f32) {
            let size = SIZE {
                cx: self.width,
                cy: self.height,
            };
            let source = POINT { x: 0, y: 0 };
            let blend = BLENDFUNCTION {
                BlendOp: AC_SRC_OVER as u8,
                BlendFlags: 0,
                SourceConstantAlpha: (opacity * 255.0).round() as u8,
                AlphaFormat: AC_SRC_ALPHA as u8,
            };
            let screen = GetDC(std::ptr::null_mut());
            // No destination point: the window keeps wherever the seller
            // dragged it. (Passing the creation point every frame snapped it
            // back, so the card could not be moved.)
            UpdateLayeredWindow(
                self.window,
                screen,
                std::ptr::null(),
                &size,
                self.memory_dc,
                &source,
                0 as COLORREF,
                &blend,
                ULW_ALPHA,
            );
            ReleaseDC(std::ptr::null_mut(), screen);
        }

        /// Card space: logical pixels with the card's top-left at the origin.
        unsafe fn reset_to_card_space(&self, g: *mut GpGraphics) {
            GdipResetWorldTransform(g);
            GdipScaleWorldTransform(g, self.scale, self.scale, MatrixOrderPrepend);
            GdipTranslateWorldTransform(g, SHADOW_MARGIN, SHADOW_MARGIN, MatrixOrderPrepend);
        }

        unsafe fn copy_in(&self, source: &[u8]) {
            if source.len() == self.byte_len {
                std::ptr::copy_nonoverlapping(source.as_ptr(), self.bits, self.byte_len);
            }
        }

        unsafe fn copy_out(&self) -> Vec<u8> {
            std::slice::from_raw_parts(self.bits, self.byte_len).to_vec()
        }

        /// The shadow and the card: painted once and cached.
        unsafe fn build_base(&mut self) {
            let g = self.graphics;
            let p = self.palette;
            GdipGraphicsClear(g, 0);
            self.reset_to_card_space(g);

            // One soft shadow built from sixteen faint layers, widest first,
            // so the card floats without a visible edge or banding.
            let peak = p.shadow_peak as f32;
            for layer in (0..SHADOW_LAYERS).rev() {
                let falloff = (1.0 - layer as f32 / SHADOW_LAYERS as f32).powf(SHADOW_FALLOFF);
                let alpha = (peak * falloff).round() as u8;
                if alpha == 0 {
                    continue;
                }
                let spread = layer as f32 * SHADOW_STEP;
                let shadow = rounded_rect(
                    -spread,
                    SHADOW_DROP - spread,
                    CARD_WIDTH + spread * 2.0,
                    CARD_HEIGHT + spread * 2.0,
                    CARD_RADIUS + spread,
                );
                fill_solid(g, shadow, argb(alpha, 0, 0, 0));
                GdipDeletePath(shadow);
            }

            // The workspace's own card surface and one hairline edge.
            let card = rounded_rect(0.5, 0.5, CARD_WIDTH - 1.0, CARD_HEIGHT - 1.0, CARD_RADIUS);
            fill_vertical_gradient(g, card, 0.0, CARD_HEIGHT, p.card_top, p.card_bottom);
            let mut pen: *mut GpPen = std::ptr::null_mut();
            GdipCreatePen1(p.border, 1.0, UnitPixel, &mut pen);
            GdipDrawPath(g, pen, card);
            GdipDeletePen(pen);
            GdipDeletePath(card);
            GdipFlush(g, FlushIntentionSync);
            self.base = self.copy_out();
        }

        /// One frame: the cached card plus whatever moves.
        unsafe fn paint(&mut self, t: f32) {
            let g = self.graphics;
            if t >= INTRO_LENGTH_MS {
                if self.settled.is_empty() {
                    self.copy_in(&self.base);
                    self.paint_intro(g, INTRO_LENGTH_MS + 1_000.0);
                    GdipFlush(g, FlushIntentionSync);
                    self.settled = self.copy_out();
                } else {
                    self.copy_in(&self.settled);
                }
            } else {
                self.copy_in(&self.base);
                self.paint_intro(g, t);
            }
            self.paint_dynamic(g, t);
            GdipFlush(g, FlushIntentionSync);
        }

        /// The mark, the wordmark, the tagline and the version: they animate in
        /// once, then never change.
        unsafe fn paint_intro(&self, g: *mut GpGraphics, t: f32) {
            let p = self.palette;
            let rtl = self.rtl();
            self.reset_to_card_space(g);

            self.paint_glow(g, ease_out_cubic(timeline(t, 0.0, 900.0)));
            self.paint_mark(g, t);

            let (alpha, dy) = rise(t, 180.0);
            if alpha > 0.0 {
                // One centred string. Splitting "Sahel" and "Flow" into two
                // measured boxes clipped the last glyph of each half.
                draw_text(
                    g,
                    "SahelFlow",
                    self.fonts.word,
                    self.fonts.center,
                    0.0,
                    WORDMARK_TOP + dy,
                    CARD_WIDTH,
                    with_alpha(p.ink, alpha),
                );
            }

            let (alpha, dy) = rise(t, 260.0);
            if alpha > 0.0 {
                let color = with_alpha(p.muted, alpha);
                if rtl {
                    draw_text(
                        g,
                        self.copy.tagline,
                        self.fonts.small,
                        self.fonts.center_rtl,
                        EDGE_INSET,
                        TAGLINE_TOP + dy,
                        CARD_WIDTH - EDGE_INSET * 2.0,
                        color,
                    );
                } else {
                    draw_tracked(
                        g,
                        &self.copy.tagline.to_uppercase(),
                        self.fonts.small,
                        self.fonts.center,
                        TAGLINE_TOP + dy,
                        TAGLINE_TRACKING,
                        color,
                    );
                }
            }

            let (alpha, _) = rise(t, 380.0);
            draw_text(
                g,
                &self.version,
                self.fonts.tiny,
                self.fonts.center,
                0.0,
                VERSION_TOP,
                CARD_WIDTH,
                with_alpha(p.muted, alpha),
            );
        }

        /// The light behind the mark: one smooth radial falloff.
        unsafe fn paint_glow(&self, g: *mut GpGraphics, strength: f32) {
            if strength <= 0.0 {
                return;
            }
            self.reset_to_card_space(g);
            let mut path: *mut GpPath = std::ptr::null_mut();
            GdipCreatePath(FillModeAlternate, &mut path);
            GdipAddPathEllipse(
                path,
                CARD_WIDTH / 2.0 - GLOW_RADIUS,
                MARK_CENTER_Y - GLOW_RADIUS,
                GLOW_RADIUS * 2.0,
                GLOW_RADIUS * 2.0,
            );
            let mut brush: *mut GpPathGradient = std::ptr::null_mut();
            if GdipCreatePathGradientFromPath(path, &mut brush) == Ok {
                GdipSetPathGradientCenterColor(brush, with_alpha(self.palette.glow, strength));
                let edge = [with_alpha(self.palette.glow, 0.0)];
                let mut count = 1;
                GdipSetPathGradientSurroundColorsWithCount(brush, edge.as_ptr(), &mut count);
                // Position 0 is the rim and 1 the centre; the squared ramp
                // keeps the centre strong and the rim invisible.
                let positions = [0.0_f32, 0.25, 0.5, 0.75, 1.0];
                let factors = [0.0_f32, 0.0625, 0.25, 0.5625, 1.0];
                GdipSetPathGradientBlend(brush, factors.as_ptr(), positions.as_ptr(), 5);
                GdipFillPath(g, brush.cast(), path);
                GdipDeleteBrush(brush.cast());
            }
            GdipDeletePath(path);
        }

        /// Status, percent, the honest bar, the slow hint and the window chips.
        unsafe fn paint_dynamic(&self, g: *mut GpGraphics, t: f32) {
            let p = self.palette;
            let rtl = self.rtl();
            let closing = quit_requested();
            self.reset_to_card_space(g);

            let (alpha, dy) = rise(t, 380.0);
            let status = if closing {
                self.copy.closing
            } else {
                match self.progress.phase {
                    Phase::Preparing => self.copy.preparing,
                    Phase::Starting => self.copy.starting,
                    Phase::Retrying => self.copy.retrying,
                    Phase::Opening => self.copy.opening,
                }
            };
            // The status sits on the start edge and the percent on the end
            // edge (the percent is always left-to-right digits).
            let status_width = CARD_WIDTH - EDGE_INSET * 2.0 - PERCENT_WIDTH - 12.0;
            if rtl {
                draw_text(
                    g,
                    status,
                    self.fonts.body,
                    self.fonts.near_rtl,
                    EDGE_INSET + PERCENT_WIDTH + 12.0,
                    STATUS_TOP + dy,
                    status_width,
                    with_alpha(p.text, alpha),
                );
            } else {
                draw_text(
                    g,
                    status,
                    self.fonts.body,
                    self.fonts.near,
                    EDGE_INSET,
                    STATUS_TOP + dy,
                    status_width,
                    with_alpha(p.text, alpha),
                );
            }
            let percent = format!("{}%", self.progress.percent());
            let (percent_x, percent_format) = if rtl {
                (EDGE_INSET, self.fonts.near)
            } else {
                (CARD_WIDTH - EDGE_INSET - PERCENT_WIDTH, self.fonts.far)
            };
            draw_text(
                g,
                &percent,
                self.fonts.body,
                percent_format,
                percent_x,
                STATUS_TOP + dy,
                PERCENT_WIDTH,
                with_alpha(p.muted, alpha),
            );

            // The honest bar: it only ever shows what the startup trace proved.
            let (alpha, _) = rise(t, 440.0);
            let track_width = CARD_WIDTH - EDGE_INSET * 2.0;
            let track = rounded_rect(
                EDGE_INSET,
                BAR_TOP,
                track_width,
                BAR_HEIGHT,
                BAR_HEIGHT / 2.0,
            );
            fill_solid(g, track, with_alpha(p.track, alpha));
            GdipDeletePath(track);
            let fill_width = (track_width * self.progress.shown).max(BAR_HEIGHT);
            let fill_x = if rtl {
                EDGE_INSET + track_width - fill_width
            } else {
                EDGE_INSET
            };
            let (from, to) = if rtl {
                (p.bar_end, p.bar_start)
            } else {
                (p.bar_start, p.bar_end)
            };
            let fill = rounded_rect(fill_x, BAR_TOP, fill_width, BAR_HEIGHT, BAR_HEIGHT / 2.0);
            fill_horizontal_gradient(
                g,
                fill,
                fill_x,
                fill_x + fill_width,
                with_alpha(from, alpha),
                with_alpha(to, alpha),
            );
            GdipDeletePath(fill);

            let lifetime_ms = self.shown_at.elapsed().as_secs_f32() * 1_000.0;
            if lifetime_ms > SLOW_HINT_AFTER_MS && !closing {
                let hint = clamp01((lifetime_ms - SLOW_HINT_AFTER_MS) / 800.0);
                draw_text(
                    g,
                    self.copy.slow_hint,
                    self.fonts.small,
                    if rtl {
                        self.fonts.center_rtl
                    } else {
                        self.fonts.center
                    },
                    EDGE_INSET,
                    HINT_TOP,
                    CARD_WIDTH - EDGE_INSET * 2.0,
                    with_alpha(p.muted, hint),
                );
            }

            self.paint_chips(g);
        }

        /// Minimize and Close in the corner at the end edge.
        unsafe fn paint_chips(&self, g: *mut GpGraphics) {
            let p = self.palette;
            let rtl = self.rtl();
            let hovered = HOVERED.load(Ordering::Relaxed);
            let pressed = PRESSED.load(Ordering::Relaxed);
            for chip in [Chip::Minimize, Chip::Close] {
                let code = chip_code(Some(chip));
                let is_pressed = pressed == code;
                let is_hovered = hovered == code && (pressed == NO_CHIP || is_pressed);
                let (fill, icon) = match (chip, is_pressed, is_hovered) {
                    (Chip::Close, true, _) => (Some(CLOSE_PRESSED), WHITE),
                    (Chip::Close, false, true) => (Some(CLOSE_HOVER), WHITE),
                    (_, true, _) => (Some(p.chip_pressed), p.ink),
                    (_, false, true) => (Some(p.chip_hover), p.ink),
                    _ => (None, p.muted),
                };
                let (x, y, width, height) = chip_rect(chip, rtl);
                if let Some(color) = fill {
                    let backdrop = rounded_rect(x, y, width, height, CHIP_RADIUS);
                    fill_solid(g, backdrop, color);
                    GdipDeletePath(backdrop);
                }
                let (cx, cy) = (x + width / 2.0, y + height / 2.0);
                match chip {
                    Chip::Minimize => stroke_line(g, cx - 5.0, cy + 0.5, cx + 5.0, cy + 0.5, icon),
                    Chip::Close => {
                        stroke_line(g, cx - 4.5, cy - 4.5, cx + 4.5, cy + 4.5, icon);
                        stroke_line(g, cx - 4.5, cy + 4.5, cx + 4.5, cy - 4.5, icon);
                    }
                }
            }
        }

        /// The SahelFlow mark assembles: two crescents sweep into the S, the
        /// dot lands last. Geometry mirrors public/brand/sahelflow-logo.svg
        /// (viewBox 9 7 50 50).
        unsafe fn paint_mark(&self, g: *mut GpGraphics, t: f32) {
            let p = self.palette;
            let size = MARK_SIZE;
            let unit = size / 50.0;
            let origin_x = CARD_WIDTH / 2.0 - size / 2.0 - 9.0 * unit;
            let origin_y = MARK_TOP - 7.0 * unit;

            let crescent = |center: (f32, f32),
                            cutout: (f32, f32),
                            clip: (f32, f32, f32, f32),
                            pivot: (f32, f32),
                            delay: f32,
                            colors: (u32, u32),
                            gradient: ((f32, f32), (f32, f32))| {
                let progress = ease_out_cubic(timeline(t, delay, 1_000.0));
                if progress <= 0.0 {
                    return;
                }
                self.reset_to_card_space(g);
                GdipTranslateWorldTransform(g, origin_x, origin_y, MatrixOrderPrepend);
                GdipScaleWorldTransform(g, unit, unit, MatrixOrderPrepend);
                GdipTranslateWorldTransform(g, pivot.0, pivot.1, MatrixOrderPrepend);
                GdipRotateWorldTransform(g, -12.0 * (1.0 - progress), MatrixOrderPrepend);
                let grow = 0.82 + 0.18 * progress;
                GdipScaleWorldTransform(g, grow, grow, MatrixOrderPrepend);
                GdipTranslateWorldTransform(g, -pivot.0, -pivot.1, MatrixOrderPrepend);

                let mut outer: *mut GpPath = std::ptr::null_mut();
                GdipCreatePath(FillModeAlternate, &mut outer);
                GdipAddPathEllipse(outer, center.0 - 14.0, center.1 - 14.0, 28.0, 28.0);
                let mut inner: *mut GpPath = std::ptr::null_mut();
                GdipCreatePath(FillModeAlternate, &mut inner);
                GdipAddPathEllipse(inner, cutout.0 - 10.6, cutout.1 - 10.6, 21.2, 21.2);
                let mut region: *mut GpRegion = std::ptr::null_mut();
                GdipCreateRegionPath(outer, &mut region);
                GdipCombineRegionPath(region, inner, CombineModeExclude);
                let clip_rect = RectF {
                    X: clip.0,
                    Y: clip.1,
                    Width: clip.2,
                    Height: clip.3,
                };
                GdipCombineRegionRect(region, &clip_rect, CombineModeExclude);
                let start = PointF {
                    X: gradient.0 .0,
                    Y: gradient.0 .1,
                };
                let end = PointF {
                    X: gradient.1 .0,
                    Y: gradient.1 .1,
                };
                let mut brush: *mut GpLineGradient = std::ptr::null_mut();
                GdipCreateLineBrush(
                    &start,
                    &end,
                    with_alpha(colors.0, progress),
                    with_alpha(colors.1, progress),
                    WrapModeTileFlipXY,
                    &mut brush,
                );
                GdipFillRegion(g, brush.cast(), region);
                GdipDeleteBrush(brush.cast());
                GdipDeleteRegion(region);
                GdipDeletePath(inner);
                GdipDeletePath(outer);
            };
            crescent(
                (31.5, 23.0),
                (35.4, 25.6),
                (31.5, 23.0, 33.0, 41.0),
                (31.5, 23.0),
                0.0,
                p.mark_upper,
                ((17.0, 9.0), (42.0, 34.0)),
            );
            crescent(
                (32.5, 41.0),
                (28.6, 38.4),
                (0.0, 0.0, 32.5, 41.0),
                (32.5, 41.0),
                120.0,
                p.mark_lower,
                ((22.0, 30.0), (47.0, 55.0)),
            );

            let land = timeline(t, 780.0, 550.0);
            if land > 0.0 {
                let scale = 0.2 + 0.8 * ease_out_back(land);
                let radius = 3.1 * scale;
                let dx = -6.0 * (1.0 - land);
                let dy = 6.0 * (1.0 - land);
                self.reset_to_card_space(g);
                GdipTranslateWorldTransform(g, origin_x, origin_y, MatrixOrderPrepend);
                GdipScaleWorldTransform(g, unit, unit, MatrixOrderPrepend);
                let mut dot: *mut GpSolidFill = std::ptr::null_mut();
                GdipCreateSolidFill(with_alpha(p.mark_dot, clamp01(land * 1.6)), &mut dot);
                GdipFillEllipse(
                    g,
                    dot.cast(),
                    47.2 + dx - radius,
                    12.4 + dy - radius,
                    radius * 2.0,
                    radius * 2.0,
                );
                GdipDeleteBrush(dot.cast());
            }
            self.reset_to_card_space(g);
        }
    }

    unsafe fn rounded_rect(x: f32, y: f32, width: f32, height: f32, radius: f32) -> *mut GpPath {
        let mut path: *mut GpPath = std::ptr::null_mut();
        GdipCreatePath(FillModeAlternate, &mut path);
        let r = radius.min(width / 2.0).min(height / 2.0);
        let d = r * 2.0;
        GdipAddPathArc(path, x, y, d, d, 180.0, 90.0);
        GdipAddPathArc(path, x + width - d, y, d, d, 270.0, 90.0);
        GdipAddPathArc(path, x + width - d, y + height - d, d, d, 0.0, 90.0);
        GdipAddPathArc(path, x, y + height - d, d, d, 90.0, 90.0);
        GdipClosePathFigure(path);
        path
    }

    unsafe fn fill_solid(g: *mut GpGraphics, path: *mut GpPath, color: u32) {
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        GdipFillPath(g, brush.cast(), path);
        GdipDeleteBrush(brush.cast());
    }

    unsafe fn fill_vertical_gradient(
        g: *mut GpGraphics,
        path: *mut GpPath,
        top: f32,
        bottom: f32,
        from: u32,
        to: u32,
    ) {
        let start = PointF {
            X: 0.0,
            Y: top - 1.0,
        };
        let end = PointF {
            X: 0.0,
            Y: bottom + 1.0,
        };
        let mut brush: *mut GpLineGradient = std::ptr::null_mut();
        GdipCreateLineBrush(&start, &end, from, to, WrapModeTileFlipXY, &mut brush);
        GdipFillPath(g, brush.cast(), path);
        GdipDeleteBrush(brush.cast());
    }

    unsafe fn fill_horizontal_gradient(
        g: *mut GpGraphics,
        path: *mut GpPath,
        left: f32,
        right: f32,
        from: u32,
        to: u32,
    ) {
        let start = PointF {
            X: left - 0.5,
            Y: 0.0,
        };
        let end = PointF {
            X: right + 0.5,
            Y: 0.0,
        };
        let mut brush: *mut GpLineGradient = std::ptr::null_mut();
        GdipCreateLineBrush(&start, &end, from, to, WrapModeTileFlipXY, &mut brush);
        GdipFillPath(g, brush.cast(), path);
        GdipDeleteBrush(brush.cast());
    }

    /// A round-capped line, for the window chips' icons.
    unsafe fn stroke_line(g: *mut GpGraphics, x1: f32, y1: f32, x2: f32, y2: f32, color: u32) {
        let mut pen: *mut GpPen = std::ptr::null_mut();
        GdipCreatePen1(color, 1.25, UnitPixel, &mut pen);
        GdipSetPenLineCap197819(pen, LineCapRound, LineCapRound, DashCapFlat);
        GdipDrawLine(g, pen, x1, y1, x2, y2);
        GdipDeletePen(pen);
    }

    #[allow(clippy::too_many_arguments)]
    unsafe fn draw_text(
        g: *mut GpGraphics,
        text: &str,
        font: *mut GpFont,
        format: *mut GpStringFormat,
        x: f32,
        y: f32,
        width: f32,
        color: u32,
    ) {
        if color >> 24 == 0 || text.is_empty() {
            return;
        }
        let wide_text = wide(text);
        let rect = RectF {
            X: x,
            Y: y,
            Width: width,
            Height: 56.0,
        };
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        GdipDrawString(
            g,
            wide_text.as_ptr(),
            (wide_text.len() - 1) as i32,
            font,
            &rect,
            format,
            brush.cast(),
        );
        GdipDeleteBrush(brush.cast());
    }

    /// Latin text with letter-spacing, centred on the card. GDI+ has no
    /// tracking, so each glyph is measured with the typographic format (which
    /// has no side padding) and placed. If measuring is unavailable the line is
    /// drawn plainly, centred.
    unsafe fn draw_tracked(
        g: *mut GpGraphics,
        text: &str,
        font: *mut GpFont,
        plain_format: *mut GpStringFormat,
        y: f32,
        tracking: f32,
        color: u32,
    ) {
        let mut typographic: *mut GpStringFormat = std::ptr::null_mut();
        let ready =
            GdipStringFormatGetGenericTypographic(&mut typographic) == Ok && !typographic.is_null();
        let glyphs: Vec<char> = text.chars().collect();
        let mut advances = Vec::with_capacity(glyphs.len());
        if ready {
            for glyph in &glyphs {
                if *glyph == ' ' {
                    // A space measures as nothing without trailing-space flags.
                    advances.push(3.4);
                    continue;
                }
                let one = wide(&glyph.to_string());
                let layout = RectF {
                    X: 0.0,
                    Y: 0.0,
                    Width: 200.0,
                    Height: 60.0,
                };
                let mut bounds = RectF {
                    X: 0.0,
                    Y: 0.0,
                    Width: 0.0,
                    Height: 0.0,
                };
                let status = GdipMeasureString(
                    g,
                    one.as_ptr(),
                    1,
                    font,
                    &layout,
                    typographic,
                    &mut bounds,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                );
                if status != Ok || bounds.Width <= 0.0 {
                    advances.clear();
                    break;
                }
                advances.push(bounds.Width);
            }
        }
        if !ready || advances.len() != glyphs.len() {
            draw_text(
                g,
                text,
                font,
                plain_format,
                EDGE_INSET,
                y,
                CARD_WIDTH - EDGE_INSET * 2.0,
                color,
            );
            return;
        }
        let total: f32 =
            advances.iter().sum::<f32>() + tracking * (glyphs.len().saturating_sub(1)) as f32;
        let mut x = (CARD_WIDTH - total) / 2.0;
        for (glyph, advance) in glyphs.iter().zip(&advances) {
            if *glyph != ' ' {
                draw_text(
                    g,
                    &glyph.to_string(),
                    font,
                    typographic,
                    x,
                    y,
                    advance + 8.0,
                    color,
                );
            }
            x += advance + tracking;
        }
    }

    /// The pointer position in a mouse message (client coordinates).
    fn client_point(lparam: LPARAM) -> (i32, i32) {
        (
            (lparam & 0xFFFF) as u16 as i16 as i32,
            ((lparam >> 16) & 0xFFFF) as u16 as i16 as i32,
        )
    }

    /// A completed click on a chip.
    unsafe fn activate(window: HWND, chip: Chip) {
        match chip {
            Chip::Minimize => {
                ShowWindow(window, SW_MINIMIZE);
            }
            // Closing the card quits SahelFlow, exactly as Alt+F4 does.
            Chip::Close => QUIT_REQUESTED.store(true, Ordering::SeqCst),
        }
    }

    unsafe extern "system" fn window_proc(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match message {
            WM_TIMER => {
                let keep = RENDERER.with(|cell| match cell.try_borrow_mut() {
                    Result::Ok(mut renderer) => {
                        renderer.as_mut().map(|r| r.frame()).unwrap_or(false)
                    }
                    Result::Err(_) => true,
                });
                if !keep {
                    KillTimer(window, TIMER_ID);
                    DestroyWindow(window);
                }
                0
            }
            // The chips are clickable; everywhere else the card drags like a
            // native window.
            WM_NCHITTEST => {
                let (screen_x, screen_y) = client_point(lparam);
                let mut point = POINT {
                    x: screen_x,
                    y: screen_y,
                };
                if ScreenToClient(window, &mut point) != 0 && chip_under(point.x, point.y).is_some()
                {
                    HTCLIENT as LRESULT
                } else {
                    HTCAPTION as LRESULT
                }
            }
            WM_LBUTTONDOWN => {
                let (x, y) = client_point(lparam);
                let chip = chip_under(x, y);
                if chip.is_some() && !quit_requested() {
                    PRESSED.store(chip_code(chip), Ordering::Relaxed);
                    SetCapture(window);
                }
                0
            }
            WM_LBUTTONUP => {
                let pressed = chip_from_code(PRESSED.swap(NO_CHIP, Ordering::Relaxed));
                ReleaseCapture();
                let (x, y) = client_point(lparam);
                if let (Some(pressed), Some(released)) = (pressed, chip_under(x, y)) {
                    if pressed == released && !quit_requested() {
                        activate(window, pressed);
                    }
                }
                0
            }
            // Capture lost to another window, or a modal loop starting: a
            // half-finished click must not stay pressed.
            WM_CAPTURECHANGED => {
                PRESSED.store(NO_CHIP, Ordering::Relaxed);
                0
            }
            WM_CANCELMODE => {
                PRESSED.store(NO_CHIP, Ordering::Relaxed);
                ReleaseCapture();
                0
            }
            // Closing the card (Alt+F4, the taskbar) means "quit SahelFlow". The
            // card keeps showing "Closing" until the app stops; it never hides
            // a launch that carries on invisibly.
            WM_CLOSE => {
                QUIT_REQUESTED.store(true, Ordering::SeqCst);
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(window, message, wparam, lparam),
        }
    }

    fn placement(width: i32, height: i32) -> POINT {
        unsafe {
            let mut cursor = POINT { x: 0, y: 0 };
            GetCursorPos(&mut cursor);
            let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTOPRIMARY);
            let mut info: MONITORINFO = std::mem::zeroed();
            info.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
            let area: RECT = if GetMonitorInfoW(monitor, &mut info) != 0 {
                info.rcWork
            } else {
                RECT {
                    left: 0,
                    top: 0,
                    right: 1366,
                    bottom: 728,
                }
            };
            POINT {
                x: area.left + ((area.right - area.left) - width) / 2,
                y: area.top + ((area.bottom - area.top) - height) / 2,
            }
        }
    }

    pub(super) fn run(app_data_dir: &Path, started_unix_ms: u64) {
        if another_instance_running() {
            STATE.store(STATE_FAILED, Ordering::SeqCst);
            return;
        }
        let mut token: usize = 0;
        let input = GdiplusStartupInput {
            GdiplusVersion: 1,
            DebugEventCallback: 0,
            SuppressBackgroundThread: 0,
            SuppressExternalCodecs: 1,
        };
        if unsafe { GdiplusStartup(&mut token, &input, std::ptr::null_mut()) } != Ok {
            STATE.store(STATE_FAILED, Ordering::SeqCst);
            return;
        }
        let created = unsafe { create(app_data_dir, started_unix_ms) };
        if created {
            STATE.store(STATE_RUNNING, Ordering::SeqCst);
            unsafe {
                let mut message: MSG = std::mem::zeroed();
                while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                    TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
            STATE.store(STATE_CLOSED, Ordering::SeqCst);
        } else {
            STATE.store(STATE_FAILED, Ordering::SeqCst);
        }
        WINDOW.store(0, Ordering::SeqCst);
        RENDERER.with(|cell| {
            if let Result::Ok(mut renderer) = cell.try_borrow_mut() {
                if let Some(mut renderer) = renderer.take() {
                    unsafe { renderer.destroy() };
                }
            }
        });
        unsafe { GdiplusShutdown(token) };
    }

    unsafe fn create(app_data_dir: &Path, started_unix_ms: u64) -> bool {
        let instance = GetModuleHandleW(std::ptr::null());
        let class_name = wide("SahelFlowNativeSplash");
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: 0,
            lpfnWndProc: Some(window_proc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: instance,
            hIcon: std::ptr::null_mut(),
            hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
            hIconSm: std::ptr::null_mut(),
        };
        if RegisterClassExW(&class) == 0 {
            return false;
        }

        let dpi = GetDpiForSystem();
        let scale = if dpi == 0 { 1.0 } else { dpi as f32 / 96.0 };
        let width = ((CARD_WIDTH + SHADOW_MARGIN * 2.0) * scale).round() as i32;
        let height = ((CARD_HEIGHT + SHADOW_MARGIN * 2.0) * scale).round() as i32;
        let position = placement(width, height);
        let title = wide(launch_screen::LAUNCH_WINDOW_TITLE);
        // WS_MINIMIZEBOX lets the taskbar button minimize and restore the card;
        // there is deliberately no system menu.
        let window = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_APPWINDOW,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_POPUP | WS_MINIMIZEBOX,
            position.x,
            position.y,
            width,
            height,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        );
        if window.is_null() {
            return false;
        }

        // The application icon (tauri-build embeds it as resource 32512)
        // gives the taskbar button SahelFlow's identity while it starts.
        let icon = LoadImageW(
            instance,
            APP_ICON_RESOURCE as *const u16,
            IMAGE_ICON,
            0,
            0,
            LR_SHARED,
        );
        if !icon.is_null() {
            SendMessageW(window, WM_SETICON, ICON_BIG as WPARAM, icon as LPARAM);
            SendMessageW(window, WM_SETICON, ICON_SMALL as WPARAM, icon as LPARAM);
        }

        let screen = GetDC(std::ptr::null_mut());
        let memory_dc = CreateCompatibleDC(screen);
        ReleaseDC(std::ptr::null_mut(), screen);
        if memory_dc.is_null() {
            DestroyWindow(window);
            return false;
        }
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };
        let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
        let dib = CreateDIBSection(
            memory_dc,
            &info,
            DIB_RGB_COLORS,
            &mut bits,
            std::ptr::null_mut(),
            0,
        );
        if dib.is_null() || bits.is_null() {
            DeleteDC(memory_dc);
            DestroyWindow(window);
            return false;
        }
        let previous = SelectObject(memory_dc, dib);

        let mut bitmap: *mut GpBitmap = std::ptr::null_mut();
        let mut graphics: *mut GpGraphics = std::ptr::null_mut();
        let locale = launch_screen::launch_locale(app_data_dir);
        let appearance = launch_screen::launch_appearance(app_data_dir);
        let fonts = Fonts::create(locale);
        let ready = GdipCreateBitmapFromScan0(
            width,
            height,
            width * 4,
            PIXEL_FORMAT_32BPP_PARGB,
            bits as *const u8,
            &mut bitmap,
        ) == Ok
            && GdipGetImageGraphicsContext(bitmap.cast(), &mut graphics) == Ok;
        let Some(fonts) = fonts.filter(|_| ready) else {
            if !graphics.is_null() {
                GdipDeleteGraphics(graphics);
            }
            if !bitmap.is_null() {
                GdipDisposeImage(bitmap.cast());
            }
            SelectObject(memory_dc, previous);
            DeleteDC(memory_dc);
            DeleteObject(dib);
            DestroyWindow(window);
            return false;
        };
        GdipSetSmoothingMode(graphics, SmoothingModeAntiAlias);
        GdipSetPixelOffsetMode(graphics, PixelOffsetModeHighQuality);
        GdipSetCompositingQuality(graphics, CompositingQualityHighQuality);
        GdipSetTextRenderingHint(graphics, TextRenderingHintAntiAliasGridFit);

        HIT_SCALE_MILLI.store((scale * 1_000.0).round() as u32, Ordering::Relaxed);
        HIT_RTL.store(locale == Locale::Ar, Ordering::Relaxed);
        HOVERED.store(NO_CHIP, Ordering::Relaxed);
        PRESSED.store(NO_CHIP, Ordering::Relaxed);

        let now = Instant::now();
        let mut renderer = Renderer {
            window,
            width,
            height,
            scale,
            memory_dc,
            dib,
            previous,
            bits: bits.cast(),
            byte_len: width as usize * height as usize * 4,
            bitmap,
            graphics,
            fonts,
            locale,
            palette: palette(appearance),
            copy: launch_screen::copy(locale),
            version: env!("CARGO_PKG_VERSION").to_string(),
            trace_path: app_data_dir.join("startup-trace.json"),
            started_unix_ms,
            shown_at: now,
            last_poll: now,
            progress: Progress::new(),
            reduced_motion: reduced_motion(),
            steady: false,
            closing_since: None,
            base: Vec::new(),
            settled: Vec::new(),
            last_signature: None,
        };
        // Paint the first frame before the window becomes visible, so the
        // very first pixels are the card, never an empty rectangle.
        renderer.build_base();
        let t = renderer.elapsed_ms();
        renderer.paint(t);
        let reduced = renderer.reduced_motion;
        renderer.present(if reduced { 1.0 } else { ENTRANCE_FLOOR });
        RENDERER.with(|cell| *cell.borrow_mut() = Some(renderer));
        WINDOW.store(window as isize, Ordering::SeqCst);
        ShowWindow(window, SW_SHOW);
        PAINTED_UNIX_MS.store(unix_milliseconds(), Ordering::SeqCst);
        SetForegroundWindow(window);
        SetTimer(
            window,
            TIMER_ID,
            if reduced { 100 } else { INTRO_FRAME_MS },
            None,
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    const PRESETS: [Preset; 4] = [Preset::Sahel, Preset::Atlas, Preset::Oasis, Preset::Dune];
    const THEMES: [Theme; 2] = [Theme::Light, Theme::Dark];

    // Comparisons go through functions so the compiler does not fold them away
    // as constants (they pin the layout; they are not dead code).
    fn lt(a: f32, b: f32) -> bool {
        a < b
    }

    fn le(a: f32, b: f32) -> bool {
        a <= b
    }

    fn looks() -> Vec<Appearance> {
        THEMES
            .iter()
            .flat_map(|theme| {
                PRESETS.iter().map(|preset| Appearance {
                    theme: *theme,
                    preset: *preset,
                })
            })
            .collect()
    }

    fn channel(color: u32, shift: u32) -> f32 {
        let value = ((color >> shift) & 0xFF) as f32 / 255.0;
        if value <= 0.04045 {
            value / 12.92
        } else {
            ((value + 0.055) / 1.055).powf(2.4)
        }
    }

    fn luminance(color: u32) -> f32 {
        0.2126 * channel(color, 16) + 0.7152 * channel(color, 8) + 0.0722 * channel(color, 0)
    }

    /// WCAG 2 contrast ratio of two opaque colours.
    fn contrast(a: u32, b: u32) -> f32 {
        let (la, lb) = (luminance(a), luminance(b));
        (la.max(lb) + 0.05) / (la.min(lb) + 0.05)
    }

    /// `color` (with its own alpha) composited over an opaque `backdrop`.
    fn over(color: u32, backdrop: u32) -> u32 {
        let alpha = (color >> 24) as f32 / 255.0;
        let mixed = |shift: u32| {
            let top = ((color >> shift) & 0xFF) as f32;
            let below = ((backdrop >> shift) & 0xFF) as f32;
            (top * alpha + below * (1.0 - alpha)).round() as u32
        };
        (mixed(16) << 16) | (mixed(8) << 8) | mixed(0)
    }

    #[test]
    fn easing_curves_start_at_zero_and_settle_at_one() {
        assert_eq!(ease_out_cubic(0.0), 0.0);
        assert!((ease_out_cubic(1.0) - 1.0).abs() < f32::EPSILON);
        assert!(
            ease_out_back(0.6) > 1.0,
            "the dot overshoots before settling"
        );
        assert!((ease_out_back(1.0) - 1.0).abs() < 1e-5);
        assert_eq!(timeline(100.0, 200.0, 500.0), 0.0);
        assert_eq!(timeline(800.0, 200.0, 500.0), 1.0);
    }

    #[test]
    fn every_entrance_has_finished_before_the_card_is_cached() {
        // The cached "settled" card draws each element at its final state, so
        // no entrance may still be moving when the cache is taken.
        let last_rise = [180.0, 260.0, 380.0, 440.0]
            .iter()
            .fold(0.0_f32, |latest, delay| latest.max(delay + 520.0));
        assert!(last_rise <= INTRO_LENGTH_MS);
        assert!(le(120.0 + 1_000.0, INTRO_LENGTH_MS), "the second crescent");
        assert!(le(780.0 + 550.0, INTRO_LENGTH_MS), "the dot");
        assert!(le(900.0, INTRO_LENGTH_MS), "the glow");
        let (alpha, offset) = rise(INTRO_LENGTH_MS, 440.0);
        assert_eq!((alpha, offset), (1.0, 0.0));
    }

    #[test]
    fn progress_never_shows_one_hundred_and_follows_the_trace() {
        let mut progress = Progress::new();
        for _ in 0..2_000 {
            progress.observe(Some("runtime-ready"));
            progress.tick();
        }
        assert!(progress.percent() <= 99);
        assert_eq!(progress.phase, Phase::Opening);
        progress.observe(Some("ui-navigation-started"));
        assert_eq!(
            progress.phase,
            Phase::Opening,
            "the final wait never reads 'preparing'"
        );
    }

    #[test]
    fn ignores_the_previous_launch_trace() {
        let directory = std::env::temp_dir().join(format!("sf-splash-{}", unix_milliseconds()));
        fs::create_dir_all(&directory).unwrap();
        let trace = directory.join("startup-trace.json");
        fs::write(
            &trace,
            r#"{"formatVersion":1,"appVersion":"x","events":[{"stage":"native-started","attempt":null,"createdAtUnixMilliseconds":1000},{"stage":"ui-ready","attempt":null,"createdAtUnixMilliseconds":5000}]}"#,
        )
        .unwrap();
        assert_eq!(current_launch_stage(&trace, 1_000_000), None);
        assert_eq!(
            current_launch_stage(&trace, 1_500).as_deref(),
            Some("ui-ready")
        );
        fs::remove_dir_all(&directory).unwrap();
    }

    #[test]
    fn the_layout_reads_top_to_bottom_without_overlap() {
        let stack = [
            MARK_TOP + MARK_SIZE,
            WORDMARK_TOP,
            TAGLINE_TOP,
            STATUS_TOP,
            BAR_TOP,
            HINT_TOP,
            VERSION_TOP,
            CARD_HEIGHT,
        ];
        for pair in stack.windows(2) {
            assert!(pair[0] < pair[1], "layout out of order: {stack:?}");
        }
        // Each text block has room for its line (font size x 1.4).
        assert!(lt(WORDMARK_TOP + 29.0 * 1.4, TAGLINE_TOP));
        assert!(lt(TAGLINE_TOP + 11.5 * 1.4, STATUS_TOP));
        assert!(lt(STATUS_TOP + 13.5 * 1.4, BAR_TOP));
        assert!(lt(BAR_TOP + BAR_HEIGHT, HINT_TOP));
        assert!(lt(HINT_TOP + 11.5 * 1.4, VERSION_TOP));
        assert!(lt(VERSION_TOP + 11.0 * 1.4, CARD_HEIGHT));
        // The progress group fits the card, and the percent never meets the status.
        assert!(lt(
            EDGE_INSET * 2.0 + PERCENT_WIDTH + 12.0,
            CARD_WIDTH / 2.0
        ));
        // The glow stays inside the card.
        assert!(le(0.0, MARK_CENTER_Y - GLOW_RADIUS));
        assert!(le(MARK_CENTER_Y + GLOW_RADIUS, WORDMARK_TOP + 40.0));
    }

    #[test]
    fn the_shadow_fits_inside_its_transparent_margin() {
        let reach = SHADOW_LAYERS as f32 * SHADOW_STEP + SHADOW_DROP;
        assert!(
            reach <= SHADOW_MARGIN,
            "shadow reaches {reach}px, margin is {SHADOW_MARGIN}px"
        );
        // And it fades to nothing at the edge instead of ending on a line.
        let outermost =
            (1.0 - (SHADOW_LAYERS - 1) as f32 / SHADOW_LAYERS as f32).powf(SHADOW_FALLOFF);
        assert!(outermost * 17.0 < 0.5, "outer layer is invisible");
    }

    #[test]
    fn the_window_chips_sit_in_the_end_corner_and_never_overlap() {
        for rtl in [false, true] {
            let (cx, cy, cw, ch) = chip_rect(Chip::Close, rtl);
            let (mx, my, mw, mh) = chip_rect(Chip::Minimize, rtl);
            assert_eq!((cy, my), (CHIP_INSET, CHIP_INSET));
            assert_eq!(
                (cw, ch, mw, mh),
                (CHIP_WIDTH, CHIP_HEIGHT, CHIP_WIDTH, CHIP_HEIGHT)
            );
            for (x, width) in [(cx, cw), (mx, mw)] {
                assert!(x >= 0.0 && x + width <= CARD_WIDTH, "inside the card");
            }
            assert!(cx + cw <= mx || mx + mw <= cx, "chips overlap (rtl={rtl})");
            if rtl {
                assert!(cx < mx, "Close is the corner chip, top left in Arabic");
                assert_eq!(cx, CHIP_INSET);
            } else {
                assert!(
                    cx > mx,
                    "Close is the corner chip, top right in French and English"
                );
                assert_eq!(cx + cw, CARD_WIDTH - CHIP_INSET);
            }
        }
    }

    #[test]
    fn hit_testing_finds_the_chip_under_a_point_and_nothing_else() {
        for rtl in [false, true] {
            for chip in [Chip::Minimize, Chip::Close] {
                let (x, y, width, height) = chip_rect(chip, rtl);
                // Every corner pixel inside, centre included.
                for (px, py) in [
                    (x, y),
                    (x + width - 0.01, y),
                    (x, y + height - 0.01),
                    (x + width - 0.01, y + height - 0.01),
                    (x + width / 2.0, y + height / 2.0),
                ] {
                    assert_eq!(chip_at(px, py, rtl), Some(chip), "{chip:?} rtl={rtl}");
                }
                // Just outside on every side, and the far side of the card.
                for (px, py) in [
                    (x - 0.5, y + 1.0),
                    (x + width, y + 1.0),
                    (x + 1.0, y - 0.5),
                    (x + 1.0, y + height),
                ] {
                    assert_ne!(chip_at(px, py, rtl), Some(chip), "{chip:?} rtl={rtl}");
                }
            }
            assert_eq!(chip_at(CARD_WIDTH / 2.0, 100.0, rtl), None);
            assert_eq!(
                chip_at(-5.0, -5.0, rtl),
                None,
                "the shadow margin is not a chip"
            );
        }
        // The two orders really are mirrored.
        assert_eq!(chip_at(CARD_WIDTH - 10.0, 10.0, false), Some(Chip::Close));
        assert_eq!(chip_at(10.0, 10.0, true), Some(Chip::Close));
    }

    #[test]
    fn colour_mixing_is_exact_at_the_ends_and_rounds() {
        assert_eq!(mix(0x102030, 0xF0E0D0, 0), 0x102030);
        assert_eq!(mix(0x102030, 0xF0E0D0, 100), 0xF0E0D0);
        assert_eq!(mix(0x000000, 0xFFFFFF, 50), 0x808080);
        assert_eq!(rgb_percent(0xFFFFFF, 100) >> 24, 0xFF);
        assert_eq!(rgb_percent(0xFFFFFF, 0) >> 24, 0x00);
        assert_eq!(rgb_percent(0x0D0E08, 10) & 0x00FF_FFFF, 0x0D0E08);
    }

    #[test]
    fn all_eight_looks_are_legible() {
        // Text 4.5:1 (WCAG AA) against both ends of the card; the bar and the
        // icons 3:1 (non-text), against the card and the track behind the bar.
        for look in looks() {
            let p = palette(look);
            let ends = [p.card_top, p.card_bottom];
            for end in ends {
                for (name, color) in [("ink", p.ink), ("text", p.text), ("muted", p.muted)] {
                    let ratio = contrast(color, end);
                    assert!(ratio >= 4.5, "{look:?} {name} {ratio:.2}:1 on {end:06X}");
                }
                let icon = contrast(p.muted, end);
                assert!(icon >= 3.0, "{look:?} chip icon {icon:.2}:1");
                for (name, color) in [("bar start", p.bar_start), ("bar end", p.bar_end)] {
                    let ratio = contrast(color, end);
                    assert!(ratio >= 3.0, "{look:?} {name} {ratio:.2}:1 on {end:06X}");
                }
            }
            let track = over(p.track, p.card_bottom);
            for (name, color) in [("bar start", p.bar_start), ("bar end", p.bar_end)] {
                let ratio = contrast(color, track);
                assert!(ratio >= 3.0, "{look:?} {name} {ratio:.2}:1 on its track");
            }
            // A hovered chip keeps its icon legible.
            let hover = over(p.chip_hover, p.card_bottom);
            assert!(contrast(p.ink, hover) >= 4.5, "{look:?} hovered chip");
            let pressed = over(p.chip_pressed, p.card_bottom);
            assert!(contrast(p.ink, pressed) >= 4.5, "{look:?} pressed chip");
        }
        // White on the red Close states.
        assert!(contrast(0xFFFFFF, CLOSE_HOVER & 0x00FF_FFFF) >= 4.5);
        assert!(contrast(0xFFFFFF, CLOSE_PRESSED & 0x00FF_FFFF) >= 4.5);
    }

    #[test]
    fn each_preset_has_its_own_accent_in_both_modes() {
        for theme in THEMES {
            let mut accents: Vec<u32> = PRESETS
                .iter()
                .map(|preset| {
                    palette(Appearance {
                        theme,
                        preset: *preset,
                    })
                    .bar_end
                })
                .collect();
            accents.sort_unstable();
            accents.dedup();
            assert_eq!(
                accents.len(),
                PRESETS.len(),
                "{theme:?}: presets must differ"
            );
        }
        // The brand mark never changes with the preset.
        for theme in THEMES {
            let marks: Vec<_> = PRESETS
                .iter()
                .map(|preset| {
                    let p = palette(Appearance {
                        theme,
                        preset: *preset,
                    });
                    (p.mark_upper, p.mark_lower, p.mark_dot, p.glow)
                })
                .collect();
            assert!(marks.windows(2).all(|pair| pair[0] == pair[1]));
        }
    }

    #[test]
    fn the_dark_card_is_the_workspaces_neutral_charcoal_for_every_preset() {
        // Presets recolour accents, never the dark canvas.
        let surfaces: Vec<_> = PRESETS
            .iter()
            .map(|preset| {
                let p = palette(Appearance {
                    theme: Theme::Dark,
                    preset: *preset,
                });
                (p.card_top, p.card_bottom, p.ink, p.muted)
            })
            .collect();
        assert!(surfaces.windows(2).all(|pair| pair[0] == pair[1]));
        // In both modes the card surface is a step lighter than the canvas
        // below it, as the app's own card and background are.
        let dark = palette(Appearance::DEFAULT);
        assert!(luminance(dark.card_top) > luminance(dark.card_bottom));
        let light = palette(Appearance {
            theme: Theme::Light,
            preset: Preset::Sahel,
        });
        assert!(luminance(light.card_top) > luminance(light.card_bottom));
    }
}
