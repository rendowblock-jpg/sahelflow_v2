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
const MARK_SIZE: f32 = 124.0;
const MARK_TOP: f32 = 46.0;
const MARK_CENTER_Y: f32 = MARK_TOP + MARK_SIZE / 2.0;
const GLOW_RADIUS: f32 = 260.0;
const WORDMARK_TOP: f32 = 193.0;
const WORDMARK_WIDTH: f32 = 144.0;
#[cfg(test)]
const WORDMARK_HEIGHT: f32 = 24.0;
const TAGLINE_TOP: f32 = 234.0;
const STATUS_TOP: f32 = 284.0;
const HINT_TOP: f32 = 312.0;
const VERSION_TOP: f32 = 334.0;
/// Distance of the slow hint from the card's start and end edges.
const EDGE_INSET: f32 = 60.0;
const PERCENT_WIDTH: f32 = 38.0;
const STATUS_GAP: f32 = 10.0;
const STATUS_DOT: f32 = 4.0;
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
// Kept equal to the workspace CSS by the contract test; the Tide look below
// is generated from each preset's `primary`, so the other fields are only read there.
#[allow(dead_code)]
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

/// Every colour of the card for one look. Text is checked against both ends of
/// the card gradient (4.5:1) and the icons at 3:1, for all 8 looks, in the
/// tests.
#[derive(Clone, Copy)]
pub(crate) struct Palette {
    pub(crate) dark: bool,
    pub(crate) card_top: u32,
    pub(crate) card_bottom: u32,
    pub(crate) border: u32,
    /// The one-pixel highlight along the card's top edge.
    pub(crate) edge: u32,
    /// The wordmark.
    pub(crate) ink: u32,
    /// The status line.
    pub(crate) text: u32,
    /// The tagline, percent, slow hint and chip icons.
    pub(crate) muted: u32,
    /// The version line.
    pub(crate) faint: u32,
    pub(crate) chip_hover: u32,
    pub(crate) chip_pressed: u32,
    /// The light behind the mark.
    pub(crate) glow: u32,
    /// The mark's two arcs, each a gradient: the sky arc (upper) fills last,
    /// the deep arc (lower) first.
    pub(crate) sky: (u32, u32),
    pub(crate) deep: (u32, u32),
    /// The faint, still unfilled S.
    pub(crate) ghost: u32,
    /// The dot that lands last.
    pub(crate) dot: u32,
    /// The small dot in the status row.
    pub(crate) accent: u32,
    /// Opacity (out of 255) of the strongest shadow layer.
    pub(crate) shadow_peak: u8,
}

const WHITE: u32 = rgb(0xFFFFFF);
/// The Close chip under the pointer, the same red Windows uses.
const CLOSE_HOVER: u32 = rgb(0xC42B1C);
const CLOSE_PRESSED: u32 = rgb(0xA32519);

/// The startup card follows the workspace theme: every colour of the card and
/// of the mark is generated (in OKLCH) from the accent of the seller's colour
/// preset, so the S, the glow, the dot and the surface all wear the theme.
/// Text is fitted until it clears 4.5:1 on both ends of the card. Generated
/// from the design mockup's colour engine; a test ties each mark to its
/// preset's accent, so editing a preset without regenerating fails the build.
#[derive(Clone, Copy)]
struct Look {
    top: u32,
    bottom: u32,
    ink: u32,
    text: u32,
    muted: u32,
    faint: u32,
    border: (u32, u32),
    edge: (u32, u32),
    sky: (u32, u32),
    deep: (u32, u32),
    ghost: (u32, u32),
    dot: u32,
    accent: u32,
}

const fn look(theme: Theme, preset: Preset) -> Look {
    match (theme, preset) {
        (Theme::Light, Preset::Sahel) => Look {
            top: 0xEFF9EF,
            bottom: 0xD9EFDA,
            ink: 0x111E12,
            text: 0x323B32,
            muted: 0x4B564B,
            faint: 0x5C665D,
            border: (0x446F47, 18),
            edge: (0xFFFFFF, 90),
            sky: (0x61C649, 0x02942E),
            deep: (0x03773B, 0x014D2B),
            ghost: (0x014D2B, 10),
            dot: 0x02942E,
            accent: 0x02942E,
        },
        (Theme::Light, Preset::Atlas) => Look {
            top: 0xF5F5FE,
            bottom: 0xE5E5FE,
            ink: 0x191828,
            text: 0x373741,
            muted: 0x51515E,
            faint: 0x62626E,
            border: (0x5F5C8F, 18),
            edge: (0xFFFFFF, 90),
            sky: (0x9BA0FF, 0x7661E3),
            deep: (0x684BB6, 0x472F74),
            ghost: (0x472F74, 10),
            dot: 0x7661E3,
            accent: 0x7661E3,
        },
        (Theme::Light, Preset::Oasis) => Look {
            top: 0xEEF8FA,
            bottom: 0xD6EDF1,
            ink: 0x071E22,
            text: 0x2D3B3D,
            muted: 0x455659,
            faint: 0x57676A,
            border: (0x186F7D, 18),
            edge: (0xFFFFFF, 90),
            sky: (0x41BECB, 0x018A9C),
            deep: (0x046F84, 0x064758),
            ghost: (0x064758, 10),
            dot: 0x018A9C,
            accent: 0x018A9C,
        },
        (Theme::Light, Preset::Dune) => Look {
            top: 0xFEF4EC,
            bottom: 0xFBE3D2,
            ink: 0x25170C,
            text: 0x3F362F,
            muted: 0x5C5047,
            faint: 0x6C6158,
            border: (0x865733, 18),
            edge: (0xFFFFFF, 90),
            sky: (0xEE922C, 0xB66001),
            deep: (0x9B4800, 0x662D0B),
            ghost: (0x662D0B, 10),
            dot: 0xB66001,
            accent: 0xB66001,
        },
        (Theme::Dark, Preset::Sahel) => Look {
            top: 0x101A12,
            bottom: 0x070D08,
            ink: 0xF4F8F5,
            text: 0xCCD8CE,
            muted: 0xA2AFA4,
            faint: 0x8A968C,
            border: (0xA3C9AA, 14),
            edge: (0xC8E8CD, 10),
            sky: (0x7AEC7B, 0x22BD5C),
            deep: (0x049255, 0x025636),
            ghost: (0x7AEC7B, 10),
            dot: 0x7AEC7B,
            accent: 0x22BD5C,
        },
        (Theme::Dark, Preset::Atlas) => Look {
            top: 0x161620,
            bottom: 0x0A0A11,
            ink: 0xF6F6FB,
            text: 0xD3D3E0,
            muted: 0xA9A9B9,
            faint: 0x90919E,
            border: (0xB9B9E4, 14),
            edge: (0xDADAFF, 10),
            sky: (0xC3C9FF, 0x968DFE),
            deep: (0x7C67C9, 0x4D397A),
            ghost: (0xC3C9FF, 10),
            dot: 0xC3C9FF,
            accent: 0x968DFE,
        },
        (Theme::Dark, Preset::Oasis) => Look {
            top: 0x0E1A19,
            bottom: 0x060D0C,
            ink: 0xF2F8F8,
            text: 0xC8D8D7,
            muted: 0x9CB0AE,
            faint: 0x859695,
            border: (0x91CBC6, 14),
            edge: (0xB9E9E5, 10),
            sky: (0x2FECD8, 0x00B6AF),
            deep: (0x088C8D, 0x045256),
            ghost: (0x2FECD8, 10),
            dot: 0x2FECD8,
            accent: 0x00B6AF,
        },
        (Theme::Dark, Preset::Dune) => Look {
            top: 0x1C160E,
            bottom: 0x0F0A06,
            ink: 0xF9F6F2,
            text: 0xDCD2C8,
            muted: 0xB4A99C,
            faint: 0x9A9085,
            border: (0xD7B894, 14),
            edge: (0xF4D9BB, 10),
            sky: (0xFFC165, 0xD78C1D),
            deep: (0xAC6818, 0x6A3A07),
            ghost: (0xFFC165, 10),
            dot: 0xFFC165,
            accent: 0xD78C1D,
        },
    }
}

const fn build(theme: Theme, preset: Preset) -> Palette {
    let tokens = tokens(theme, preset);
    let l = look(theme, preset);
    let dark = matches!(theme, Theme::Dark);
    Palette {
        dark,
        card_top: rgb(l.top),
        card_bottom: rgb(l.bottom),
        border: rgb_percent(l.border.0, l.border.1),
        edge: rgb_percent(l.edge.0, l.edge.1),
        ink: rgb(l.ink),
        text: rgb(l.text),
        muted: rgb(l.muted),
        faint: rgb(l.faint),
        chip_hover: rgb_percent(l.ink, 9),
        chip_pressed: rgb_percent(l.ink, 15),
        // Dark: the sky arc's own light. Light: the preset's accent itself.
        glow: if dark {
            rgb(l.sky.1)
        } else {
            rgb(tokens.primary)
        },
        sky: (rgb(l.sky.0), rgb(l.sky.1)),
        deep: (rgb(l.deep.0), rgb(l.deep.1)),
        ghost: rgb_percent(l.ghost.0, l.ghost.1),
        dot: rgb(l.dot),
        accent: rgb(l.accent),
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

/// How many steps the glow behind the mark takes between nothing and full.
/// The cached static layer is painted again only when the step changes.
pub(crate) const GLOW_STEPS: u32 = 20;
/// The ripple under the fill moves in frames of this length.
const WAVE_FRAME_MS: f32 = 100.0;
/// The status line fades out and then in across a change of stage.
const STAGE_FADE_MS: f32 = 140.0;
/// The mark's own units (its viewBox is `9 7 50 50`): the S fills from below
/// its bottom (y 57) to above its top (y 6) as the launch advances.
const MARK_EMPTY_Y: f32 = 57.0;
const MARK_FULL_Y: f32 = 6.0;
const MARK_WAVE_FROM: f32 = 14.0;
const MARK_WAVE_TO: f32 = 52.0;

/// Where the surface of the fill sits, in the mark's units, for a progress of
/// 0 to 1: below the S when empty, above it when full.
pub(crate) fn mark_fill_level(progress: f32) -> f32 {
    MARK_EMPTY_Y - (MARK_EMPTY_Y - MARK_FULL_Y) * clamp01(progress)
}

/// Height of the ripple on the surface. It fades away as the S fills, and is
/// zero when Windows is set to less motion or the PC is too slow for it.
pub(crate) fn wave_amplitude(progress: f32, calm: bool) -> f32 {
    if calm {
        0.0
    } else {
        0.5 * (1.0 - clamp01(progress).powi(3))
    }
}

/// The surface at `x` (the mark's units) after `seconds`.
pub(crate) fn wave_height(x: f32, level: f32, amplitude: f32, seconds: f32) -> f32 {
    level
        + amplitude * (x * 0.42 + seconds * 1.5).sin()
        + amplitude * 0.55 * (x * 0.83 - seconds * 1.05).sin()
}

/// The glow behind the mark wakes up as the card fills.
pub(crate) fn glow_alpha(progress: f32, dark: bool) -> f32 {
    let p = clamp01(progress);
    if dark {
        0.05 + 0.12 * p
    } else {
        0.035 + 0.07 * p
    }
}

pub(crate) fn glow_step(progress: f32) -> u32 {
    (clamp01(progress) * GLOW_STEPS as f32).floor() as u32
}

/// The SahelFlow wordmark as a vector outline (Manrope variable font at
/// weight 650, kerned, tracking -1.2%), so the name looks the same on every PC
/// instead of depending on an installed font. Units: 1,000 per em, the origin
/// is the left end of the baseline and y grows downward. Generated, not
/// hand-edited.
///
/// Font licence: Manrope is Copyright 2018 The Manrope Project Authors
/// (https://github.com/googlefonts/manrope), licensed under the SIL Open Font
/// License, Version 1.1. We treat the outline as a Modified Version of that font
/// software, so it stays under the same licence; the full text is in
/// `src-tauri/licenses/Manrope-OFL.txt`. The font name is not used as a name
/// anywhere in the app, only the outline of the word "SahelFlow" is drawn.
pub(crate) mod wordmark {
    #[derive(Clone, Copy, Debug)]
    pub(crate) enum Seg {
        M(f32, f32),
        L(f32, f32),
        C(f32, f32, f32, f32, f32, f32),
        Z,
    }
    use Seg::{C, L, M, Z};

    /// Width of the outline's box, and how far its baseline is below the top.
    pub(crate) const VIEW_WIDTH: f32 = 4800.0;
    pub(crate) const BASELINE: f32 = 760.0;
    #[cfg(test)]
    pub(crate) const CONTOURS: usize = 13;

    #[rustfmt::skip]
    pub(crate) const PATH: [Seg; 208] = [
        M(334.0, 15.0), C(282.0, 15.0, 235.0, 6.0, 193.0, -12.0), C(151.0, -30.0, 116.67, -56.0, 90.0, -90.0), C(62.67, -123.33, 45.33, -163.33, 38.0, -210.0),
        L(154.0, -228.0), C(165.33, -184.0, 188.0, -150.33, 222.0, -127.0), C(256.0, -103.0, 295.33, -91.0, 340.0, -91.0), C(367.33, -91.0, 393.0, -95.33, 417.0, -104.0),
        C(440.33, -112.0, 459.33, -124.33, 474.0, -141.0), C(488.67, -157.0, 496.0, -176.67, 496.0, -200.0), C(496.0, -211.33, 494.0, -221.67, 490.0, -231.0), C(486.0, -240.33, 480.33, -248.67, 473.0, -256.0),
        C(465.67, -262.67, 456.67, -268.67, 446.0, -274.0), C(435.33, -280.0, 423.33, -285.0, 410.0, -289.0), L(225.0, -344.0), C(208.33, -348.67, 190.67, -355.0, 172.0, -363.0),
        C(153.33, -371.67, 136.0, -382.67, 120.0, -396.0), C(104.0, -410.0, 91.0, -427.33, 81.0, -448.0), C(71.0, -469.33, 66.0, -495.33, 66.0, -526.0), C(66.0, -571.33, 77.33, -609.67, 100.0, -641.0),
        C(123.33, -671.67, 154.67, -695.0, 194.0, -711.0), C(233.33, -727.0, 277.33, -734.67, 326.0, -734.0), C(375.33, -734.0, 419.0, -725.67, 457.0, -709.0), C(495.67, -692.33, 528.0, -668.33, 554.0, -637.0),
        C(579.33, -605.67, 597.33, -568.0, 608.0, -524.0), L(487.0, -503.0), C(481.67, -529.0, 471.33, -551.33, 456.0, -570.0), C(440.0, -588.67, 420.67, -603.0, 398.0, -613.0),
        C(375.33, -623.0, 350.67, -628.0, 324.0, -628.0), C(298.67, -628.67, 275.33, -625.0, 254.0, -617.0), C(233.33, -609.0, 216.33, -597.67, 203.0, -583.0), C(190.33, -568.33, 184.0, -551.0, 184.0, -531.0),
        C(184.0, -512.33, 189.67, -497.0, 201.0, -485.0), C(211.67, -473.67, 225.33, -464.67, 242.0, -458.0), C(258.67, -450.67, 275.33, -444.67, 292.0, -440.0), L(423.0, -404.0),
        C(440.33, -399.33, 459.67, -393.0, 481.0, -385.0), C(503.0, -377.0, 524.0, -366.0, 544.0, -352.0), C(564.0, -337.33, 580.33, -318.67, 593.0, -296.0), C(606.33, -272.67, 613.0, -243.33, 613.0, -208.0),
        C(613.0, -170.67, 605.33, -138.33, 590.0, -111.0), C(575.33, -83.0, 555.0, -59.67, 529.0, -41.0), C(503.0, -22.33, 473.33, -8.33, 440.0, 1.0), C(406.0, 10.33, 370.67, 15.0, 334.0, 15.0),
        Z, M(860.0, 15.0), C(820.67, 15.0, 787.33, 7.67, 760.0, -7.0), C(733.33, -21.67, 713.0, -41.33, 699.0, -66.0),
        C(685.0, -90.67, 678.0, -118.0, 678.0, -148.0), C(678.0, -174.67, 682.67, -198.33, 692.0, -219.0), C(701.33, -239.67, 715.33, -257.33, 734.0, -272.0), C(752.67, -286.67, 776.0, -298.67, 804.0, -308.0),
        C(826.67, -315.33, 853.0, -321.67, 883.0, -327.0), C(912.33, -332.33, 944.0, -337.33, 978.0, -342.0), C(1012.0, -346.67, 1046.67, -351.67, 1082.0, -357.0), L(1041.0, -334.0),
        C(1041.67, -374.0, 1033.0, -403.67, 1015.0, -423.0), C(997.0, -442.33, 966.67, -452.0, 924.0, -452.0), C(898.0, -452.0, 873.33, -445.67, 850.0, -433.0), C(827.33, -421.0, 811.33, -400.33, 802.0, -371.0),
        L(698.0, -404.0), C(711.33, -449.33, 736.67, -486.0, 774.0, -514.0), C(811.33, -541.33, 861.67, -555.0, 925.0, -555.0), C(973.0, -555.0, 1015.33, -547.0, 1052.0, -531.0),
        C(1088.0, -515.0, 1114.67, -489.0, 1132.0, -453.0), C(1140.67, -435.0, 1146.0, -416.0, 1148.0, -396.0), C(1150.0, -376.0, 1151.0, -354.67, 1151.0, -332.0), L(1151.0, 0.0),
        L(1052.0, 0.0), L(1052.0, -120.0), L(1070.0, -103.0), C(1046.67, -63.0, 1018.33, -33.33, 985.0, -14.0),
        C(951.0, 5.33, 909.33, 15.0, 860.0, 15.0), Z, M(882.0, -76.0), C(910.0, -76.0, 934.33, -81.0, 955.0, -91.0),
        C(975.0, -101.0, 991.33, -113.67, 1004.0, -129.0), C(1016.0, -144.33, 1024.0, -159.33, 1028.0, -174.0), C(1034.0, -190.0, 1037.33, -207.67, 1038.0, -227.0), C(1039.33, -247.0, 1040.0, -263.33, 1040.0, -276.0),
        L(1075.0, -264.0), C(1040.33, -258.67, 1009.67, -254.0, 983.0, -250.0), C(956.33, -245.33, 933.0, -241.33, 913.0, -238.0), C(893.0, -234.0, 875.0, -229.33, 859.0, -224.0),
        C(845.0, -219.33, 832.67, -213.67, 822.0, -207.0), C(812.0, -199.67, 804.0, -191.33, 798.0, -182.0), C(792.0, -172.67, 789.0, -161.67, 789.0, -149.0), C(789.0, -135.0, 792.33, -122.67, 799.0, -112.0),
        C(806.33, -100.67, 816.67, -92.0, 830.0, -86.0), C(843.33, -79.33, 860.67, -76.0, 882.0, -76.0), Z, M(1646.0, 0.0),
        L(1646.0, -263.0), C(1646.0, -281.67, 1644.33, -301.67, 1641.0, -323.0), C(1638.33, -344.33, 1632.33, -364.67, 1623.0, -384.0), C(1614.33, -403.33, 1601.33, -419.0, 1584.0, -431.0),
        C(1566.67, -443.0, 1543.33, -449.0, 1514.0, -449.0), C(1497.33, -449.0, 1481.0, -446.0, 1465.0, -440.0), C(1449.67, -434.67, 1435.67, -425.67, 1423.0, -413.0), C(1411.0, -399.67, 1401.33, -382.33, 1394.0, -361.0),
        C(1386.67, -339.0, 1383.0, -311.67, 1383.0, -279.0), L(1314.0, -307.0), C(1314.0, -354.33, 1323.33, -396.67, 1342.0, -434.0), C(1360.0, -471.33, 1386.0, -501.0, 1420.0, -523.0),
        C(1454.67, -544.33, 1497.0, -555.0, 1547.0, -555.0), C(1585.67, -555.0, 1617.67, -548.67, 1643.0, -536.0), C(1669.0, -523.33, 1689.67, -507.0, 1705.0, -487.0), C(1720.33, -467.0, 1732.0, -445.33, 1740.0, -422.0),
        C(1748.0, -398.67, 1753.33, -376.33, 1756.0, -355.0), C(1758.67, -333.67, 1760.0, -315.67, 1760.0, -301.0), L(1760.0, 0.0), Z,
        M(1269.0, 0.0), L(1269.0, -720.0), L(1369.0, -720.0), L(1369.0, -336.0),
        L(1383.0, -336.0), L(1383.0, 0.0), Z, M(2120.0, 15.0),
        C(2066.0, 15.0, 2018.67, 3.33, 1978.0, -20.0), C(1937.33, -44.0, 1905.33, -77.0, 1882.0, -119.0), C(1859.33, -161.0, 1848.0, -209.67, 1848.0, -265.0), C(1848.0, -323.67, 1859.33, -374.67, 1882.0, -418.0),
        C(1904.0, -462.0, 1935.0, -495.67, 1975.0, -519.0), C(2015.0, -543.0, 2061.33, -555.0, 2114.0, -555.0), C(2170.0, -555.0, 2217.33, -542.0, 2256.0, -516.0), C(2294.67, -490.67, 2323.67, -454.0, 2343.0, -406.0),
        C(2362.33, -359.33, 2369.67, -303.33, 2365.0, -238.0), L(2253.0, -238.0), L(2253.0, -280.0), C(2252.33, -340.0, 2241.33, -384.33, 2220.0, -413.0),
        C(2198.0, -441.67, 2164.33, -456.0, 2119.0, -456.0), C(2068.33, -456.0, 2030.33, -440.0, 2005.0, -408.0), C(1979.67, -376.67, 1967.0, -330.67, 1967.0, -270.0), C(1967.0, -212.67, 1979.67, -168.67, 2005.0, -138.0),
        C(2030.33, -106.67, 2066.67, -91.0, 2114.0, -91.0), C(2145.33, -91.0, 2172.33, -98.0, 2195.0, -112.0), C(2217.67, -126.0, 2235.33, -146.0, 2248.0, -172.0), L(2359.0, -138.0),
        C(2338.33, -89.33, 2306.33, -51.67, 2263.0, -25.0), C(2220.33, 1.67, 2172.67, 15.0, 2120.0, 15.0), Z, M(1931.0, -238.0),
        L(1931.0, -325.0), L(2310.0, -325.0), L(2310.0, -238.0), Z,
        M(2476.0, 0.0), L(2476.0, -735.0), L(2588.0, -735.0), L(2588.0, 0.0),
        Z, M(2726.0, 0.0), L(2726.0, -720.0), L(3156.0, -720.0),
        L(3156.0, -608.0), L(2838.0, -608.0), L(2838.0, -416.0), L(3096.0, -416.0),
        L(3096.0, -304.0), L(2838.0, -304.0), L(2838.0, 0.0), Z,
        M(3244.0, 0.0), L(3244.0, -735.0), L(3356.0, -735.0), L(3356.0, 0.0),
        Z, M(3731.0, 15.0), C(3677.0, 15.0, 3630.0, 2.67, 3590.0, -22.0), C(3550.0, -46.0, 3519.0, -79.33, 3497.0, -122.0),
        C(3475.0, -165.33, 3464.0, -214.67, 3464.0, -270.0), C(3464.0, -326.67, 3475.33, -376.33, 3498.0, -419.0), C(3520.67, -461.67, 3551.67, -495.0, 3591.0, -519.0), C(3631.0, -543.0, 3677.67, -555.0, 3731.0, -555.0),
        C(3785.0, -555.0, 3832.0, -543.0, 3872.0, -519.0), C(3912.0, -494.33, 3943.0, -460.67, 3965.0, -418.0), C(3987.0, -375.33, 3998.0, -326.0, 3998.0, -270.0), C(3998.0, -214.0, 3987.0, -164.67, 3965.0, -122.0),
        C(3943.0, -78.67, 3912.0, -45.0, 3872.0, -21.0), C(3832.0, 3.0, 3785.0, 15.0, 3731.0, 15.0), Z, M(3731.0, -91.0),
        C(3781.0, -91.0, 3818.0, -107.67, 3842.0, -141.0), C(3866.67, -174.33, 3879.0, -217.33, 3879.0, -270.0), C(3879.0, -324.67, 3866.67, -368.33, 3842.0, -401.0), C(3817.33, -433.0, 3780.33, -449.0, 3731.0, -449.0),
        C(3697.0, -449.0, 3669.33, -441.33, 3648.0, -426.0), C(3626.0, -411.33, 3610.0, -390.67, 3600.0, -364.0), C(3589.33, -336.67, 3584.0, -305.33, 3584.0, -270.0), C(3584.0, -215.33, 3596.33, -172.0, 3621.0, -140.0),
        C(3645.67, -107.33, 3682.33, -91.0, 3731.0, -91.0), Z, M(4192.0, 0.0), L(4026.0, -541.0),
        L(4137.0, -540.0), L(4246.0, -182.0), L(4357.0, -540.0), L(4453.0, -540.0),
        L(4563.0, -182.0), L(4672.0, -540.0), L(4783.0, -540.0), L(4618.0, 0.0),
        L(4529.0, 0.0), L(4405.0, -381.0), L(4280.0, 0.0), Z,
    ];
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
    /// A frame (paint plus present) slower than this many milliseconds, four
    /// times in a row, switches the ripple off: the card then holds still and
    /// cheap, so a slow PC keeps its CPU for starting SahelFlow.
    const SLOW_FRAME_MS: u128 = 45;
    const SLOW_FRAMES_BEFORE_CALM: u8 = 4;

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
        body: *mut GpFont,
        percent: *mut GpFont,
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
            let font = |source: *mut GpFontFamily, size: f32, style: i32| {
                let mut font: *mut GpFont = std::ptr::null_mut();
                GdipCreateFont(source, size, style, UnitPixel, &mut font);
                font
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
                body: font(family, 13.5, FontStyleRegular),
                percent: font(family, 13.5, FontStyleBold),
                small: font(family, 12.0, FontStyleRegular),
                tiny: font(family, 12.0, FontStyleRegular),
                center: format(false, StringAlignmentCenter),
                center_rtl: format(true, StringAlignmentCenter),
                near: format(false, StringAlignmentNear),
                near_rtl: format(true, StringAlignmentNear),
                far: format(false, StringAlignmentFar),
            };
            if fonts.percent.is_null()
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
            for font in [self.body, self.percent, self.small, self.tiny] {
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
            if !self.family.is_null() {
                GdipDeleteFontFamily(self.family);
            }
        }
    }

    /// What a steady frame draws, so an unchanged frame is not redrawn.
    type Signature = (i32, u32, u8, u8, u8, u8, bool, u32, u8);

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
        /// The glow step the cached layer was painted with.
        settled_step: u32,
        /// The status line now shown, the one before it, and when it changed.
        stage_text: &'static str,
        stage_prev: &'static str,
        stage_changed: Instant,
        /// Set after several slow frames: the ripple stops.
        calm: bool,
        slow_frames: u8,
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
            let hint = clamp01((lifetime_ms - SLOW_HINT_AFTER_MS) / 800.0);
            let still = self.calm || self.reduced_motion;
            let wave = if still {
                0
            } else {
                (lifetime_ms / WAVE_FRAME_MS) as u32
            };
            let stage_ms = self.stage_changed.elapsed().as_secs_f32() * 1_000.0;
            let fade = (clamp01(stage_ms / (STAGE_FADE_MS * 2.0)) * 8.0) as u8;
            (
                (mark_fill_level(self.progress.shown) * 8.0 * self.scale) as i32,
                self.progress.percent(),
                self.progress.phase as u8,
                (hint * 16.0) as u8,
                HOVERED.load(Ordering::Relaxed),
                PRESSED.load(Ordering::Relaxed),
                quit_requested(),
                wave,
                fade,
            )
        }

        fn stage_label(&self) -> &'static str {
            if quit_requested() {
                return self.copy.closing;
            }
            match self.progress.phase {
                Phase::Preparing => self.copy.preparing,
                Phase::Starting => self.copy.starting,
                Phase::Retrying => self.copy.retrying,
                Phase::Opening => self.copy.opening,
            }
        }

        /// Remember when the status line changed, so it can cross-fade.
        fn note_stage(&mut self) {
            let current = self.stage_label();
            if current != self.stage_text {
                self.stage_prev = self.stage_text;
                self.stage_text = current;
                self.stage_changed = Instant::now();
            }
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
            let started = Instant::now();
            self.paint(t);
            self.present(clamp01(opacity * entrance));
            // A slow PC keeps its CPU for starting SahelFlow: if frames keep
            // taking too long, the ripple stops and the card holds still.
            if !self.calm && !self.reduced_motion && t > INTRO_LENGTH_MS {
                if started.elapsed().as_millis() > SLOW_FRAME_MS {
                    self.slow_frames = self.slow_frames.saturating_add(1);
                    if self.slow_frames >= SLOW_FRAMES_BEFORE_CALM {
                        self.calm = true;
                    }
                } else {
                    self.slow_frames = 0;
                }
            }
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
            let mut edge: *mut GpPen = std::ptr::null_mut();
            GdipCreatePen1(p.edge, 1.0, UnitPixel, &mut edge);
            GdipDrawLine(g, edge, CARD_RADIUS, 1.5, CARD_WIDTH - CARD_RADIUS, 1.5);
            GdipDeletePen(edge);
            GdipDeletePath(card);
            GdipFlush(g, FlushIntentionSync);
            self.base = self.copy_out();
        }

        unsafe fn paint(&mut self, t: f32) {
            let g = self.graphics;
            self.note_stage();
            let step = glow_step(self.progress.shown);
            if t >= INTRO_LENGTH_MS {
                if self.settled.is_empty() || self.settled_step != step {
                    self.copy_in(&self.base);
                    self.paint_intro(g, INTRO_LENGTH_MS + 1_000.0);
                    GdipFlush(g, FlushIntentionSync);
                    self.settled = self.copy_out();
                    self.settled_step = step;
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

        /// The glow, the wordmark, the tagline and the version: they fade in
        /// once and are then cached; the glow takes a new step as the card fills.
        unsafe fn paint_intro(&self, g: *mut GpGraphics, t: f32) {
            let p = self.palette;
            let rtl = self.rtl();
            self.reset_to_card_space(g);

            self.paint_glow(g, ease_out_cubic(timeline(t, 0.0, 900.0)));
            self.paint_wordmark(
                g,
                with_alpha(p.ink, ease_out_cubic(timeline(t, 180.0, 600.0))),
            );
            self.reset_to_card_space(g);

            let tagline = ease_out_cubic(timeline(t, 260.0, 600.0));
            draw_text(
                g,
                self.copy.tagline,
                self.fonts.body,
                if rtl {
                    self.fonts.center_rtl
                } else {
                    self.fonts.center
                },
                0.0,
                TAGLINE_TOP,
                CARD_WIDTH,
                with_alpha(p.muted, tagline),
            );
            let version = ease_out_cubic(timeline(t, 500.0, 600.0));
            draw_text(
                g,
                &self.version,
                self.fonts.tiny,
                self.fonts.center,
                0.0,
                VERSION_TOP,
                CARD_WIDTH,
                with_alpha(p.faint, version),
            );
        }

        /// The SahelFlow wordmark, filled from its outline.
        unsafe fn paint_wordmark(&self, g: *mut GpGraphics, color: u32) {
            if color >> 24 == 0 {
                return;
            }
            self.reset_to_card_space(g);
            let scale = WORDMARK_WIDTH / wordmark::VIEW_WIDTH;
            GdipTranslateWorldTransform(
                g,
                (CARD_WIDTH - WORDMARK_WIDTH) / 2.0,
                WORDMARK_TOP,
                MatrixOrderPrepend,
            );
            GdipScaleWorldTransform(g, scale, scale, MatrixOrderPrepend);
            GdipTranslateWorldTransform(g, 0.0, wordmark::BASELINE, MatrixOrderPrepend);
            let mut path: *mut GpPath = std::ptr::null_mut();
            GdipCreatePath(FillModeWinding, &mut path);
            let (mut x, mut y) = (0.0_f32, 0.0_f32);
            for segment in wordmark::PATH.iter() {
                match *segment {
                    wordmark::Seg::M(to_x, to_y) => {
                        GdipStartPathFigure(path);
                        x = to_x;
                        y = to_y;
                    }
                    wordmark::Seg::L(to_x, to_y) => {
                        GdipAddPathLine(path, x, y, to_x, to_y);
                        x = to_x;
                        y = to_y;
                    }
                    wordmark::Seg::C(x1, y1, x2, y2, to_x, to_y) => {
                        GdipAddPathBezier(path, x, y, x1, y1, x2, y2, to_x, to_y);
                        x = to_x;
                        y = to_y;
                    }
                    wordmark::Seg::Z => {
                        GdipClosePathFigure(path);
                    }
                }
            }
            fill_solid(g, path, color);
            GdipDeletePath(path);
            self.reset_to_card_space(g);
        }

        /// The light behind the mark: one smooth radial falloff, cut by the
        /// card's rounded corners, that wakes up as the card fills.
        unsafe fn paint_glow(&self, g: *mut GpGraphics, strength: f32) {
            let level = glow_step(self.progress.shown) as f32 / GLOW_STEPS as f32;
            let alpha = clamp01(strength) * glow_alpha(level, self.palette.dark);
            if alpha <= 0.0 {
                return;
            }
            self.reset_to_card_space(g);
            let card = rounded_rect(0.5, 0.5, CARD_WIDTH - 1.0, CARD_HEIGHT - 1.0, CARD_RADIUS);
            GdipSetClipPath(g, card, CombineModeReplace);
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
                GdipSetPathGradientCenterColor(brush, with_alpha(self.palette.glow, alpha));
                let edge = [with_alpha(self.palette.glow, 0.0)];
                let mut count = 1;
                GdipSetPathGradientSurroundColorsWithCount(brush, edge.as_ptr(), &mut count);
                // Position 0 is the rim and 1 the centre: full strength at the
                // centre, 30% at 45% of the way in, nothing at the rim.
                let positions = [0.0_f32, 0.45, 1.0];
                let factors = [0.0_f32, 0.3, 1.0];
                GdipSetPathGradientBlend(brush, factors.as_ptr(), positions.as_ptr(), 3);
                GdipFillPath(g, brush.cast(), path);
                GdipDeleteBrush(brush.cast());
            }
            GdipDeletePath(path);
            GdipResetClip(g);
            GdipDeletePath(card);
        }

        /// The mark with its fill, the status row, the slow hint and the
        /// window chips.
        unsafe fn paint_dynamic(&self, g: *mut GpGraphics, t: f32) {
            let p = self.palette;
            let rtl = self.rtl();
            let closing = quit_requested();
            // The workspace is up and the card is on its way out: the S is full.
            let finishing = self.closing_since.is_some() && !closing;
            self.reset_to_card_space(g);

            let fill = if finishing { 1.0 } else { self.progress.shown };
            self.paint_mark(g, t, fill, finishing);
            self.reset_to_card_space(g);

            // The status row, centred: [stage] . [percent]. In Arabic the
            // percent sits on the left and the stage on the right.
            let (alpha, _) = rise(t, 380.0);
            let stage_ms = self.stage_changed.elapsed().as_secs_f32() * 1_000.0;
            let (label, label_alpha) = if self.stage_prev.is_empty() {
                (self.stage_text, 1.0)
            } else if stage_ms < STAGE_FADE_MS {
                (self.stage_prev, 1.0 - stage_ms / STAGE_FADE_MS)
            } else {
                (
                    self.stage_text,
                    clamp01((stage_ms - STAGE_FADE_MS) / STAGE_FADE_MS),
                )
            };
            let label_width = measure_width(g, label, self.fonts.body) + 2.0;
            let row = label_width + STATUS_GAP * 2.0 + STATUS_DOT + PERCENT_WIDTH;
            let left = (CARD_WIDTH - row) / 2.0;
            let (stage_x, dot_x, percent_x) = if rtl {
                (
                    left + PERCENT_WIDTH + STATUS_GAP * 2.0 + STATUS_DOT,
                    left + PERCENT_WIDTH + STATUS_GAP,
                    left,
                )
            } else {
                (
                    left,
                    left + label_width + STATUS_GAP,
                    left + label_width + STATUS_GAP * 2.0 + STATUS_DOT,
                )
            };
            draw_text(
                g,
                label,
                self.fonts.body,
                if rtl {
                    self.fonts.center_rtl
                } else {
                    self.fonts.center
                },
                stage_x,
                STATUS_TOP,
                label_width,
                with_alpha(p.text, alpha * label_alpha),
            );
            let mut dot: *mut GpSolidFill = std::ptr::null_mut();
            GdipCreateSolidFill(with_alpha(p.accent, alpha), &mut dot);
            GdipFillEllipse(
                g,
                dot.cast(),
                dot_x,
                STATUS_TOP + 9.5 - STATUS_DOT / 2.0,
                STATUS_DOT,
                STATUS_DOT,
            );
            GdipDeleteBrush(dot.cast());
            let percent = if finishing {
                100
            } else {
                self.progress.percent()
            };
            draw_text(
                g,
                &format!("{percent}%"),
                self.fonts.percent,
                self.fonts.center,
                percent_x,
                STATUS_TOP,
                PERCENT_WIDTH,
                with_alpha(p.muted, alpha),
            );

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

        /// The mark is the progress: a faint S that fills from the bottom as the
        /// launch really advances (the deep lower arc first, the sky upper arc
        /// last), with a slow low ripple on the surface and a thin bright line
        /// along it. The dot lands last and breathes while the card waits.
        /// Geometry mirrors public/brand/sahelflow-logo.svg (viewBox 9 7 50 50).
        unsafe fn paint_mark(&self, g: *mut GpGraphics, t: f32, fill: f32, finishing: bool) {
            let appear = ease_out_cubic(timeline(t, 0.0, 700.0));
            if appear <= 0.0 {
                return;
            }
            let p = self.palette;
            let unit = MARK_SIZE / 50.0;
            let origin_x = CARD_WIDTH / 2.0 - MARK_SIZE / 2.0 - 9.0 * unit;
            let origin_y = MARK_TOP - 7.0 * unit;
            let settle = 0.96 + 0.04 * appear;
            let calm = self.calm || self.reduced_motion;
            let seconds = self.shown_at.elapsed().as_secs_f32();
            let level = mark_fill_level(fill);
            let amplitude = wave_amplitude(fill, calm);

            // The surface line, and the water under it, in the mark's units.
            let mut surface: Vec<PointF> = Vec::with_capacity(40);
            let mut x = MARK_WAVE_FROM;
            while x <= MARK_WAVE_TO {
                surface.push(PointF {
                    X: x,
                    Y: wave_height(x, level, amplitude, seconds),
                });
                x += 1.0;
            }
            let mut water = surface.clone();
            water.push(PointF {
                X: MARK_WAVE_TO,
                Y: 70.0,
            });
            water.push(PointF {
                X: MARK_WAVE_FROM,
                Y: 70.0,
            });

            let place = || {
                self.reset_to_card_space(g);
                GdipTranslateWorldTransform(g, CARD_WIDTH / 2.0, MARK_CENTER_Y, MatrixOrderPrepend);
                GdipScaleWorldTransform(g, settle, settle, MatrixOrderPrepend);
                GdipTranslateWorldTransform(
                    g,
                    -CARD_WIDTH / 2.0,
                    -MARK_CENTER_Y,
                    MatrixOrderPrepend,
                );
                GdipTranslateWorldTransform(g, origin_x, origin_y, MatrixOrderPrepend);
                GdipScaleWorldTransform(g, unit, unit, MatrixOrderPrepend);
            };
            // One arc of the S: a disc with a smaller disc cut out and half of
            // it cut away.
            let crescent = |center: (f32, f32),
                            cutout: (f32, f32),
                            clip: (f32, f32, f32, f32)|
             -> *mut GpRegion {
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
                GdipDeletePath(inner);
                GdipDeletePath(outer);
                region
            };

            let arcs = [
                (
                    ((31.5, 23.0), (35.4, 25.6), (31.5, 23.0, 33.0, 41.0)),
                    p.sky,
                    ((17.0, 9.0), (42.0, 34.0)),
                ),
                (
                    ((32.5, 41.0), (28.6, 38.4), (0.0, 0.0, 32.5, 41.0)),
                    p.deep,
                    ((22.0, 30.0), (47.0, 55.0)),
                ),
            ];
            for (shape, colors, gradient) in arcs {
                place();
                // The faint, still unfilled S.
                let unfilled = crescent(shape.0, shape.1, shape.2);
                let mut faint: *mut GpSolidFill = std::ptr::null_mut();
                GdipCreateSolidFill(with_alpha(p.ghost, appear), &mut faint);
                GdipFillRegion(g, faint.cast(), unfilled);
                GdipDeleteBrush(faint.cast());
                GdipDeleteRegion(unfilled);
                // The part the launch has filled so far.
                let filled = crescent(shape.0, shape.1, shape.2);
                let mut sea: *mut GpPath = std::ptr::null_mut();
                GdipCreatePath(FillModeAlternate, &mut sea);
                GdipAddPathPolygon(sea, water.as_ptr(), water.len() as i32);
                GdipCombineRegionPath(filled, sea, CombineModeIntersect);
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
                    with_alpha(colors.0, appear),
                    with_alpha(colors.1, appear),
                    WrapModeTileFlipXY,
                    &mut brush,
                );
                GdipFillRegion(g, brush.cast(), filled);
                GdipDeleteBrush(brush.cast());
                GdipDeletePath(sea);
                GdipDeleteRegion(filled);
            }
            // A thin bright line along the surface, inside the S only.
            for (shape, _, _) in arcs {
                place();
                let inside = crescent(shape.0, shape.1, shape.2);
                GdipSetClipRegion(g, inside, CombineModeReplace);
                let mut pen: *mut GpPen = std::ptr::null_mut();
                GdipCreatePen1(
                    argb((128.0 * appear) as u8, 255, 255, 255),
                    0.45,
                    UnitWorld,
                    &mut pen,
                );
                GdipDrawLines(g, pen, surface.as_ptr(), surface.len() as i32);
                GdipDeletePen(pen);
                GdipResetClip(g);
                GdipDeleteRegion(inside);
            }

            // The dot lands last and breathes while the card waits.
            let land = timeline(t, 900.0, 550.0);
            if land > 0.0 {
                let radius = 3.1 * ease_out_back(land);
                let breathing = if finishing {
                    1.0
                } else if calm {
                    0.6
                } else {
                    0.45 + 0.25 * (seconds * 2.6).sin()
                };
                place();
                let mut dot: *mut GpSolidFill = std::ptr::null_mut();
                GdipCreateSolidFill(
                    with_alpha(p.dot, clamp01(land * 1.6) * breathing * appear),
                    &mut dot,
                );
                GdipFillEllipse(
                    g,
                    dot.cast(),
                    47.2 - radius,
                    12.4 - radius,
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

    /// The width of `text` in card pixels (no side padding), for centring a
    /// row of several pieces. A rough per-letter guess if GDI+ cannot measure.
    unsafe fn measure_width(g: *mut GpGraphics, text: &str, font: *mut GpFont) -> f32 {
        if text.is_empty() {
            return 0.0;
        }
        let guess = text.chars().count() as f32 * 7.0;
        let mut typographic: *mut GpStringFormat = std::ptr::null_mut();
        if GdipStringFormatGetGenericTypographic(&mut typographic) != Ok || typographic.is_null() {
            return guess;
        }
        let wide_text = wide(text);
        let layout = RectF {
            X: 0.0,
            Y: 0.0,
            Width: 1000.0,
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
            wide_text.as_ptr(),
            (wide_text.len() - 1) as i32,
            font,
            &layout,
            typographic,
            &mut bounds,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        if status == Ok && bounds.Width > 0.0 {
            bounds.Width
        } else {
            guess
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
            settled_step: 0,
            stage_text: "",
            stage_prev: "",
            stage_changed: now,
            calm: false,
            slow_frames: 0,
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
        let last_fade = [
            (180.0, 600.0),
            (260.0, 600.0),
            (500.0, 600.0),
            (380.0, 520.0),
        ]
        .iter()
        .fold(0.0_f32, |latest, (delay, length)| {
            latest.max(delay + length)
        });
        assert!(last_fade <= INTRO_LENGTH_MS);
        assert!(le(700.0, INTRO_LENGTH_MS), "the mark");
        assert!(le(900.0 + 550.0, INTRO_LENGTH_MS), "the dot");
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
            WORDMARK_TOP + WORDMARK_HEIGHT,
            TAGLINE_TOP,
            STATUS_TOP,
            HINT_TOP,
            VERSION_TOP,
            CARD_HEIGHT,
        ];
        for pair in stack.windows(2) {
            assert!(pair[0] < pair[1], "layout out of order: {stack:?}");
        }
        // Each text block has room for its line (font size x 1.4).
        assert!(lt(TAGLINE_TOP + 13.5 * 1.4, STATUS_TOP));
        assert!(lt(STATUS_TOP + 13.5 * 1.4, HINT_TOP));
        assert!(lt(HINT_TOP + 12.0 * 1.4, VERSION_TOP));
        assert!(lt(VERSION_TOP + 12.0 * 1.4, CARD_HEIGHT));
        // The longest status line (French, about 190 px) and the percent fit.
        assert!(lt(
            PERCENT_WIDTH + STATUS_GAP * 2.0 + STATUS_DOT + 260.0,
            CARD_WIDTH - EDGE_INSET * 2.0
        ));
        // The mark is centred and its glow is cut by the card, not by the layout.
        assert!(le(0.0, MARK_TOP));
        assert!(lt(MARK_CENTER_Y, WORDMARK_TOP));
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
    fn all_eight_looks_are_legible() {
        // Text 4.5:1 (WCAG AA) against both ends of the card; the chip icons
        // and the status dot 3:1 (non-text).
        for look in looks() {
            let p = palette(look);
            for end in [p.card_top, p.card_bottom] {
                for (name, color) in [
                    ("ink", p.ink),
                    ("text", p.text),
                    ("muted", p.muted),
                    ("faint", p.faint),
                ] {
                    let ratio = contrast(color, end);
                    assert!(ratio >= 4.5, "{look:?} {name} {ratio:.2}:1 on {end:06X}");
                }
                let icon = contrast(p.muted, end);
                assert!(icon >= 3.0, "{look:?} chip icon {icon:.2}:1");
                let dot = contrast(p.accent, end);
                assert!(dot >= 3.0, "{look:?} status dot {dot:.2}:1 on {end:06X}");
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
            let palettes: Vec<Palette> = PRESETS
                .iter()
                .map(|preset| {
                    palette(Appearance {
                        theme,
                        preset: *preset,
                    })
                })
                .collect();
            for (name, mut values) in [
                (
                    "status dot",
                    palettes.iter().map(|p| p.accent).collect::<Vec<u32>>(),
                ),
                ("mark", palettes.iter().map(|p| p.sky.1).collect()),
                ("card", palettes.iter().map(|p| p.card_bottom).collect()),
            ] {
                values.sort_unstable();
                values.dedup();
                assert_eq!(
                    values.len(),
                    PRESETS.len(),
                    "{theme:?}: every preset has its own {name}"
                );
            }
        }
    }

    fn hue(color: u32) -> f32 {
        let r = ((color >> 16) & 0xFF) as f32 / 255.0;
        let g = ((color >> 8) & 0xFF) as f32 / 255.0;
        let b = (color & 0xFF) as f32 / 255.0;
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        let d = max - min;
        if d < 1e-6 {
            return 0.0;
        }
        let h = if (max - r).abs() < 1e-6 {
            ((g - b) / d).rem_euclid(6.0)
        } else if (max - g).abs() < 1e-6 {
            (b - r) / d + 2.0
        } else {
            (r - g) / d + 4.0
        };
        h * 60.0
    }

    fn hue_gap(a: f32, b: f32) -> f32 {
        let d = (a - b).abs() % 360.0;
        d.min(360.0 - d)
    }

    #[test]
    fn the_mark_wears_each_presets_accent() {
        // The looks are generated from the accent in the workspace theme; if a
        // preset's accent changes without regenerating them, this fails.
        for look in looks() {
            let accent = tokens(look.theme, look.preset).primary;
            let p = palette(look);
            let gap = hue_gap(hue(p.sky.1), hue(accent));
            assert!(
                gap <= 15.0,
                "{look:?}: the mark's hue is {gap:.1} degrees from the preset accent"
            );
        }
    }

    #[test]
    fn the_card_keeps_its_light_or_dark_character_for_every_theme() {
        for look in looks() {
            let p = palette(look);
            assert!(
                luminance(p.card_top) > luminance(p.card_bottom),
                "{look:?}: the top of the card is a step lighter"
            );
            match look.theme {
                Theme::Dark => assert!(
                    luminance(p.card_top) < 0.03,
                    "{look:?}: a dark card stays near-black"
                ),
                Theme::Light => assert!(
                    luminance(p.card_bottom) > 0.7,
                    "{look:?}: a light card stays light"
                ),
            }
        }
    }

    #[test]
    fn the_mark_fills_from_the_bottom_with_the_launch() {
        assert!((mark_fill_level(0.0) - 57.0).abs() < 1e-4);
        assert!((mark_fill_level(1.0) - 6.0).abs() < 1e-4);
        assert!((mark_fill_level(-1.0) - 57.0).abs() < 1e-4, "clamped below");
        assert!((mark_fill_level(2.0) - 6.0).abs() < 1e-4, "clamped above");
        let mut last = f32::MAX;
        for step in 0..=20 {
            let level = mark_fill_level(step as f32 / 20.0);
            assert!(level < last, "the surface only rises");
            last = level;
        }
        // Below the S when empty (the S spans y 9 to 55), above it when full.
        assert!(mark_fill_level(0.0) > 55.0);
        assert!(mark_fill_level(0.99) < 9.0);
    }

    #[test]
    fn the_ripple_calms_as_it_fills_and_stays_at_the_surface() {
        assert!(wave_amplitude(0.5, true).abs() < 1e-9, "calm mode is flat");
        assert!(wave_amplitude(1.0, false).abs() < 1e-6);
        assert!(wave_amplitude(0.0, false) > wave_amplitude(0.6, false));
        let amplitude = wave_amplitude(0.3, false);
        for seconds in [0.0, 0.7, 3.1, 12.9] {
            for x in [14.0, 30.0, 52.0] {
                let y = wave_height(x, 40.0, amplitude, seconds);
                assert!(
                    (y - 40.0).abs() <= amplitude * 1.55 + 1e-4,
                    "the ripple stays within its amplitude"
                );
            }
        }
        assert!((wave_height(20.0, 33.0, 0.0, 5.0) - 33.0).abs() < 1e-6);
    }

    #[test]
    fn the_glow_wakes_up_in_whole_steps() {
        assert_eq!(glow_step(0.0), 0);
        assert_eq!(glow_step(1.0), GLOW_STEPS);
        assert!(glow_step(0.5) > glow_step(0.2));
        for dark in [true, false] {
            assert!(glow_alpha(1.0, dark) > glow_alpha(0.0, dark));
            assert!(glow_alpha(1.0, dark) < 0.25, "a glow, never a spotlight");
        }
    }

    #[test]
    fn the_wordmark_outline_is_whole_and_inside_its_box() {
        use wordmark::Seg;
        let mut contours = 0;
        let mut open = false;
        for segment in wordmark::PATH.iter() {
            let points: Vec<(f32, f32)> = match *segment {
                Seg::M(x, y) => {
                    assert!(!open, "a contour was left open");
                    open = true;
                    contours += 1;
                    vec![(x, y)]
                }
                Seg::L(x, y) => {
                    assert!(open);
                    vec![(x, y)]
                }
                Seg::C(a, b, c, d, e, f) => {
                    assert!(open);
                    vec![(a, b), (c, d), (e, f)]
                }
                Seg::Z => {
                    assert!(open);
                    open = false;
                    vec![]
                }
            };
            for (x, y) in points {
                assert!(
                    (0.0..=wordmark::VIEW_WIDTH).contains(&x),
                    "x {x} is outside the outline's box"
                );
                assert!(
                    (-wordmark::BASELINE..=40.0).contains(&y),
                    "y {y} is outside the outline's box"
                );
            }
        }
        assert!(!open, "the last contour was left open");
        assert_eq!(contours, wordmark::CONTOURS);
    }
}
