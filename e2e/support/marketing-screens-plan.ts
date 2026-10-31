// The plan for the scripted capture of the real app: which screens, in which
// language and size, with which cookies, and what a picture must never show.
//
// PURE: no browser, no Playwright, no file access. The thin spec
// e2e/marketing-screens.spec.ts takes the pictures; tests/marketing-screens-plan.test.ts
// pins every value here. marketing/scripts/screens-lib.mjs keeps the same names
// for the Node scripts (a test makes sure the two lists agree).

export const LOCALES = ["ar", "fr", "en"] as const;
export type ScreenLocale = (typeof LOCALES)[number];

export type ViewportName = "desktop" | "phone";
export interface ScreenViewport {
  name: ViewportName;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export const VIEWPORTS: Record<ViewportName, ScreenViewport> = {
  desktop: { name: "desktop", width: 1600, height: 1000, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { name: "phone", width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
export const VIEWPORT_NAMES: readonly ViewportName[] = ["desktop", "phone"];

/** Pixel width of the picture a viewport produces (CSS width x device scale). */
export function originalWidth(viewport: ViewportName): number {
  const v = VIEWPORTS[viewport];
  return v.width * v.deviceScaleFactor;
}

/** Where the site reads its pictures (relative to the repository root). */
export const OUT_DIR = "marketing/static/img/screens";

export const DESKTOP_FILE_RE = /^[a-z]+-(ar|fr|en)\.webp$/;
export const PHONE_FILE_RE = /^[a-z]+-phone-(ar|fr|en)\.webp$/;

// ── the look: LIGHT Carnet only (the Founder does not like the dark and light theme) ──
export const COOKIE_NAMES = {
  locale: "sahelflow-locale",
  theme: "sahelflow-theme",
  preset: "sahelflow-theme-preset",
  look: "sahelflow-look",
} as const;

export interface ScreenCookie {
  name: string;
  value: string;
  url: string;
}

export function screenCookies(locale: ScreenLocale, url: string): ScreenCookie[] {
  return [
    { name: COOKIE_NAMES.theme, value: "light", url },
    { name: COOKIE_NAMES.preset, value: "carnet", url },
    { name: COOKIE_NAMES.look, value: "2", url },
    { name: COOKIE_NAMES.locale, value: locale, url },
  ];
}

/** The same choices in localStorage (the app reads both; see audit tools shots.cjs). */
export function localStorageValues(locale: ScreenLocale): Record<string, string> {
  return {
    theme: "light",
    [COOKIE_NAMES.preset]: "carnet",
    [COOKIE_NAMES.look]: "2",
    [COOKIE_NAMES.locale]: locale,
  };
}

// ── the demo workspace ──
export const DEMO_ID_PREFIX = "demo-";

export interface DemoIds {
  customerId: string;
  orderId: string;
  deliveryId: string;
  storefrontId: string;
  conversationId: string;
}

/** Ids the Algerian demo generator creates (src/lib/demo/algerian-demo*.ts). */
export const FLAGSHIP_IDS: DemoIds = {
  customerId: "demo-customer-01",
  orderId: "demo-order-001",
  deliveryId: "demo-delivery-flagship",
  storefrontId: "demo-storefront-01",
  conversationId: "demo-conversation-01",
};

export const SCREEN_NAMES = [
  "dashboard",
  "orders",
  "queue",
  "order",
  "inbox",
  "customer",
  "delivery",
  "parcel",
  "risk",
  "analytics",
  "accounting",
  "flow",
  "storefronts",
  "studio",
  "team",
] as const;
export type ScreenName = (typeof SCREEN_NAMES)[number];

export interface ScreenSpec {
  name: ScreenName;
  route: (ids: DemoIds) => string;
  /** CSS selector that must be visible before the shot. */
  waitFor: string;
  scrollTo?: string;
  fullViewport: true;
}

const enc = encodeURIComponent;

function screen(name: ScreenName, route: (ids: DemoIds) => string, waitFor = "main", scrollTo?: string): ScreenSpec {
  return scrollTo ? { name, route, waitFor, scrollTo, fullViewport: true } : { name, route, waitFor, fullViewport: true };
}

export const SCREENS: readonly ScreenSpec[] = [
  screen("dashboard", () => "/dashboard"),
  screen("orders", () => "/orders"),
  screen("queue", () => "/orders/confirmation-queue"),
  screen("order", (ids) => `/orders/${enc(ids.orderId)}`),
  screen("inbox", (ids) => `/inbox?conversation=${enc(ids.conversationId)}`),
  screen("customer", (ids) => `/customers/${enc(ids.customerId)}`),
  screen("delivery", () => "/deliveries"),
  screen("parcel", (ids) => `/deliveries/${enc(ids.deliveryId)}`),
  screen("risk", () => "/risk"),
  screen("analytics", () => "/analytics"),
  screen("accounting", () => "/accounting"),
  screen("flow", () => "/automations"),
  screen("storefronts", () => "/storefronts"),
  screen("studio", (ids) => `/storefronts/${enc(ids.storefrontId)}`),
  // Settings opens as a window over the dashboard.
  screen("team", () => "/settings?group=team", '[role="dialog"]'),
];

export function fileName(name: ScreenName, locale: ScreenLocale, viewport: ViewportName): string {
  return viewport === "phone" ? `${name}-phone-${locale}.webp` : `${name}-${locale}.webp`;
}

/** Every original the capture must produce: 15 screens x 3 languages x 2 sizes. */
export function expectedFiles(): string[] {
  const files: string[] = [];
  for (const viewport of VIEWPORT_NAMES) {
    for (const name of SCREEN_NAMES) {
      for (const locale of LOCALES) files.push(fileName(name, locale, viewport));
    }
  }
  return files;
}

// ── the clocks ──
/** One of the two clocks: the server's is SF_DEMO_REFERENCE_NOW, the browser's is this instant. */
export function fixedClock(referenceNow: string): string {
  const value = referenceNow.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T10:00:00` : value;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/** Why a reference time cannot be used, or null. A moving clock must never produce pictures. */
export function referenceNowProblem(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return "SF_DEMO_REFERENCE_NOW is not set: a moving clock must never produce pictures";
  if (!ISO_RE.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    return `SF_DEMO_REFERENCE_NOW "${trimmed}" is not an ISO date (YYYY-MM-DD) or date-time`;
  }
  return null;
}

// ── preflight: refuse to shoot anything that is not the demo ──
export interface PreflightInput {
  referenceNow: string | undefined;
  customerIds: readonly string[];
  orderIds: readonly string[];
  ids?: DemoIds;
}
export interface PreflightResult {
  ok: boolean;
  problems: string[];
}

export function isDemoId(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX) && id.length > DEMO_ID_PREFIX.length;
}

function notDemo(label: string, ids: readonly string[]): string[] {
  const bad = ids.filter((id) => !isDemoId(id));
  if (bad.length === 0) return [];
  const shown = bad.slice(0, 5).join(", ");
  return [`${bad.length} ${label} id(s) without the "${DEMO_ID_PREFIX}" prefix, e.g. ${shown}: this is not the demo workspace`];
}

export function preflight(input: PreflightInput): PreflightResult {
  const problems: string[] = [];
  const clock = referenceNowProblem(input.referenceNow);
  if (clock) problems.push(clock);
  if (input.customerIds.length === 0) problems.push("the customers list is empty: the demo data is not loaded");
  if (input.orderIds.length === 0) problems.push("the orders list is empty: the demo data is not loaded");
  problems.push(...notDemo("customer", input.customerIds), ...notDemo("order", input.orderIds));
  if (input.ids) problems.push(...notDemo("flagship", Object.values(input.ids)));
  return { ok: problems.length === 0, problems };
}

// ── what the visible text may say ──
/** Whole-word alternation over regex fragments, longest first, letters on both sides excluded. */
function wholeWord(fragments: readonly string[]): RegExp {
  const alt = [...fragments].sort((a, b) => b.length - a.length).join("|");
  return new RegExp(`(?<!\\p{L})(?:${alt})(?!\\p{L})`, "giu");
}

const DIGITS = "[\\d\\u0660-\\u0669\\u06F0-\\u06F9]+";

const RELATIVE_PATTERNS: readonly RegExp[] = [
  // English: "3 min ago", "an hour ago", "just now", "yesterday"
  new RegExp(
    `(?<![\\p{L}\\d])(?:\\d+|an?|one)\\s*(?:s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?|w|weeks?|months?)\\s+ago(?!\\p{L})`,
    "giu",
  ),
  wholeWord(["just\\s+now", "yesterday"]),
  // French: "il y a 3 min", "il y a une heure", "à l'instant", "hier"
  new RegExp(
    `(?<!\\p{L})il\\s+y\\s+a\\s+(?:\\d+|une?)\\s*(?:s|secs?|secondes?|min|minutes?|h|heures?|j|jours?|sem|semaines?|mois)(?!\\p{L})`,
    "giu",
  ),
  wholeWord(["à\\s+l['’]instant", "hier"]),
  // Arabic: "منذ 3 دقائق", "منذ ساعتين", "الآن", "أمس"
  new RegExp(
    `(?<!\\p{L})منذ\\s+(?:${DIGITS}\\s+)?(?:ثانية|ثواني|ثوان|ثانيتين|دقيقة|دقيقتين|دقائق|ساعة|ساعتين|ساعات|يوم|يومين|أيام|ايام|أسبوع|اسبوع|أسبوعين|أسابيع|شهر|شهرين|أشهر)(?!\\p{L})`,
    "giu",
  ),
  wholeWord(["الآن", "أمس", "امس"]),
];

/**
 * Relative times ("3 min ago") follow the SERVER clock, not the frozen browser
 * clock. The spec lists them in the report instead of hiding them.
 */
export function relativeTimeWords(text: string): string[] {
  const found: { index: number; text: string }[] = [];
  for (const pattern of RELATIVE_PATTERNS) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      found.push({ index: match.index ?? 0, text: match[0] });
    }
  }
  found.sort((a, b) => a.index - b.index);
  return found.map((item) => item.text);
}

/** How many characters may sit between a "connected" word and a courier / WhatsApp name. */
export const CLAIM_WINDOW = 48;

const STATE_WORDS = wholeWord([
  // en
  "online\\s+now",
  "connected",
  "online",
  "live",
  // fr
  "connect[ée]e?s?",
  "en\\s+ligne",
  "en\\s+direct",
  // ar
  "متصل",
  "متصلة",
  "متصلين",
  "متصلون",
  "أونلاين",
  "على\\s+الإنترنت",
  "مباشرة",
  "مباشر",
]);

const NAME_WORDS = wholeWord([
  "whatsapp",
  "واتساب",
  "واتس\\s*[آا]ب",
  "yalidine",
  "ياليدين",
  "zr\\s+express",
  "ecotrack",
  "[إا]يكوتراك",
  "maystro",
  "مايسترو",
  "courier",
  "carrier",
  "transporteur",
  "livreur",
  "coursier",
  "شركة\\s+التوصيل",
  "مندوب\\s+التوصيل",
]);

export interface ForbiddenClaim {
  state: string;
  name: string;
  excerpt: string;
}

interface Hit {
  index: number;
  end: number;
  text: string;
}

function hits(text: string, pattern: RegExp): Hit[] {
  return [...text.matchAll(new RegExp(pattern.source, pattern.flags))].map((match) => ({
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    text: match[0],
  }));
}

/**
 * A "connected" / "online now" / "live" word standing next to WhatsApp or a
 * courier name would tell a visitor that a live account is behind the picture.
 * Demo data never has one, so the spec fails on it (a negated form such as
 * "not connected" is flagged too: the lead reads the report).
 */
export function forbiddenClaims(text: string): ForbiddenClaim[] {
  const states = hits(text, STATE_WORDS);
  const names = hits(text, NAME_WORDS);
  const claims: ForbiddenClaim[] = [];
  for (const state of states) {
    for (const name of names) {
      const gap = state.index >= name.end ? state.index - name.end : name.index >= state.end ? name.index - state.end : 0;
      if (gap > CLAIM_WINDOW) continue;
      const from = Math.max(0, Math.min(state.index, name.index) - 10);
      const to = Math.max(state.end, name.end) + 10;
      claims.push({ state: state.text, name: name.text, excerpt: text.slice(from, to).replace(/\s+/g, " ").trim() });
    }
  }
  return claims;
}

// ── the report the spec writes (outside the repository) ──
export interface ShotRecord {
  file: string;
  screen: ScreenName;
  locale: ScreenLocale;
  viewport: ViewportName;
  bytes: number;
  sha256: string;
  width: number;
  height: number;
  relativeTimeWords: string[];
  forbiddenClaims: ForbiddenClaim[];
  consoleErrors: string[];
  error?: string;
}
