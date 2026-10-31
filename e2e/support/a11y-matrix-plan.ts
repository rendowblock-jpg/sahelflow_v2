import { readdirSync } from "node:fs";
import { join } from "node:path";
import { formatAxeViolations, type AxeViolation } from "./axe";

/**
 * W3-H2 accessibility matrix: the PLAN (pure, no browser).
 *
 * One cell = one page x locale x theme x viewport x mode. The routes come from the filesystem: every
 * src/app/**\/page.tsx is either in ROUTES (measured) or in EXCLUDED (with a written reason), and a unit test fails on
 * a page nobody classified, so a new page cannot be forgotten. The browser part lives in e2e/a11y-matrix.spec.ts and
 * e2e/support/page-checks.ts; this file only decides WHAT runs and how a result is written, compared and resumed.
 */

export const LOCALES = ["ar", "fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const VIEWPORTS = {
  desktop: { width: 1366, height: 768 },
  phone: { width: 390, height: 844 },
  tiny: { width: 320, height: 568 },
} as const;
export type ViewportName = keyof typeof VIEWPORTS;
const VIEWPORT_NAMES: readonly ViewportName[] = ["desktop", "phone", "tiny"];

export const MODES = [
  "normal",
  "reflow320",
  "text200",
  "spacing",
  "forced",
  "reducedMotion",
  "keyboard",
] as const;
export type Mode = (typeof MODES)[number];

export type ModePlan = {
  viewports: readonly ViewportName[];
  themes: readonly Theme[];
};

/**
 * Which viewports and themes each mode runs on. `normal` is the full light/dark x phone/desktop matrix; every other
 * mode runs on one theme (light) because it tests something that does not depend on the theme: reflow at 320 px
 * (WCAG 1.4.10), text at 200% (1.4.4), text spacing (1.4.12), forced colours (Windows high contrast replaces both
 * themes), reduced motion, and the keyboard.
 */
export const MODE_PLAN: Record<Mode, ModePlan> = {
  normal: { viewports: ["desktop", "phone"], themes: ["light", "dark"] },
  reflow320: { viewports: ["tiny"], themes: ["light"] },
  text200: { viewports: ["desktop"], themes: ["light"] },
  spacing: { viewports: ["phone"], themes: ["light"] },
  forced: { viewports: ["phone", "desktop"], themes: ["light"] },
  reducedMotion: { viewports: ["desktop"], themes: ["light"] },
  keyboard: { viewports: ["desktop"], themes: ["light"] },
};

/** Without A11Y_MODES the run is the 'normal' matrix; A11Y_MODES=all adds every other mode. */
export const DEFAULT_MODES: readonly Mode[] = ["normal"];

export type Cell = {
  route: string;
  locale: Locale;
  theme: Theme;
  viewport: ViewportName;
  mode: Mode;
};

export type RouteDef = {
  /** The Next route as the filesystem names it, e.g. /orders/[id]. */
  pattern: string;
  /** owner = runs with the signed-in owner storage state; anonymous = a fresh context with no session. */
  auth: "owner" | "anonymous";
  /** A detail page is found by opening `list` and taking the first link matching `link` (regex source). */
  discover?: { list: string; link: string; suffix: string };
};

const STATIC_OWNER_ROUTES = [
  "/dashboard",
  "/orders",
  "/orders/confirmation-queue",
  "/products",
  "/customers",
  "/deliveries",
  "/returns",
  "/inbox",
  "/analytics",
  "/analytics/extraction",
  "/accounting",
  "/accounting/cod-reconciliation",
  "/agents",
  "/automations",
  "/automations/new",
  "/imports",
  "/notifications",
  "/onboarding",
  "/profile",
  "/risk",
  "/settings",
  "/storefronts",
  "/storefronts/new",
] as const;

const detail = (
  pattern: string,
  list: string,
  link: string,
  suffix = "",
): RouteDef => ({ pattern, auth: "owner", discover: { list, link, suffix } });

export const ROUTES: readonly RouteDef[] = [
  ...STATIC_OWNER_ROUTES.map((pattern): RouteDef => ({ pattern, auth: "owner" })),
  { pattern: "/login", auth: "anonymous" },
  { pattern: "/join", auth: "anonymous" },
  detail("/orders/[id]", "/orders", "^/orders/(?!confirmation-queue)[^/?#]+$"),
  detail("/customers/[id]", "/customers", "^/customers/[^/?#]+$"),
  detail("/products/[id]", "/products", "^/products/[^/?#]+$"),
  detail("/deliveries/[id]", "/deliveries", "^/deliveries/[^/?#]+$"),
  detail("/returns/[id]", "/returns", "^/returns/[^/?#]+$"),
  detail("/automations/[id]", "/automations", "^/automations/(?!new)[^/?#]+$"),
  detail("/storefronts/[id]", "/storefronts", "^/storefronts/(?!new)[^/?#]+$"),
  detail("/storefronts/[id]/studio", "/storefronts", "^/storefronts/(?!new)[^/?#]+$", "/studio"),
  detail("/storefronts/[id]/history", "/storefronts", "^/storefronts/(?!new)[^/?#]+$", "/history"),
];

export type ExcludedPage = { pattern: string; reason: string };

/** Pages that exist but are not measured here. Every entry says why; the notes file lists them as gaps. */
export const EXCLUDED: readonly ExcludedPage[] = [
  {
    pattern: "/",
    reason:
      "only redirects (to /setup, /login or the dashboard depending on who asks, src/app/page.tsx); it draws no screen of its own and its destinations are measured",
  },
  {
    pattern: "/setup",
    reason:
      "first-run screen for an empty database; the matrix runs on seed:rich where the shop already exists, so this is not what renders there (not checked in a browser); needs its own run on a fresh database",
  },
  {
    pattern: "/storefront/[slug]",
    reason:
      "the public store page: it exists only for a published storefront slug (notFound otherwise) and seed:rich has no published slug fixture; store pages are light-only by decision; needs a published-slug fixture",
  },
  {
    pattern: "/storefront/[slug]/lp/[page]",
    reason:
      "a landing page of a published storefront: needs a published slug and a landing page fixture that seed:rich does not hold; needs its own fixture and run",
  },
  {
    pattern: "/@modal/(.)settings",
    reason:
      "intercepting-route slot: it draws only as an overlay when a client-side navigation to /settings is intercepted (an overlay version of /settings, not checked to be identical); the full page /settings is measured; the dialog focus return is covered by the keyboard tour where a page has a dialog trigger",
  },
  {
    pattern: "/@modal/[...catchAll]",
    reason:
      "default empty slot: the page returns null (src/app/(dashboard)/@modal/[...catchAll]/page.tsx), nothing renders",
  },
];

/** Problems in the two tables themselves: empty reasons, duplicates, a page both routed and excluded. */
export function assertPlanTables(
  routes: ReadonlyArray<Pick<RouteDef, "pattern">>,
  excluded: ReadonlyArray<ExcludedPage>,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const route of routes) {
    if (seen.has(route.pattern)) problems.push(`route "${route.pattern}" is listed twice`);
    seen.add(route.pattern);
  }
  const seenExcluded = new Set<string>();
  for (const entry of excluded) {
    if (seenExcluded.has(entry.pattern)) problems.push(`excluded "${entry.pattern}" is listed twice`);
    seenExcluded.add(entry.pattern);
    if (seen.has(entry.pattern)) problems.push(`"${entry.pattern}" is both routed and excluded`);
    const words = entry.reason.trim().split(/\s+/).filter(Boolean);
    if (words.length < 4) {
      problems.push(`excluded "${entry.pattern}": the reason is empty or too short to explain anything`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------------------------
// Route enumeration from the app folder

/** src/app relative page file -> Next route. Route groups "(x)" vanish; slots "@modal" and "(.)x" stay as written. */
export function pageFileToRoute(relativePath: string): string {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop(); // page.tsx
  const kept = parts.filter((part) => !/^\([A-Za-z0-9_-]+\)$/.test(part));
  return `/${kept.join("/")}`;
}

/** Every page.tsx under `appDir`, as a sorted list of paths relative to it. Throws when the folder is missing. */
export function discoverPageFiles(appDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) found.push(rel);
    }
  };
  walk(appDir, "");
  return found.sort();
}

export type PageClassification = {
  routed: string[];
  excluded: string[];
  unclassified: string[];
  /** Table entries whose page file does not exist (renamed or deleted page). */
  stale: string[];
};

export function classifyPages(
  files: readonly string[],
  routes: ReadonlyArray<Pick<RouteDef, "pattern">> = ROUTES,
  excluded: ReadonlyArray<ExcludedPage> = EXCLUDED,
): PageClassification {
  const routedPatterns = new Set(routes.map((route) => route.pattern));
  const excludedPatterns = new Set(excluded.map((entry) => entry.pattern));
  const result: PageClassification = { routed: [], excluded: [], unclassified: [], stale: [] };
  const existing = new Set<string>();
  for (const file of files) {
    const route = pageFileToRoute(file);
    existing.add(route);
    if (routedPatterns.has(route)) result.routed.push(route);
    else if (excludedPatterns.has(route)) result.excluded.push(route);
    else result.unclassified.push(route);
  }
  for (const pattern of [...routedPatterns, ...excludedPatterns]) {
    if (!existing.has(pattern)) result.stale.push(pattern);
  }
  return result;
}

/** First link on a list page that matches the detail pattern; query and hash are dropped. */
export function pickDetail(hrefs: readonly string[], linkSource: string): string | null {
  const pattern = new RegExp(linkSource);
  for (const href of hrefs) {
    const path = (href.split(/[?#]/)[0] ?? "").trim();
    if (pattern.test(path)) return path;
  }
  return null;
}

/** Concrete routes to visit: the fixed ones plus a detail page found for each list; `missing` names the ones not found. */
export function resolveRoutes(
  defs: readonly RouteDef[],
  hrefsByList: Readonly<Record<string, readonly string[]>>,
): { routes: string[]; missing: string[] } {
  const routes: string[] = [];
  const missing: string[] = [];
  for (const def of defs) {
    if (!def.discover) {
      routes.push(def.pattern);
      continue;
    }
    const hit = pickDetail(hrefsByList[def.discover.list] ?? [], def.discover.link);
    if (hit === null) missing.push(def.pattern);
    else routes.push(`${hit}${def.discover.suffix}`);
  }
  return { routes, missing };
}

export function routeAuth(path: string): "owner" | "anonymous" {
  const anonymous = ROUTES.filter((route) => route.auth === "anonymous").map((route) => route.pattern);
  return anonymous.includes(path) ? "anonymous" : "owner";
}

// ---------------------------------------------------------------------------------------------------------------
// Cells and filters

export type PlanEnv = Readonly<Record<string, string | undefined>>;

function parseList<T extends string>(
  name: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback: readonly T[],
): readonly T[] {
  const text = (raw ?? "").trim();
  if (text === "") return fallback;
  if (text === "all") return allowed;
  const wanted: T[] = [];
  for (const piece of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const match = allowed.find((value) => value === piece);
    if (match === undefined) {
      throw new Error(`${name}: unknown value "${piece}" (allowed: ${allowed.join(", ")}, or all)`);
    }
    if (!wanted.includes(match)) wanted.push(match);
  }
  return wanted;
}

function parseShard(raw: string | undefined): { index: number; total: number } | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  const match = /^(\d+)\/(\d+)$/.exec(text);
  const index = match ? Number(match[1]) : 0;
  const total = match ? Number(match[2]) : 0;
  if (!match || index < 1 || total < 1 || index > total) {
    throw new Error(`A11Y_SHARD: "${text}" is not i/n with 1 <= i <= n`);
  }
  return { index, total };
}

function routeMatches(route: string, prefixes: readonly string[]): boolean {
  if (prefixes.length === 0) return true;
  return prefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

/**
 * The cells to run for these concrete routes, honouring A11Y_LOCALES, A11Y_THEMES, A11Y_VIEWPORTS, A11Y_MODES
 * (default: normal; "all" = every mode), A11Y_ONLY (route prefixes, whole segments) and A11Y_SHARD=i/n (the i-th of
 * n slices, taken by position so the slices cover every cell exactly once). A mistyped value throws.
 */
export function cells(env: PlanEnv, routes: readonly string[]): Cell[] {
  const locales = parseList("A11Y_LOCALES", env.A11Y_LOCALES, LOCALES, LOCALES);
  const themes = parseList("A11Y_THEMES", env.A11Y_THEMES, THEMES, THEMES);
  const viewports = parseList("A11Y_VIEWPORTS", env.A11Y_VIEWPORTS, VIEWPORT_NAMES, VIEWPORT_NAMES);
  const modes = parseList("A11Y_MODES", env.A11Y_MODES, MODES, DEFAULT_MODES);
  const only = (env.A11Y_ONLY ?? "")
    .split(",")
    .map((p) => p.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const shard = parseShard(env.A11Y_SHARD);

  const all: Cell[] = [];
  for (const route of routes) {
    if (!routeMatches(route, only)) continue;
    for (const mode of MODES) {
      if (!modes.includes(mode)) continue;
      const plan = MODE_PLAN[mode];
      for (const locale of locales) {
        for (const theme of plan.themes) {
          if (!themes.includes(theme)) continue;
          for (const viewport of plan.viewports) {
            if (!viewports.includes(viewport)) continue;
            all.push({ route, locale, theme, viewport, mode });
          }
        }
      }
    }
  }
  if (!shard) return all;
  return all.filter((_, position) => position % shard.total === shard.index - 1);
}

export function cellId(cell: Cell): string {
  return [cell.mode, cell.route, cell.locale, cell.theme, cell.viewport].join("|");
}

export function countByMode(list: readonly Cell[]): Record<Mode, number> {
  const counts: Record<Mode, number> = {
    normal: 0,
    reflow320: 0,
    text200: 0,
    spacing: 0,
    forced: 0,
    reducedMotion: 0,
    keyboard: 0,
  };
  for (const cell of list) counts[cell.mode] += 1;
  return counts;
}

export function isReportOnly(env: PlanEnv): boolean {
  return env.A11Y_REPORT_ONLY === "1";
}

export const DEFAULT_RESULTS_PATH = "audit/waves/W3-H2-results.jsonl";

// ---------------------------------------------------------------------------------------------------------------
// Mode setup and the theme/locale state the product reads

export type ModeSetup = {
  css: string;
  forcedColors: "none" | "active";
  reducedMotion: "no-preference" | "reduce";
};

export function modeSetup(mode: Mode, locale: Locale): ModeSetup {
  let css = "";
  if (mode === "text200") css = "html{font-size:200% !important}";
  if (mode === "spacing") {
    // WCAG 1.4.12 values. Letter-spacing is left out for Arabic: joined script does not take it, and the criterion exempts it.
    const letter = locale === "ar" ? "" : "letter-spacing:0.12em !important;";
    css = `*{line-height:1.5 !important;word-spacing:0.16em !important;${letter}}p{margin-bottom:2em !important}`;
  }
  return {
    css,
    forcedColors: mode === "forced" ? "active" : "none",
    reducedMotion: mode === "reducedMotion" ? "reduce" : "no-preference",
  };
}

/** Cookie and localStorage names the product reads (the same ones audit/waves/tools/shots.cjs sets). */
export function themeStorage(theme: Theme, locale: Locale): Record<string, string> {
  return {
    "sahelflow-theme": theme,
    "sahelflow-theme-preset": "carnet",
    "sahelflow-look": "2",
    "sahelflow-locale": locale,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Verdict, result lines, resume, summary, compare

export type Build = "dev" | "prod" | "unknown";
export type Status = "pass" | "fail" | "skip";

export type ViolationSummary = {
  rule: string;
  impact: string | null;
  nodes: number;
  target: string;
  help: string;
};

export type Outcome = {
  status: Status;
  build: Build;
  violations: ViolationSummary[];
  failures: string[];
  at: string;
};

export type ResultRecord = Cell & Outcome & { cellId: string };

const MAX_TARGET_CHARS = 160;

export function summarizeViolations(violations: ReadonlyArray<AxeViolation>): ViolationSummary[] {
  return violations.map((violation) => {
    const first = violation.nodes[0];
    return {
      rule: violation.id,
      impact: violation.impact ?? null,
      nodes: violation.nodes.length,
      target: first ? first.target.flat().join(" >>> ").slice(0, MAX_TARGET_CHARS) : "",
      help: violation.help,
    };
  });
}

export type Verdict = { status: "pass" | "fail"; shouldThrow: boolean; message: string };

export function cellVerdict(input: {
  cell: Cell;
  violations: ReadonlyArray<AxeViolation>;
  failures: readonly string[];
  reportOnly: boolean;
  settled: boolean;
}): Verdict {
  const { cell, violations, failures, reportOnly, settled } = input;
  if (violations.length === 0 && failures.length === 0) {
    return { status: "pass", shouldThrow: false, message: "" };
  }
  const lines = [
    `a11y matrix cell ${cellId(cell)} failed (route ${cell.route}, locale ${cell.locale}, theme ${cell.theme}, viewport ${cell.viewport}, mode ${cell.mode})`,
  ];
  for (const failure of failures) lines.push(`check: ${failure}`);
  if (violations.length > 0) lines.push(formatAxeViolations(violations));
  if (!settled) lines.push("(the page was still animating when axe ran; a faint element may only be mid-fade)");
  return { status: "fail", shouldThrow: !reportOnly, message: lines.join("\n") };
}

export function resultLine(cell: Cell, outcome: Outcome): string {
  return JSON.stringify({
    cellId: cellId(cell),
    route: cell.route,
    locale: cell.locale,
    theme: cell.theme,
    viewport: cell.viewport,
    mode: cell.mode,
    status: outcome.status,
    build: outcome.build,
    violations: outcome.violations,
    failures: outcome.failures,
    at: outcome.at,
  });
}

const STATUSES: readonly string[] = ["pass", "fail", "skip"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a results file; blank, half-written and foreign lines are skipped (a run cut off mid-write must still resume). */
export function parseResultLines(text: string): ResultRecord[] {
  const records: ResultRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (typeof parsed.cellId !== "string" || typeof parsed.status !== "string" || !STATUSES.includes(parsed.status)) continue;
    records.push({
      cellId: parsed.cellId,
      route: String(parsed.route ?? ""),
      locale: parsed.locale as Locale,
      theme: parsed.theme as Theme,
      viewport: parsed.viewport as ViewportName,
      mode: parsed.mode as Mode,
      status: parsed.status as Status,
      build: (parsed.build as Build | undefined) ?? "unknown",
      violations: Array.isArray(parsed.violations) ? (parsed.violations as ViolationSummary[]) : [],
      failures: Array.isArray(parsed.failures) ? (parsed.failures as string[]) : [],
      at: String(parsed.at ?? ""),
    });
  }
  return records;
}

function latestByCell(records: readonly ResultRecord[]): Map<string, ResultRecord> {
  const latest = new Map<string, ResultRecord>();
  for (const record of records) latest.set(record.cellId, record);
  return latest;
}

/** Cells whose LATEST record on this build is a pass. A failed, skipped or other-build record is never a pass. */
export function passedCellIds(records: readonly ResultRecord[], build: Build): Set<string> {
  const passed = new Set<string>();
  for (const [id, record] of latestByCell(records.filter((r) => r.build === build))) {
    if (record.status === "pass") passed.add(id);
  }
  return passed;
}

export type Summary = {
  run: number;
  passed: number;
  failed: number;
  skipped: number;
  byRule: Record<string, number>;
  byRoute: Record<string, number>;
};

export function summarize(records: readonly ResultRecord[]): Summary {
  const summary: Summary = { run: 0, passed: 0, failed: 0, skipped: 0, byRule: {}, byRoute: {} };
  for (const record of latestByCell(records).values()) {
    summary.run += 1;
    if (record.status === "pass") summary.passed += 1;
    else if (record.status === "skip") summary.skipped += 1;
    else {
      summary.failed += 1;
      summary.byRoute[record.route] = (summary.byRoute[record.route] ?? 0) + 1;
      for (const rule of new Set(record.violations.map((v) => v.rule))) {
        summary.byRule[rule] = (summary.byRule[rule] ?? 0) + 1;
      }
    }
  }
  return summary;
}

export function formatSummary(summary: Summary): string {
  const sorted = (counts: Record<string, number>): string[] =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => `  ${name} ${count}`);
  return [
    `cells ${summary.run}, passed ${summary.passed}, failed ${summary.failed}, skipped ${summary.skipped}`,
    "failed cells by rule:",
    ...sorted(summary.byRule),
    "failed cells by route:",
    ...sorted(summary.byRoute),
  ].join("\n");
}

export type RunComparison = {
  newFailures: string[];
  fixed: string[];
  stillFailing: string[];
  newViolations: Array<{ cellId: string; rule: string }>;
};

/** What changed between two result files of the same matrix (latest record per cell on each side). */
export function compareRuns(before: readonly ResultRecord[], after: readonly ResultRecord[]): RunComparison {
  const was = latestByCell(before);
  const now = latestByCell(after);
  const comparison: RunComparison = { newFailures: [], fixed: [], stillFailing: [], newViolations: [] };
  for (const [id, record] of now) {
    const previous = was.get(id);
    if (record.status === "fail") {
      if (previous?.status === "fail") comparison.stillFailing.push(id);
      else comparison.newFailures.push(id);
      const known = new Set((previous?.violations ?? []).map((v) => v.rule));
      for (const rule of new Set(record.violations.map((v) => v.rule))) {
        if (!known.has(rule)) comparison.newViolations.push({ cellId: id, rule });
      }
    } else if (record.status === "pass" && previous?.status === "fail") {
      comparison.fixed.push(id);
    }
  }
  return comparison;
}

/** dev or prod: A11Y_BUILD decides; otherwise a `next dev` page is recognised by its script URLs; else unknown. */
export function classifyBuild(env: PlanEnv, scriptSrcs: readonly string[]): Build {
  const raw = (env.A11Y_BUILD ?? "").trim();
  if (raw !== "") {
    if (raw === "dev" || raw === "prod") return raw;
    throw new Error(`A11Y_BUILD: "${raw}" is not dev or prod`);
  }
  const dev = scriptSrcs.some((src) => /\/_next\/static\/development\//.test(src) || /\/webpack\.js(\?|$)/.test(src));
  return dev ? "dev" : "unknown";
}
