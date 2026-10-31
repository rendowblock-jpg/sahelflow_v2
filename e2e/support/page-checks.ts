import type { Page } from "@playwright/test";
import { runAxe, settleMotion, type AxeViolation } from "./axe";
import {
  cellVerdict,
  summarizeViolations,
  type Cell,
  type Locale,
  type Mode,
  type ViewportName,
  type ViolationSummary,
} from "./a11y-matrix-plan";

/**
 * Page-level checks of the W3-H2 matrix, next to axe: layout facts, the keyboard tour, and the gate that turns one
 * cell into a verdict. The judging is pure (unit-tested with literal data in tests/a11y-page-checks.test.ts); the
 * code that reads the browser is thin and only collects facts.
 *
 * Adapted from the module-private helpers of e2e/phase6-7-completion.spec.ts (a CI gate file that is not touched):
 * the work-surface heading contract (waitForWorkSurface) and the dotted-translation-key scan. NOT copied:
 * assertContained and assertSemanticBasics, because axe's button-name / label / link-name / aria rules and the
 * sideways-scroll fact below cover the same ground.
 */

// ---------------------------------------------------------------------------------------------------------------
// Focus indicator, trap, keyboard tour (pure judging)

export type FocusStyle = {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
  borderColor: string;
  backgroundColor: string;
};

const px = (value: string): number => Number.parseFloat(value) || 0;
const hasOutline = (style: FocusStyle): boolean => style.outlineStyle !== "none" && px(style.outlineWidth) > 0;

/** True when focusing the element changed how it looks in a way a person can see: an outline, a ring, a border or a fill. */
export function focusIndicatorVisible(before: FocusStyle, after: FocusStyle): boolean {
  if (
    hasOutline(after) &&
    (!hasOutline(before) ||
      before.outlineColor !== after.outlineColor ||
      before.outlineStyle !== after.outlineStyle ||
      px(before.outlineWidth) !== px(after.outlineWidth))
  ) {
    return true;
  }
  if (after.boxShadow !== "none" && after.boxShadow !== before.boxShadow) return true;
  return after.borderColor !== before.borderColor || after.backgroundColor !== before.backgroundColor;
}

/** Tab presses looked at to decide a trap, and the largest loop that counts as one. */
export const TRAP_WINDOW = 24;
export const TRAP_MAX_LOOP = 3;

/** A trap: the last TRAP_WINDOW stops cycle among at most 3 elements although the page has more controls than that. */
export function isTrapped(sequence: readonly string[], totalControls: number): boolean {
  if (sequence.length < TRAP_WINDOW) return false;
  const distinct = new Set(sequence.slice(-TRAP_WINDOW)).size;
  return distinct <= TRAP_MAX_LOOP && totalControls > distinct;
}

export type TabStop = {
  key: string;
  visible: boolean;
  width: number;
  height: number;
  /** How the element looks without focus; null when it could not be measured (the indicator is then not judged). */
  before: FocusStyle | null;
  after: FocusStyle;
  /**
   * A text field that sits in a bordered frame and draws no outline of its own hands its focus cue to that frame
   * (the AI composer, the top-bar search). These are the frame's look without and with focus; null when the field has
   * a border of its own or no bordered frame sits within three parents.
   */
  beforeFrame?: FocusStyle | null;
  afterFrame?: FocusStyle | null;
};

/** True when the frame around a field changed visibly on focus (see TabStop.beforeFrame). */
export function frameIndicatorVisible(stop: Pick<TabStop, "beforeFrame" | "afterFrame">): boolean {
  return Boolean(stop.beforeFrame && stop.afterFrame && focusIndicatorVisible(stop.beforeFrame, stop.afterFrame));
}

export type DialogFacts = {
  opened: boolean;
  closedByEscape: boolean;
  focusReturnedToOpener: boolean;
};

export type TourFacts = {
  firstStopInPage: boolean;
  stops: TabStop[];
  totalControls: number;
  shiftTabBackOk: boolean;
  dialog: DialogFacts | null;
};

export function judgeKeyboardTour(facts: TourFacts): string[] {
  const failures: string[] = [];
  if (facts.stops.length === 0) {
    if (facts.totalControls > 0) failures.push(`no Tab stop at all although ${facts.totalControls} controls exist`);
  } else if (!facts.firstStopInPage) {
    failures.push("the first Tab press did not land inside the page");
  }
  for (const stop of facts.stops) {
    if (!stop.visible || stop.width <= 0 || stop.height <= 0) {
      failures.push(`Tab stop ${stop.key} is not visible`);
    } else if (stop.before !== null && !focusIndicatorVisible(stop.before, stop.after) && !frameIndicatorVisible(stop)) {
      failures.push(`Tab stop ${stop.key} has no visible focus indicator`);
    }
  }
  if (facts.stops.length >= 2 && !facts.shiftTabBackOk) {
    failures.push("Shift+Tab does not walk back to the previous stop");
  }
  const keys = facts.stops.map((stop) => stop.key);
  if (isTrapped(keys, facts.totalControls)) {
    const distinct = new Set(keys.slice(-TRAP_WINDOW)).size;
    failures.push(
      `keyboard trap: ${keys.length} Tab presses cycled among ${distinct} elements while ${facts.totalControls} controls exist`,
    );
  }
  if (facts.dialog?.opened) {
    if (!facts.dialog.closedByEscape) failures.push("Escape did not close the dialog");
    if (!facts.dialog.focusReturnedToOpener) failures.push("focus did not return to the control that opened the dialog");
  }
  return [...new Set(failures)];
}

// ---------------------------------------------------------------------------------------------------------------
// Layout facts (pure judging)

export type PageFacts = {
  htmlDir: string;
  htmlLang: string;
  innerWidth: number;
  scrollWidth: number;
  rawKeys: string[];
  mainTextLength: number;
  arabicLetterSpacing: number;
  /** Only measured in text200 mode; null = no primary action found (unknown, not a failure). */
  primaryActionReachable: boolean | null;
  forcedColorsActive: boolean;
  reducedMotionActive: boolean;
  /** Only measured in forced mode: controls left with no boundary and no visible content. */
  forcedInvisible: string[];
};

/** Sideways scroll beyond this many pixels is a failure on phone and tiny windows. */
export const SIDEWAYS_TOLERANCE_PX = 1;

export function judgePageFacts(
  facts: PageFacts,
  cell: { locale: Locale; viewport: ViewportName; mode: Mode },
): string[] {
  const failures: string[] = [];
  const expectedDir = cell.locale === "ar" ? "rtl" : "ltr";
  if (facts.htmlDir !== expectedDir) {
    failures.push(`html dir is "${facts.htmlDir}", expected "${expectedDir}" for ${cell.locale}`);
  }
  if (facts.htmlLang !== cell.locale) {
    failures.push(`html lang is "${facts.htmlLang}", expected "${cell.locale}"`);
  }
  if (facts.rawKeys.length > 0) {
    failures.push(`raw translation keys on screen: ${facts.rawKeys.slice(0, 5).join(", ")}`);
  }
  if (facts.mainTextLength < 1) failures.push("the page has no text (blank or still loading)");
  if (
    (cell.viewport === "phone" || cell.viewport === "tiny") &&
    facts.scrollWidth > facts.innerWidth + SIDEWAYS_TOLERANCE_PX
  ) {
    failures.push(`sideways scroll: content is ${facts.scrollWidth} px wide in a ${facts.innerWidth} px window`);
  }
  if (cell.locale === "ar" && facts.arabicLetterSpacing > 0) {
    failures.push(`${facts.arabicLetterSpacing} Arabic text elements carry letter-spacing`);
  }
  if (cell.mode === "text200" && facts.primaryActionReachable === false) {
    failures.push("at 200% text size the primary action is not reachable");
  }
  if (cell.mode === "forced") {
    if (!facts.forcedColorsActive) failures.push("forced colors were not active (the emulation did not apply)");
    if (facts.forcedInvisible.length > 0) {
      failures.push(
        `in forced colors ${facts.forcedInvisible.length} controls keep no boundary and no visible content: ${facts.forcedInvisible.join(", ")}`,
      );
    }
  }
  if (cell.mode === "reducedMotion" && !facts.reducedMotionActive) {
    failures.push("prefers-reduced-motion was not active (the emulation did not apply)");
  }
  return failures;
}

// ---------------------------------------------------------------------------------------------------------------
// The gate: axe (strict, no exclusions) + the checks handed in -> one verdict per cell

export type GateResult = {
  status: "pass" | "fail";
  shouldThrow: boolean;
  message: string;
  violations: ViolationSummary[];
  failures: string[];
  settled: boolean;
};

/**
 * In forced colours (Windows high contrast) the browser repaints every text and background with the user's own palette,
 * so the colours a page declares are not the colours anyone sees, and the contrast belongs to the user's palette. axe's
 * colour-contrast rule reads the declared colours: measured on the notification count pill, the browser's computed pair
 * was black on white while axe judged the declared #faf7f0 on #ffffff (1.06:1). In this mode that rule only produces
 * false findings (108 of 141 failing forced cells in the first run), so it is not applied there. Every other rule still
 * is, and in every other mode all rules are. The product sets forced-color-adjust nowhere, so nothing keeps its own colours.
 */
export function violationsForMode(violations: readonly AxeViolation[], mode: Mode): AxeViolation[] {
  return mode === "forced" ? violations.filter((violation) => violation.id !== "color-contrast") : [...violations];
}

export async function gateCell(
  page: Page,
  cell: Cell,
  options: { reportOnly: boolean; failures: readonly string[] },
): Promise<GateResult> {
  const settled = await settleMotion(page);
  const violations = violationsForMode(await runAxe(page), cell.mode);
  const verdict = cellVerdict({
    cell,
    violations,
    failures: options.failures,
    reportOnly: options.reportOnly,
    settled,
  });
  return {
    status: verdict.status,
    shouldThrow: verdict.shouldThrow,
    message: verdict.message,
    violations: summarizeViolations(violations),
    failures: [...options.failures],
    settled,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Thin browser parts: they only collect facts, the judging above decides

/**
 * Waits for hydration and for the level-one heading (the work surface). Returns the failures instead of throwing, so
 * the cell is still measured and reported: a page that never hydrates or shows no heading is itself a finding.
 */
export async function waitForWorkSurface(page: Page): Promise<string[]> {
  try {
    await page.locator('html[data-sf-hydrated="true"]').waitFor({ state: "attached", timeout: 40_000 });
  } catch {
    return ["the page did not hydrate within 40 s (html[data-sf-hydrated] never appeared)"];
  }
  try {
    await page
      .locator('#main-content h1, #main-content [role="heading"][aria-level="1"], main h1, h1')
      .first()
      .waitFor({ state: "attached", timeout: 15_000 });
  } catch {
    return ["no level-one heading appeared within 15 s"];
  }
  return [];
}

export async function collectPageFacts(page: Page, mode: Mode): Promise<PageFacts> {
  return page.evaluate((currentMode: string): PageFacts => {
    const de = document.documentElement;
    const visible = (el: Element): boolean => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none";
    };
    const keyPattern = /^[a-z][a-zA-Z0-9]+(\.[a-zA-Z][a-zA-Z0-9_-]+){1,4}$/;
    const notKey = /\.(com|dz|org|net|png|jpg|pdf|csv|xlsx|json|ts|js)$/i;
    const rawKeys = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let letterSpacing = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const text = (node.textContent ?? "").trim();
      if (!parent || text === "" || parent.closest("script,style,noscript,code,kbd,pre")) continue;
      if (!visible(parent)) continue;
      if (keyPattern.test(text) && !notKey.test(text)) rawKeys.add(text.slice(0, 60));
      if (/[\u0600-\u06FF]/.test(text)) {
        const spacing = getComputedStyle(parent).letterSpacing;
        if (spacing !== "normal" && Number.parseFloat(spacing) !== 0) letterSpacing += 1;
      }
    }

    let primaryActionReachable: boolean | null = null;
    if (currentMode === "text200") {
      const primary = Array.from(
        document.querySelectorAll<HTMLElement>("#main-content button, #main-content a[href], main button, main a[href]"),
      ).find(visible);
      if (primary) {
        primary.scrollIntoView({ block: "nearest", inline: "nearest" });
        const rect = primary.getBoundingClientRect();
        primaryActionReachable = rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= window.innerWidth + 1;
      }
    }

    const forcedInvisible: string[] = [];
    if (currentMode === "forced") {
      const controls = document.querySelectorAll<HTMLElement>(
        "button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=combobox]",
      );
      for (const el of Array.from(controls)) {
        if (!visible(el)) continue;
        const style = getComputedStyle(el);
        const border =
          px(style.borderTopWidth) + px(style.borderRightWidth) + px(style.borderBottomWidth) + px(style.borderLeftWidth);
        const outline = style.outlineStyle !== "none" && px(style.outlineWidth) > 0;
        const content =
          (el.textContent ?? "").trim() !== "" ||
          (el instanceof HTMLInputElement && el.value.trim() !== "") ||
          el.querySelector("svg, img") !== null;
        // Not a defect: a control made invisible on purpose (a file input kept behind its own button is 1 px wide), and
        // a control with no border of its own inside a bordered frame (a text field in its bordered box): in forced
        // colours the frame keeps its border, and the frame is the control's boundary.
        const box = el.getBoundingClientRect();
        const hiddenOnPurpose = box.width <= 2 || box.height <= 2;
        let framed = false;
        for (let up = el.parentElement, hops = 0; up && hops < 3 && !framed; hops += 1, up = up.parentElement) {
          const frameStyle = getComputedStyle(up);
          framed = frameStyle.borderTopStyle !== "none" && px(frameStyle.borderTopWidth) > 0;
        }
        if (border === 0 && !outline && !content && !hiddenOnPurpose && !framed && forcedInvisible.length < 8) {
          forcedInvisible.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`);
        }
      }
    }
    function px(value: string): number {
      return Number.parseFloat(value) || 0;
    }

    return {
      htmlDir: de.getAttribute("dir") ?? "",
      htmlLang: de.getAttribute("lang") ?? "",
      innerWidth: window.innerWidth,
      scrollWidth: de.scrollWidth,
      rawKeys: Array.from(rawKeys).slice(0, 10),
      mainTextLength: (document.querySelector("main")?.textContent ?? document.body.textContent ?? "").trim().length,
      arabicLetterSpacing: letterSpacing,
      primaryActionReachable,
      forcedColorsActive: matchMedia("(forced-colors: active)").matches,
      reducedMotionActive: matchMedia("(prefers-reduced-motion: reduce)").matches,
      forcedInvisible,
    };
  }, mode);
}

type StopSnapshot =
  | { overlay: true }
  | { overlay: false; key: string; visible: boolean; width: number; height: number; style: FocusStyle; frame: FocusStyle | null }
  | null;

/** Next.js draws its development error overlay as this element. It does not exist in a production build and is not part of the page. */
const DEV_OVERLAY_TAG = "nextjs-portal";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"]:not([aria-disabled="true"])';

/** Up to `maxTabs` Tab presses on the settled page, then Shift+Tab, then the dialog step where the page has a dialog trigger. */
export async function runKeyboardTour(page: Page, maxTabs = 60): Promise<TourFacts> {
  const totalControls = await page.evaluate((selector: string) => {
    return Array.from(document.querySelectorAll(selector)).filter((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }).length;
  }, FOCUSABLE_SELECTOR);

  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });

  // The two in-page readers below look at an element the same way: its own focus-relevant style, and, when the element
  // has no border of its own, the style of the bordered frame within three parents (a field whose frame draws the cue).
  // The helper is written out in both on purpose: page.evaluate serialises a function, and eval() inside the page would
  // be blocked by a strict Content-Security-Policy.
  const snapshot = (): Promise<StopSnapshot> =>
    page.evaluate((overlayTag: string): StopSnapshot => {
      const px = (value: string) => Number.parseFloat(value) || 0;
      const styleOf = (node: Element): FocusStyle => {
        const cs = getComputedStyle(node);
        return {
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor,
          boxShadow: cs.boxShadow,
          borderColor: cs.borderTopColor,
          backgroundColor: cs.backgroundColor,
        };
      };
      const frameOf = (node: Element): Element | null => {
        if (px(getComputedStyle(node).borderTopWidth) > 0) return null;
        let up = node.parentElement;
        for (let hops = 0; up && hops < 3; hops += 1, up = up.parentElement) {
          const cs = getComputedStyle(up);
          if (cs.borderTopStyle !== "none" && px(cs.borderTopWidth) > 0) return up;
        }
        return null;
      };
      const holder = window as unknown as {
        __a11yIds?: WeakMap<Element, number>;
        __a11yCount?: number;
        __a11yLast?: Element;
        __a11yLastFrame?: Element | null;
      };
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      if (el.tagName.toLowerCase() === overlayTag) return { overlay: true };
      const ids = (holder.__a11yIds ??= new WeakMap<Element, number>());
      if (!ids.has(el)) {
        holder.__a11yCount = (holder.__a11yCount ?? 0) + 1;
        ids.set(el, holder.__a11yCount);
      }
      holder.__a11yLast = el;
      const frame = frameOf(el);
      holder.__a11yLastFrame = frame;
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      const rect = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        overlay: false,
        key: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}@${ids.get(el) ?? 0}`,
        visible: cs.visibility !== "hidden" && cs.display !== "none",
        width: rect.width,
        height: rect.height,
        style: styleOf(el),
        frame: frame ? styleOf(frame) : null,
      };
    }, DEV_OVERLAY_TAG);

  const lastStyle = (): Promise<{ style: FocusStyle; frame: FocusStyle | null } | null> =>
    page.evaluate(() => {
      const styleOf = (node: Element): FocusStyle => {
        const cs = getComputedStyle(node);
        return {
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor,
          boxShadow: cs.boxShadow,
          borderColor: cs.borderTopColor,
          backgroundColor: cs.backgroundColor,
        };
      };
      const holder = window as unknown as { __a11yLast?: Element; __a11yLastFrame?: Element | null };
      const el = holder.__a11yLast;
      if (!el) return null;
      return { style: styleOf(el), frame: holder.__a11yLastFrame ? styleOf(holder.__a11yLastFrame) : null };
    });

  const stops: TabStop[] = [];
  let firstStopInPage = false;
  let endedOnOverlay = false;
  for (let press = 0; press < maxTabs; press += 1) {
    await page.keyboard.press("Tab");
    // The previous stop is unfocused now: how it looks without focus is the "before" of that stop.
    const unfocused = await lastStyle();
    const now = await snapshot();
    if (press === 0) firstStopInPage = now !== null && !now.overlay;
    const previous = stops[stops.length - 1];
    if (now !== null && now.overlay) {
      // The Tab order has reached the development overlay: the page itself is finished. Not a stop, and the
      // overlay's own shadow-DOM controls must not be walked.
      if (previous && unfocused) {
        previous.before = unfocused.style;
        previous.beforeFrame = unfocused.frame;
      }
      endedOnOverlay = true;
      break;
    }
    if (now === null) break;
    if (previous && unfocused && previous.key !== now.key) {
      previous.before = unfocused.style;
      previous.beforeFrame = unfocused.frame;
    }
    stops.push({
      key: now.key,
      visible: now.visible,
      width: now.width,
      height: now.height,
      before: null,
      after: now.style,
      beforeFrame: null,
      afterFrame: now.frame,
    });
  }

  // Shift+Tab must walk back. From the last page stop it goes to the stop before it; from the development overlay it
  // goes to the last page stop. It also unfocuses the last stop, which gives that stop its "before" look. A single-stop
  // page cannot be measured that way and its indicator is not judged.
  let shiftTabBackOk = true;
  if (stops.length >= 1) {
    await page.keyboard.press("Shift+Tab");
    const unfocusedLast = await lastStyle();
    const back = await snapshot();
    const last = stops[stops.length - 1];
    const backKey = back !== null && !back.overlay ? back.key : null;
    if (last && backKey !== null && unfocusedLast && backKey !== last.key) {
      last.before = unfocusedLast.style;
      last.beforeFrame = unfocusedLast.frame;
    }
    const expected = endedOnOverlay ? last : stops[stops.length - 2];
    if (endedOnOverlay || stops.length >= 2) shiftTabBackOk = backKey !== null && expected !== undefined && backKey === expected.key;
  }

  const dialog = await runDialogStep(page);
  return { firstStopInPage, stops, totalControls, shiftTabBackOk, dialog };
}

async function runDialogStep(page: Page): Promise<DialogFacts | null> {
  const opener = page.locator('[aria-haspopup="dialog"]:visible').first();
  if ((await opener.count()) === 0) return null;
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.locator('[role="dialog"]:visible, dialog[open]').first();
  const opened = await dialog
    .waitFor({ state: "visible", timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  if (!opened) return { opened: false, closedByEscape: false, focusReturnedToOpener: false };
  await page.keyboard.press("Escape");
  const closedByEscape = await dialog
    .waitFor({ state: "hidden", timeout: 1_500 })
    .then(() => true)
    .catch(() => false);
  const handle = await opener.elementHandle();
  const focusReturnedToOpener = handle
    ? await page.evaluate((el) => document.activeElement === el, handle)
    : false;
  return { opened, closedByEscape, focusReturnedToOpener };
}
