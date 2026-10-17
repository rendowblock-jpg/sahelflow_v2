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
// Platform-neutral model: timeline easing and honest progress. Unit-tested.
// ---------------------------------------------------------------------------

/// Logical size of the splash card in device-independent pixels.
pub(crate) const CARD_WIDTH: f32 = 600.0;
pub(crate) const CARD_HEIGHT: f32 = 360.0;
/// Transparent border around the card: room for its soft shadow.
pub(crate) const SHADOW_MARGIN: f32 = 32.0;
const SHADOW_STEPS: u32 = 12;
const SHADOW_DROP: f32 = 8.0;
const CARD_RADIUS: f32 = 26.0;
const MARK_TOP: f32 = 44.0;
const MARK_SIZE: f32 = 84.0;
const MARK_CENTER_Y: f32 = MARK_TOP + MARK_SIZE / 2.0;
const GLOW_RINGS: u32 = 18;
const GLOW_RADIUS: f32 = 84.0;
const RAIL_Y: f32 = 238.0;
const RAIL_SPACING: f32 = 96.0;
const ENTRANCE_MS: f32 = 220.0;
const ENTRANCE_FLOOR: f32 = 0.55;
const SLOW_HINT_AFTER_MS: f32 = 15_000.0;
const FADE_OUT_MS: f32 = 170.0;
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

/// The three honest stages on the card's rail (data, services, workspace):
/// which one is current and how far through it the bar is.
pub(crate) fn rail_state(phase: Phase, shown: f32) -> (usize, f32) {
    let (index, low, high) = match phase {
        Phase::Preparing => (0, 0.0, 0.43),
        Phase::Starting | Phase::Retrying => (1, 0.43, 0.82),
        Phase::Opening => (2, 0.82, 1.0),
    };
    (index, clamp01((shown - low) / (high - low)))
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
    const TIMER_ID: usize = 1;
    const INTRO_FRAME_MS: u32 = 33;
    const STEADY_FRAME_MS: u32 = 50;
    const INTRO_LENGTH_MS: f32 = 1_700.0;
    const TRACE_POLL_MS: u128 = 200;
    const APP_ICON_RESOURCE: usize = 32_512;

    thread_local! {
        static RENDERER: RefCell<Option<Renderer>> = const { RefCell::new(None) };
    }

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

    const INK: u32 = argb(255, 244, 246, 248);
    const MUTED: u32 = argb(255, 161, 168, 178);
    const FAINT: u32 = argb(255, 113, 120, 130);
    const SKY_LIGHT: u32 = argb(255, 186, 230, 253);
    const SKY: u32 = argb(255, 56, 189, 248);
    const SKY_DEEP: u32 = argb(255, 14, 165, 233);
    const OCEAN: u32 = argb(255, 3, 105, 161);
    const WHITE: u32 = argb(255, 255, 255, 255);

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
                // NoClip: the measured box is the layout width. Clipping it
                // cut the last glyph, so the installed splash read "Sahe Flo".
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
                word: font(34.0, FontStyleBold),
                body: font(14.0, FontStyleRegular),
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

            // A short fade-in, so the card arrives instead of popping. It
            // starts already visible: the first frame is never blank.
            let entrance = if self.reduced_motion {
                1.0
            } else {
                let arrival = ease_out_cubic(timeline(lifetime_ms, 0.0, ENTRANCE_MS));
                ENTRANCE_FLOOR + (1.0 - ENTRANCE_FLOOR) * arrival
            };
            self.paint();
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

        /// Card space: logical pixels with the card's top-left at the origin.
        unsafe fn reset_to_card_space(&self, g: *mut GpGraphics) {
            GdipResetWorldTransform(g);
            GdipScaleWorldTransform(g, self.scale, self.scale, MatrixOrderPrepend);
            GdipTranslateWorldTransform(g, SHADOW_MARGIN, SHADOW_MARGIN, MatrixOrderPrepend);
        }

        unsafe fn paint(&self) {
            let g = self.graphics;
            let t = self.elapsed_ms();
            let rtl = self.locale == Locale::Ar;
            let closing = quit_requested();
            GdipGraphicsClear(g, 0);
            self.reset_to_card_space(g);

            // Soft shadow: stacked rounded rectangles, widest and faintest
            // first, so the card floats instead of sitting flat on the desktop.
            for step in (0..SHADOW_STEPS).rev() {
                let spread = step as f32 * 2.0;
                let shadow = rounded_rect(
                    -spread,
                    SHADOW_DROP - spread,
                    CARD_WIDTH + spread * 2.0,
                    CARD_HEIGHT + spread * 2.0,
                    CARD_RADIUS + spread,
                );
                fill_solid(g, shadow, argb((14 - step) as u8, 0, 0, 0));
                GdipDeletePath(shadow);
            }

            // Deep navy card with one hairline edge.
            let card = rounded_rect(0.5, 0.5, CARD_WIDTH - 1.0, CARD_HEIGHT - 1.0, CARD_RADIUS);
            fill_vertical_gradient(
                g,
                card,
                0.0,
                CARD_HEIGHT,
                argb(255, 15, 22, 38),
                argb(255, 7, 11, 18),
            );
            let mut pen: *mut GpPen = std::ptr::null_mut();
            GdipCreatePen1(argb(33, 255, 255, 255), 1.0, UnitPixel, &mut pen);
            GdipDrawPath(g, pen, card);
            GdipDeletePen(pen);
            GdipDeletePath(card);

            // Ambient light behind the mark: stacked, nearly transparent discs
            // that fade in with the mark and breathe once it has settled.
            let glow_in = ease_out_cubic(timeline(t, 0.0, 900.0));
            let breathe = if self.reduced_motion {
                1.0
            } else {
                0.9 + 0.1 * (t / 1_300.0).sin()
            };
            for ring in 0..GLOW_RINGS {
                let radius = GLOW_RADIUS - ring as f32 * 5.0;
                let tint = with_alpha(argb(4, 56, 189, 248), glow_in * breathe);
                fill_disc(g, CARD_WIDTH / 2.0, MARK_CENTER_Y, radius, tint);
            }

            self.paint_mark(g, t);

            // One soft ring leaves the mark every few seconds once it settled.
            if !self.reduced_motion && !closing && t > 1_500.0 {
                let phase = ((t - 1_500.0) / 2_800.0) % 1.0;
                let radius = 54.0 + 36.0 * ease_out_cubic(phase);
                let fade = (1.0 - phase) * (1.0 - phase) * 0.3;
                let ring = with_alpha(SKY, fade);
                stroke_circle(g, CARD_WIDTH / 2.0, MARK_CENTER_Y, radius, 1.25, ring);
            }

            let rise = |delay: f32| {
                let p = ease_out_cubic(timeline(t, delay, 520.0));
                (p, 6.0 * (1.0 - p))
            };
            let (word_alpha, word_dy) = rise(180.0);
            self.paint_wordmark(g, 144.0 + word_dy, word_alpha);

            let (tagline_alpha, tagline_dy) = rise(260.0);
            let tagline = if rtl {
                self.copy.tagline.to_string()
            } else {
                self.copy.tagline.to_uppercase()
            };
            draw_text(
                g,
                &tagline,
                self.fonts.small,
                self.center_format(rtl),
                48.0,
                190.0 + tagline_dy,
                CARD_WIDTH - 96.0,
                with_alpha(MUTED, tagline_alpha * 0.85),
            );

            let (rail_alpha, _) = rise(340.0);
            let state = rail_state(self.progress.phase, self.progress.shown);
            self.paint_rail(g, t, rtl, state, rail_alpha);

            let (status_alpha, status_dy) = rise(380.0);
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
            draw_text(
                g,
                status,
                self.fonts.body,
                self.center_format(rtl),
                48.0,
                256.0 + status_dy,
                CARD_WIDTH - 96.0,
                with_alpha(INK, status_alpha * 0.86),
            );

            // The honest bar: it only ever shows what the startup trace proved.
            let (meter_alpha, _) = rise(440.0);
            let track_width = 300.0;
            let track_x = (CARD_WIDTH - track_width) / 2.0;
            let track_y = 290.0;
            let track = rounded_rect(track_x, track_y, track_width, 3.0, 1.5);
            fill_solid(g, track, with_alpha(WHITE, meter_alpha * 0.12));
            GdipDeletePath(track);
            let fill_width = (track_width * self.progress.shown).max(3.0);
            let fill_x = if rtl {
                track_x + track_width - fill_width
            } else {
                track_x
            };
            let halo = rounded_rect(fill_x, track_y - 2.0, fill_width, 7.0, 3.5);
            fill_solid(g, halo, with_alpha(SKY, meter_alpha * 0.16));
            GdipDeletePath(halo);
            let fill = rounded_rect(fill_x, track_y, fill_width, 3.0, 1.5);
            fill_horizontal_gradient(
                g,
                fill,
                fill_x,
                fill_x + fill_width,
                with_alpha(SKY, meter_alpha),
                with_alpha(SKY_LIGHT, meter_alpha),
            );
            GdipDeletePath(fill);
            // A highlight travels along the filled part, so a long stage never
            // looks frozen. It does not advance the honest fill.
            let sheen_width = 36.0_f32;
            if !self.reduced_motion && fill_width > sheen_width + 2.0 {
                let travel = (t / 1_400.0) % 1.0;
                let span = fill_width - sheen_width;
                let sheen_x = if rtl {
                    fill_x + span * (1.0 - travel)
                } else {
                    fill_x + span * travel
                };
                let sheen = rounded_rect(sheen_x, track_y, sheen_width, 3.0, 1.5);
                fill_solid(g, sheen, with_alpha(WHITE, meter_alpha * 0.35));
                GdipDeletePath(sheen);
            }

            let lifetime_ms = self.shown_at.elapsed().as_secs_f32() * 1_000.0;
            if lifetime_ms > SLOW_HINT_AFTER_MS && !closing {
                let hint_alpha = clamp01((lifetime_ms - SLOW_HINT_AFTER_MS) / 800.0);
                draw_text(
                    g,
                    self.copy.slow_hint,
                    self.fonts.small,
                    self.center_format(rtl),
                    48.0,
                    308.0,
                    CARD_WIDTH - 96.0,
                    with_alpha(FAINT, hint_alpha),
                );
            }
            draw_text(
                g,
                &self.version,
                self.fonts.small,
                self.fonts.center,
                0.0,
                330.0,
                CARD_WIDTH,
                with_alpha(argb(140, 161, 168, 178), status_alpha),
            );

            GdipFlush(g, FlushIntentionSync);
        }

        /// The honest three-stage rail: data, services, workspace. Finished
        /// stages are filled, the current one pulses, upcoming ones are hollow.
        unsafe fn paint_rail(
            &self,
            g: *mut GpGraphics,
            t: f32,
            rtl: bool,
            state: (usize, f32),
            alpha: f32,
        ) {
            let (current, fraction) = state;
            let middle = CARD_WIDTH / 2.0;
            let mut stops = [middle - RAIL_SPACING, middle, middle + RAIL_SPACING];
            if rtl {
                stops.reverse();
            }
            for (segment, pair) in stops.windows(2).enumerate() {
                let left = pair[0].min(pair[1]) + 9.0;
                let right = pair[0].max(pair[1]) - 9.0;
                let width = right - left;
                let track = rounded_rect(left, RAIL_Y - 1.0, width, 2.0, 1.0);
                fill_solid(g, track, with_alpha(WHITE, alpha * 0.12));
                GdipDeletePath(track);
                let done = match segment.cmp(&current) {
                    std::cmp::Ordering::Less => 1.0,
                    std::cmp::Ordering::Equal => fraction,
                    std::cmp::Ordering::Greater => 0.0,
                };
                if done > 0.0 {
                    let filled = (width * done).max(2.0);
                    let x = if rtl { right - filled } else { left };
                    let bar = rounded_rect(x, RAIL_Y - 1.0, filled, 2.0, 1.0);
                    fill_solid(g, bar, with_alpha(SKY, alpha * 0.85));
                    GdipDeletePath(bar);
                }
            }
            let pulse = if self.reduced_motion {
                0.0
            } else {
                0.5 + 0.5 * (t / 420.0).sin()
            };
            for (index, x) in stops.iter().enumerate() {
                match index.cmp(&current) {
                    std::cmp::Ordering::Less => {
                        fill_disc(g, *x, RAIL_Y, 5.0, with_alpha(SKY, alpha));
                        let core = with_alpha(argb(255, 6, 16, 28), alpha);
                        fill_disc(g, *x, RAIL_Y, 1.9, core);
                    }
                    std::cmp::Ordering::Equal => {
                        let halo = with_alpha(SKY, alpha * 0.16);
                        fill_disc(g, *x, RAIL_Y, 10.0 + 2.0 * pulse, halo);
                        fill_disc(g, *x, RAIL_Y, 5.0, with_alpha(SKY, alpha));
                    }
                    std::cmp::Ordering::Greater => {
                        let outline = with_alpha(WHITE, alpha * 0.24);
                        stroke_circle(g, *x, RAIL_Y, 4.5, 1.25, outline);
                    }
                }
            }
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
            let size = MARK_SIZE;
            let unit = size / 50.0;
            let origin_x = CARD_WIDTH / 2.0 - size / 2.0 - 9.0 * unit;
            let origin_y = MARK_TOP - 7.0 * unit;
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
                self.reset_to_card_space(g);
                GdipTranslateWorldTransform(g, origin_x, origin_y - hover, MatrixOrderPrepend);
                GdipScaleWorldTransform(g, unit, unit, MatrixOrderPrepend);
                GdipTranslateWorldTransform(g, pivot.0, pivot.1, MatrixOrderPrepend);
                GdipRotateWorldTransform(g, -12.0 * (1.0 - p), MatrixOrderPrepend);
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
                self.reset_to_card_space(g);
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
            self.reset_to_card_space(g);
        }

        unsafe fn paint_wordmark(&self, g: *mut GpGraphics, y: f32, alpha: f32) {
            if alpha <= 0.0 {
                return;
            }
            // One centered string. Splitting "Sahel" and "Flow" into two
            // measured boxes clipped the last glyph of each half, so the
            // installed card read "Sahe Flo".
            draw_text(
                g,
                "SahelFlow",
                self.fonts.word,
                self.fonts.center,
                24.0,
                y,
                CARD_WIDTH - 48.0,
                with_alpha(INK, alpha),
            );
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

    unsafe fn fill_disc(g: *mut GpGraphics, x: f32, y: f32, radius: f32, color: u32) {
        let mut brush: *mut GpSolidFill = std::ptr::null_mut();
        GdipCreateSolidFill(color, &mut brush);
        GdipFillEllipse(
            g,
            brush.cast(),
            x - radius,
            y - radius,
            radius * 2.0,
            radius * 2.0,
        );
        GdipDeleteBrush(brush.cast());
    }

    unsafe fn stroke_circle(
        g: *mut GpGraphics,
        x: f32,
        y: f32,
        radius: f32,
        width: f32,
        color: u32,
    ) {
        let mut path: *mut GpPath = std::ptr::null_mut();
        GdipCreatePath(FillModeAlternate, &mut path);
        GdipAddPathEllipse(path, x - radius, y - radius, radius * 2.0, radius * 2.0);
        let mut pen: *mut GpPen = std::ptr::null_mut();
        GdipCreatePen1(color, width, UnitPixel, &mut pen);
        GdipDrawPath(g, pen, path);
        GdipDeletePen(pen);
        GdipDeletePath(path);
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
        let width = ((CARD_WIDTH + SHADOW_MARGIN * 2.0) * scale).round() as i32;
        let height = ((CARD_HEIGHT + SHADOW_MARGIN * 2.0) * scale).round() as i32;
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
            locale,
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
        };
        // Paint the first frame before the window becomes visible, so the
        // very first pixels are the card, never an empty rectangle.
        renderer.paint();
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
    #[test]
    fn the_rail_tracks_the_three_honest_stages() {
        assert_eq!(rail_state(Phase::Preparing, 0.0), (0, 0.0));
        let (index, fraction) = rail_state(Phase::Starting, 0.6);
        assert_eq!(index, 1);
        assert!(fraction > 0.3 && fraction < 0.6, "got {fraction}");
        assert_eq!(
            rail_state(Phase::Retrying, 0.5).0,
            1,
            "a retry is still stage two"
        );
        let (index, fraction) = rail_state(Phase::Opening, 0.99);
        assert_eq!(index, 2);
        assert!(fraction > 0.9 && fraction <= 1.0, "got {fraction}");
        assert_eq!(
            rail_state(Phase::Preparing, 0.9).1,
            1.0,
            "never past the end of a stage"
        );
        assert_eq!(rail_state(Phase::Opening, 0.0).1, 0.0, "never negative");
    }
}
