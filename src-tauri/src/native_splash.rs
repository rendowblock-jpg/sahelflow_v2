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

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU64, AtomicU8, Ordering};

use crate::launch_screen::{self, Phase};

const STATE_IDLE: u8 = 0;
const STATE_STARTING: u8 = 1;
const STATE_RUNNING: u8 = 2;
const STATE_FAILED: u8 = 3;
const STATE_CLOSED: u8 = 4;

static STATE: AtomicU8 = AtomicU8::new(STATE_IDLE);
static CLOSE_REQUESTED: AtomicBool = AtomicBool::new(false);
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
// Platform-neutral model: timeline easing and honest progress. Unit-tested.
// ---------------------------------------------------------------------------

/// Logical size of the splash card in device-independent pixels.
pub(crate) const CARD_WIDTH: f32 = 560.0;
pub(crate) const CARD_HEIGHT: f32 = 340.0;
const SLOW_HINT_AFTER_MS: f32 = 15_000.0;
const FADE_OUT_MS: f32 = 170.0;
const MAX_LIFETIME_MS: f32 = 10.0 * 60.0 * 1_000.0;

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
    use std::time::Instant;

    use windows_sys::Win32::Foundation::{
        CloseHandle, COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, SIZE, WPARAM,
    };
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, GetMonitorInfoW,
        MonitorFromPoint, ReleaseDC, SelectObject, AC_SRC_ALPHA, AC_SRC_OVER, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, BLENDFUNCTION, DIB_RGB_COLORS, HBITMAP, HDC, HGDIOBJ,
        MONITORINFO, MONITOR_DEFAULTTOPRIMARY,
    };
    use windows_sys::Win32::Graphics::GdiPlus::*;
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::Threading::{OpenMutexW, SYNCHRONIZATION_SYNCHRONIZE};
    use windows_sys::Win32::UI::HiDpi::GetDpiForSystem;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetCursorPos,
        GetMessageW, KillTimer, LoadImageW, PostQuitMessage, RegisterClassExW, SendMessageW,
        SetForegroundWindow, SetTimer, ShowWindow, SystemParametersInfoW, TranslateMessage,
        UpdateLayeredWindow, HTCAPTION, ICON_BIG, ICON_SMALL, IMAGE_ICON, LR_SHARED, MSG,
        SPI_GETCLIENTAREAANIMATION, SW_SHOW, ULW_ALPHA, WM_CLOSE, WM_DESTROY, WM_NCHITTEST,
        WM_SETICON, WM_TIMER, WNDCLASSEXW, WS_EX_APPWINDOW, WS_EX_LAYERED, WS_EX_TOPMOST, WS_POPUP,
    };

    const PIXEL_FORMAT_32BPP_PARGB: i32 = 0x000E_200B;
    const PIXEL_FORMAT_32BPP_ARGB: i32 = 0x0026_200A;
    const TIMER_ID: usize = 1;
    const INTRO_FRAME_MS: u32 = 33;
    const STEADY_FRAME_MS: u32 = 50;
    const INTRO_LENGTH_MS: f32 = 1_700.0;
    const TRACE_POLL_MS: u128 = 200;
    const APP_ICON_RESOURCE: usize = 32_512;

    thread_local! {
        static RENDERER: RefCell<Option<Renderer>> = const { RefCell::new(None) };
    }

    /// Extra width behind each wordmark run. Near-aligned text never moves with
    /// it; it only keeps the last glyph's overhang inside the layout box.
    const WORD_SLACK: f32 = 24.0;

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    const fn argb(alpha: u8, red: u8, green: u8, blue: u8) -> u32 {
        ((alpha as u32) << 24) | ((red as u32) << 16) | ((green as u32) << 8) | blue as u32
    }

    fn with_alpha(color: u32, opacity: f32) -> u32 {
        let alpha = ((color >> 24) as f32 * clamp01(opacity)).round() as u32;
        (alpha << 24) | (color & 0x00FF_FFFF)
    }

    const INK: u32 = argb(255, 232, 240, 247);
    const MUTED: u32 = argb(255, 129, 149, 168);
    const FAINT: u32 = argb(255, 76, 92, 108);
    const SKY_LIGHT: u32 = argb(255, 125, 211, 252);
    const SKY: u32 = argb(255, 14, 165, 233);
    const SKY_DEEP: u32 = argb(255, 2, 132, 199);
    const OCEAN: u32 = argb(255, 12, 74, 110);

    pub(super) fn bring_to_front(window: isize) {
        if window != 0 {
            unsafe {
                SetForegroundWindow(window as HWND);
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
        word: *mut GpFont,
        body: *mut GpFont,
        caption: *mut GpFont,
        small: *mut GpFont,
        center: *mut GpStringFormat,
        center_rtl: *mut GpStringFormat,
        near: *mut GpStringFormat,
    }

    impl Fonts {
        unsafe fn create(locale: Locale) -> Option<Self> {
            let mut family: *mut GpFontFamily = std::ptr::null_mut();
            let preferred = wide(if locale == Locale::Ar {
                "Segoe UI"
            } else {
                "Segoe UI Variable Text"
            });
            if GdipCreateFontFamilyFromName(preferred.as_ptr(), std::ptr::null_mut(), &mut family)
                != Ok
            {
                let fallback = wide("Segoe UI");
                if GdipCreateFontFamilyFromName(
                    fallback.as_ptr(),
                    std::ptr::null_mut(),
                    &mut family,
                ) != Ok
                {
                    let tahoma = wide("Tahoma");
                    if GdipCreateFontFamilyFromName(
                        tahoma.as_ptr(),
                        std::ptr::null_mut(),
                        &mut family,
                    ) != Ok
                    {
                        return None;
                    }
                }
            }
            let font = |size: f32, style: i32| {
                let mut font: *mut GpFont = std::ptr::null_mut();
                GdipCreateFont(family, size, style, UnitPixel, &mut font);
                font
            };
            let format = |rtl: bool, align: StringAlignment| {
                let mut format: *mut GpStringFormat = std::ptr::null_mut();
                // GDI+ trims by character by default: a glyph that overhangs the
                // layout box by a pixel is dropped ("Sahe Flo" on an installed
                // 125% display). Never trim or clip splash text.
                let mut flags = StringFormatFlagsNoWrap | StringFormatFlagsNoClip;
                if rtl {
                    flags |= StringFormatFlagsDirectionRightToLeft;
                }
                GdipCreateStringFormat(flags, 0, &mut format);
                GdipSetStringFormatTrimming(format, StringTrimmingNone);
                GdipSetStringFormatAlign(format, align);
                GdipSetStringFormatLineAlign(format, StringAlignmentNear);
                format
            };
            let fonts = Self {
                family,
                word: font(27.0, FontStyleBold),
                body: font(13.5, FontStyleRegular),
                caption: font(12.5, FontStyleBold),
                small: font(11.5, FontStyleRegular),
                center: format(false, StringAlignmentCenter),
                center_rtl: format(true, StringAlignmentCenter),
                near: format(false, StringAlignmentNear),
            };
            if fonts.word.is_null()
                || fonts.body.is_null()
                || fonts.caption.is_null()
                || fonts.small.is_null()
                || fonts.center.is_null()
                || fonts.center_rtl.is_null()
                || fonts.near.is_null()
            {
                fonts.destroy();
                return None;
            }
            Some(fonts)
        }

        unsafe fn destroy(&self) {
            for font in [self.word, self.body, self.caption, self.small] {
                if !font.is_null() {
                    GdipDeleteFont(font);
                }
            }
            for format in [self.center, self.center_rtl, self.near] {
                if !format.is_null() {
                    GdipDeleteStringFormat(format);
                }
            }
            if !self.family.is_null() {
                GdipDeleteFontFamily(self.family);
            }
        }
    }

    struct Renderer {
        window: HWND,
        width: i32,
        height: i32,
        scale: f32,
        position: POINT,
        memory_dc: HDC,
        dib: HBITMAP,
        previous: HGDIOBJ,
        bitmap: *mut GpBitmap,
        graphics: *mut GpGraphics,
        fonts: Fonts,
        glow: Glow,
        locale: Locale,
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
    }

    impl Renderer {
        unsafe fn destroy(&mut self) {
            if !self.graphics.is_null() {
                GdipDeleteGraphics(self.graphics);
            }
            if !self.bitmap.is_null() {
                GdipDisposeImage(self.bitmap.cast());
            }
            self.glow.destroy();
            self.fonts.destroy();
            if !self.memory_dc.is_null() {
                SelectObject(self.memory_dc, self.previous);
                DeleteDC(self.memory_dc);
            }
            if !self.dib.is_null() {
                DeleteObject(self.dib);
            }
        }

        fn elapsed_ms(&self) -> f32 {
            if self.reduced_motion {
                return 10_000.0;
            }
            self.shown_at.elapsed().as_secs_f32() * 1_000.0
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

            if !self.steady && self.elapsed_ms() > INTRO_LENGTH_MS {
                self.steady = true;
                SetTimer(self.window, TIMER_ID, STEADY_FRAME_MS, None);
            }

            self.paint();
            self.present(clamp01(opacity));
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
            UpdateLayeredWindow(
                self.window,
                screen,
                &self.position,
                &size,
                self.memory_dc,
                &source,
                0 as COLORREF,
                &blend,
                ULW_ALPHA,
            );
            ReleaseDC(std::ptr::null_mut(), screen);
        }

        unsafe fn paint(&self) {
            let g = self.graphics;
            let t = self.elapsed_ms();
            GdipGraphicsClear(g, 0);
            GdipResetWorldTransform(g);
            GdipScaleWorldTransform(g, self.scale, self.scale, MatrixOrderPrepend);

            // Card: deep ocean gradient, hairline frame.
            let card = rounded_rect(0.5, 0.5, CARD_WIDTH - 1.0, CARD_HEIGHT - 1.0, 16.0);
            fill_vertical_gradient(
                g,
                card,
                0.0,
                CARD_HEIGHT,
                argb(255, 11, 24, 40),
                argb(255, 5, 10, 17),
            );
            let mut pen: *mut GpPen = std::ptr::null_mut();
            GdipCreatePen1(argb(34, 148, 197, 233), 1.0, UnitPixel, &mut pen);
            GdipDrawPath(g, pen, card);
            GdipDeletePen(pen);

            // Breathing glow behind the mark.
            let breathe = if self.reduced_motion {
                0.0
            } else {
                (t / 1_400.0).sin()
            };
            let glow_strength = timeline(t, 200.0, 900.0) * (0.85 + 0.15 * breathe);
            self.glow.paint(g, CARD_WIDTH / 2.0, 104.0, glow_strength);
            GdipDeletePath(card);

            self.paint_mark(g, t);

            // Wordmark "Sahel" + sky "Flow".
            let rise = |delay: f32| {
                let p = ease_out_cubic(timeline(t, delay, 800.0));
                (p, 8.0 * (1.0 - p))
            };
            let (word_alpha, word_dy) = rise(450.0);
            self.paint_wordmark(g, 160.0 + word_dy, word_alpha);

            let rtl = self.locale == Locale::Ar;
            let (tag_alpha, tag_dy) = rise(580.0);
            draw_text(
                g,
                self.copy.tagline,
                self.fonts.body,
                self.center_format(rtl),
                0.0,
                198.0 + tag_dy,
                CARD_WIDTH,
                with_alpha(MUTED, tag_alpha),
            );

            // Meter: track, eased fill with a travelling sheen, numeric percent.
            let (meter_alpha, meter_dy) = rise(700.0);
            let track_width = 260.0;
            let track_x = (CARD_WIDTH - track_width) / 2.0;
            let track_y = 240.0 + meter_dy;
            let track = rounded_rect(track_x, track_y, track_width, 5.0, 2.5);
            fill_solid(g, track, with_alpha(argb(30, 148, 197, 233), meter_alpha));
            GdipDeletePath(track);
            let fill_width = (track_width * self.progress.shown).max(5.0);
            let fill_x = if rtl {
                track_x + track_width - fill_width
            } else {
                track_x
            };
            let fill = rounded_rect(fill_x, track_y, fill_width, 5.0, 2.5);
            let (from, to) = if rtl {
                (SKY, SKY_DEEP)
            } else {
                (SKY_DEEP, SKY)
            };
            fill_horizontal_gradient(
                g,
                fill,
                fill_x,
                fill_x + fill_width,
                with_alpha(from, meter_alpha),
                with_alpha(to, meter_alpha),
            );
            if !self.reduced_motion {
                let sweep = (t % 1_800.0) / 1_800.0;
                let sheen_x =
                    fill_x - 60.0 + (fill_width + 120.0) * if rtl { 1.0 - sweep } else { sweep };
                GdipSetClipRect(g, fill_x, track_y, fill_width, 5.0, CombineModeReplace);
                let sheen = rounded_rect(sheen_x, track_y, 60.0, 5.0, 2.5);
                fill_horizontal_gradient_three(
                    g,
                    sheen,
                    sheen_x,
                    sheen_x + 60.0,
                    with_alpha(argb(110, 255, 255, 255), meter_alpha),
                );
                GdipDeletePath(sheen);
                GdipResetClip(g);
            }
            GdipDeletePath(fill);
            let percent = format!("{}%", self.progress.percent());
            draw_text(
                g,
                &percent,
                self.fonts.caption,
                self.fonts.center,
                0.0,
                track_y + 12.0,
                CARD_WIDTH,
                with_alpha(INK, meter_alpha),
            );

            // Honest stage copy.
            let (status_alpha, status_dy) = rise(800.0);
            let status = match self.progress.phase {
                Phase::Preparing => self.copy.preparing,
                Phase::Starting => self.copy.starting,
                Phase::Retrying => self.copy.retrying,
                Phase::Opening => self.copy.opening,
            };
            draw_text(
                g,
                status,
                self.fonts.body,
                self.center_format(rtl),
                24.0,
                276.0 + status_dy,
                CARD_WIDTH - 48.0,
                with_alpha(MUTED, status_alpha),
            );

            let lifetime_ms = self.shown_at.elapsed().as_secs_f32() * 1_000.0;
            if lifetime_ms > SLOW_HINT_AFTER_MS {
                let hint_alpha = clamp01((lifetime_ms - SLOW_HINT_AFTER_MS) / 800.0);
                draw_text(
                    g,
                    self.copy.slow_hint,
                    self.fonts.small,
                    self.center_format(rtl),
                    24.0,
                    300.0,
                    CARD_WIDTH - 48.0,
                    with_alpha(FAINT, hint_alpha),
                );
            }
            draw_text(
                g,
                &self.version,
                self.fonts.small,
                self.fonts.center,
                0.0,
                318.0,
                CARD_WIDTH,
                with_alpha(argb(150, 76, 92, 108), status_alpha),
            );

            GdipFlush(g, FlushIntentionSync);
        }

        fn center_format(&self, rtl: bool) -> *mut GpStringFormat {
            if rtl {
                self.fonts.center_rtl
            } else {
                self.fonts.center
            }
        }

        /// The SahelFlow mark assembles: two crescents sweep into the S, the
        /// dot lands last. Geometry mirrors public/brand/sahelflow-logo.svg
        /// (viewBox 9 7 50 50).
        unsafe fn paint_mark(&self, g: *mut GpGraphics, t: f32) {
            let size = 78.0_f32;
            let unit = size / 50.0;
            let origin_x = CARD_WIDTH / 2.0 - size / 2.0 - 9.0 * unit;
            let origin_y = 66.0 - 7.0 * unit;
            let hover = if self.reduced_motion {
                0.0
            } else {
                ((t - 1_600.0).max(0.0) / 2_400.0 * std::f32::consts::PI).sin() * 1.5
            };

            let crescent = |center: (f32, f32),
                            cutout: (f32, f32),
                            clip: (f32, f32, f32, f32),
                            pivot: (f32, f32),
                            delay: f32,
                            from: u32,
                            to: u32,
                            gradient: ((f32, f32), (f32, f32))| {
                let p = ease_out_cubic(timeline(t, delay, 1_000.0));
                if p <= 0.0 {
                    return;
                }
                GdipResetWorldTransform(g);
                GdipScaleWorldTransform(g, self.scale, self.scale, MatrixOrderPrepend);
                GdipTranslateWorldTransform(g, origin_x, origin_y - hover, MatrixOrderPrepend);
                GdipScaleWorldTransform(g, unit, unit, MatrixOrderPrepend);
                GdipTranslateWorldTransform(g, pivot.0, pivot.1, MatrixOrderPrepend);
                GdipRotateWorldTransform(g, -70.0 * (1.0 - p), MatrixOrderPrepend);
                let grow = 0.82 + 0.18 * p;
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
                    with_alpha(from, p),
                    with_alpha(to, p),
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
                SKY_LIGHT,
                SKY,
                ((17.0, 9.0), (42.0, 34.0)),
            );
            crescent(
                (32.5, 41.0),
                (28.6, 38.4),
                (0.0, 0.0, 32.5, 41.0),
                (32.5, 41.0),
                120.0,
                SKY_DEEP,
                OCEAN,
                ((22.0, 30.0), (47.0, 55.0)),
            );

            let land = timeline(t, 780.0, 550.0);
            if land > 0.0 {
                let scale = 0.2 + 0.8 * ease_out_back(land);
                let radius = 3.1 * scale;
                let dx = -6.0 * (1.0 - land);
                let dy = 6.0 * (1.0 - land);
                GdipResetWorldTransform(g);
                GdipScaleWorldTransform(g, self.scale, self.scale, MatrixOrderPrepend);
                GdipTranslateWorldTransform(g, origin_x, origin_y - hover, MatrixOrderPrepend);
                GdipScaleWorldTransform(g, unit, unit, MatrixOrderPrepend);
                let mut dot: *mut GpSolidFill = std::ptr::null_mut();
                GdipCreateSolidFill(with_alpha(SKY_LIGHT, clamp01(land * 1.6)), &mut dot);
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
            GdipResetWorldTransform(g);
            GdipScaleWorldTransform(g, self.scale, self.scale, MatrixOrderPrepend);
        }

        unsafe fn paint_wordmark(&self, g: *mut GpGraphics, y: f32, alpha: f32) {
            if alpha <= 0.0 {
                return;
            }
            let sahel = measure(g, "Sahel", self.fonts.word, self.fonts.near);
            let flow = measure(g, "Flow", self.fonts.word, self.fonts.near);
            let left = (CARD_WIDTH - sahel - flow) / 2.0;
            draw_text(
                g,
                "Sahel",
                self.fonts.word,
                self.fonts.near,
                left,
                y,
                sahel + WORD_SLACK,
                with_alpha(INK, alpha),
            );
            let start = PointF {
                X: left + sahel,
                Y: y,
            };
            let end = PointF {
                X: left + sahel + flow,
                Y: y + 20.0,
            };
            let mut brush: *mut GpLineGradient = std::ptr::null_mut();
            GdipCreateLineBrush(
                &start,
                &end,
                with_alpha(SKY_LIGHT, alpha),
                with_alpha(SKY, alpha),
                WrapModeTileFlipXY,
                &mut brush,
            );
            let text = wide("Flow");
            let rect = RectF {
                X: left + sahel,
                Y: y,
                Width: flow + WORD_SLACK,
                Height: 40.0,
            };
            GdipDrawString(
                g,
                text.as_ptr(),
                (text.len() - 1) as i32,
                self.fonts.word,
                &rect,
                self.fonts.near,
                brush.cast(),
            );
            GdipDeleteBrush(brush.cast());
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

    /// Transparent → highlight → transparent, for the progress sheen.
    unsafe fn fill_horizontal_gradient_three(
        g: *mut GpGraphics,
        path: *mut GpPath,
        left: f32,
        right: f32,
        highlight: u32,
    ) {
        let middle = (left + right) / 2.0;
        let clear = highlight & 0x00FF_FFFF;
        let start = PointF {
            X: left - 0.5,
            Y: 0.0,
        };
        let half = PointF { X: middle, Y: 0.0 };
        let end = PointF {
            X: right + 0.5,
            Y: 0.0,
        };
        GdipSetClipRect(
            g,
            left,
            0.0,
            middle - left,
            CARD_HEIGHT,
            CombineModeIntersect,
        );
        let mut brush: *mut GpLineGradient = std::ptr::null_mut();
        GdipCreateLineBrush(
            &start,
            &half,
            clear,
            highlight,
            WrapModeTileFlipXY,
            &mut brush,
        );
        GdipFillPath(g, brush.cast(), path);
        GdipDeleteBrush(brush.cast());
        brush = std::ptr::null_mut();
        GdipCreateLineBrush(
            &half,
            &end,
            highlight,
            clear,
            WrapModeTileFlipXY,
            &mut brush,
        );
        GdipFillPath(g, brush.cast(), path);
        GdipDeleteBrush(brush.cast());
    }

    /// The halo behind the mark. A path-gradient fill at this low alpha shows
    /// visible rings on the dark card (each 8-bit alpha step is a band several
    /// pixels wide). The halo is rendered once into a bitmap at device
    /// resolution with a bell-shaped falloff and randomised rounding (dither),
    /// then faded per frame through a colour matrix.
    struct Glow {
        bitmap: *mut GpBitmap,
        attributes: *mut GpImageAttributes,
        width: i32,
        height: i32,
        rx: f32,
        ry: f32,
    }

    impl Glow {
        const PEAK_ALPHA: f32 = 70.0;

        unsafe fn new(rx: f32, ry: f32, scale: f32) -> Self {
            let width = (rx * 2.0 * scale).ceil().max(1.0) as i32;
            let height = (ry * 2.0 * scale).ceil().max(1.0) as i32;
            let mut glow = Self {
                bitmap: std::ptr::null_mut(),
                attributes: std::ptr::null_mut(),
                width,
                height,
                rx,
                ry,
            };
            if GdipCreateBitmapFromScan0(
                width,
                height,
                0,
                PIXEL_FORMAT_32BPP_ARGB,
                std::ptr::null(),
                &mut glow.bitmap,
            ) != Ok
            {
                glow.bitmap = std::ptr::null_mut();
                return glow;
            }
            let rect = Rect {
                X: 0,
                Y: 0,
                Width: width,
                Height: height,
            };
            let mut data: BitmapData = std::mem::zeroed();
            if GdipBitmapLockBits(
                glow.bitmap,
                &rect,
                ImageLockModeWrite as u32,
                PIXEL_FORMAT_32BPP_ARGB,
                &mut data,
            ) != Ok
            {
                GdipDisposeImage(glow.bitmap.cast());
                glow.bitmap = std::ptr::null_mut();
                return glow;
            }
            let (red, green, blue) = ((SKY >> 16) & 0xFF, (SKY >> 8) & 0xFF, SKY & 0xFF);
            let edge = (-3.0f32).exp();
            for y in 0..height {
                let row =
                    (data.Scan0 as *mut u8).offset(y as isize * data.Stride as isize) as *mut u32;
                let ny = (y as f32 + 0.5) / height as f32 * 2.0 - 1.0;
                for x in 0..width {
                    let nx = (x as f32 + 0.5) / width as f32 * 2.0 - 1.0;
                    let d2 = nx * nx + ny * ny;
                    let alpha = if d2 >= 1.0 {
                        0
                    } else {
                        let falloff = ((-3.0 * d2).exp() - edge) / (1.0 - edge);
                        let exact = Self::PEAK_ALPHA * falloff;
                        (exact + dither(x as u32, y as u32))
                            .floor()
                            .clamp(0.0, 255.0) as u32
                    };
                    *row.add(x as usize) = (alpha << 24) | (red << 16) | (green << 8) | blue;
                }
            }
            GdipBitmapUnlockBits(glow.bitmap, &mut data);
            if GdipCreateImageAttributes(&mut glow.attributes) != Ok {
                glow.attributes = std::ptr::null_mut();
            }
            glow
        }

        unsafe fn paint(&self, g: *mut GpGraphics, cx: f32, cy: f32, strength: f32) {
            if self.bitmap.is_null() || self.attributes.is_null() || strength <= 0.0 {
                return;
            }
            let mut matrix = ColorMatrix { m: [0.0; 25] };
            for i in 0..5 {
                matrix.m[i * 6] = 1.0;
            }
            matrix.m[18] = clamp01(strength);
            GdipSetImageAttributesColorMatrix(
                self.attributes,
                ColorAdjustTypeDefault,
                1,
                &matrix,
                std::ptr::null(),
                ColorMatrixFlagsDefault,
            );
            GdipDrawImageRectRect(
                g,
                self.bitmap.cast(),
                cx - self.rx,
                cy - self.ry,
                self.rx * 2.0,
                self.ry * 2.0,
                0.0,
                0.0,
                self.width as f32,
                self.height as f32,
                UnitPixel,
                self.attributes,
                0,
                std::ptr::null_mut(),
            );
        }

        unsafe fn destroy(&mut self) {
            if !self.attributes.is_null() {
                GdipDisposeImageAttributes(self.attributes);
                self.attributes = std::ptr::null_mut();
            }
            if !self.bitmap.is_null() {
                GdipDisposeImage(self.bitmap.cast());
                self.bitmap = std::ptr::null_mut();
            }
        }
    }

    /// Deterministic per-pixel threshold in [0, 1): rounding each pixel's
    /// alpha up or down by it turns 8-bit steps into fine grain, not rings.
    fn dither(x: u32, y: u32) -> f32 {
        let mut h = x.wrapping_mul(0x9E37_79B1) ^ y.wrapping_mul(0x85EB_CA77);
        h ^= h >> 15;
        h = h.wrapping_mul(0x2C1B_3C6D);
        h ^= h >> 12;
        (h & 0xFFFF) as f32 / 65_536.0
    }

    unsafe fn measure(
        g: *mut GpGraphics,
        text: &str,
        font: *mut GpFont,
        format: *mut GpStringFormat,
    ) -> f32 {
        let wide_text = wide(text);
        let layout = RectF {
            X: 0.0,
            Y: 0.0,
            Width: CARD_WIDTH,
            Height: 60.0,
        };
        let mut bounds = RectF {
            X: 0.0,
            Y: 0.0,
            Width: 0.0,
            Height: 0.0,
        };
        GdipMeasureString(
            g,
            wide_text.as_ptr(),
            (wide_text.len() - 1) as i32,
            font,
            &layout,
            format,
            &mut bounds,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        // GDI+ pads measured strings by about a sixth of the em on each side.
        (bounds.Width - 9.0).max(0.0)
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
            Height: 40.0,
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
            // Dragging anywhere moves the splash, like a native splash card.
            WM_NCHITTEST => HTCAPTION as LRESULT,
            WM_CLOSE => {
                CLOSE_REQUESTED.store(true, Ordering::SeqCst);
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
            hCursor: std::ptr::null_mut(),
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
        let width = (CARD_WIDTH * scale).round() as i32;
        let height = (CARD_HEIGHT * scale).round() as i32;
        let position = placement(width, height);
        let title = wide(launch_screen::LAUNCH_WINDOW_TITLE);
        let window = CreateWindowExW(
            WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_APPWINDOW,
            class_name.as_ptr(),
            title.as_ptr(),
            WS_POPUP,
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

        let now = Instant::now();
        let renderer = Renderer {
            window,
            width,
            height,
            scale,
            position,
            memory_dc,
            dib,
            previous,
            bitmap,
            graphics,
            fonts,
            glow: Glow::new(170.0, 120.0, scale),
            locale,
            copy: launch_screen::copy(locale),
            version: launch_screen::display_version(env!("CARGO_PKG_VERSION")),
            trace_path: app_data_dir.join("startup-trace.json"),
            started_unix_ms,
            shown_at: now,
            last_poll: now,
            progress: Progress::new(),
            reduced_motion: reduced_motion(),
            steady: false,
            closing_since: None,
        };
        // Paint the first frame before the window becomes visible, so the
        // very first pixels are the card, never an empty rectangle.
        renderer.paint();
        renderer.present(1.0);
        let reduced = renderer.reduced_motion;
        RENDERER.with(|cell| *cell.borrow_mut() = Some(renderer));
        WINDOW.store(window as isize, Ordering::SeqCst);
        ShowWindow(window, SW_SHOW);
        PAINTED_UNIX_MS.store(unix_milliseconds(), Ordering::SeqCst);
        SetForegroundWindow(window);
        SetTimer(
            window,
            TIMER_ID,
            if reduced { 200 } else { INTRO_FRAME_MS },
            None,
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

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
}
