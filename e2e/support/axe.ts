import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/**
 * axe-core accessibility check for the browser evidence sweeps.
 *
 * Strict on purpose: no rule and no element is excluded. If a rule cannot be
 * satisfied on a surface, report it and fix the surface; do not add a
 * `disableRules` or `exclude` here.
 */

// The same six tags the manual sweep used: WCAG 2.0/2.1/2.2 A and AA plus
// axe's best-practice rules.
export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
] as const;

export const AXE_RUN_OPTIONS = {
  runOnly: { type: "tag", values: [...AXE_TAGS] },
  // Only violations decide the result; skipping passes/incomplete detail keeps
  // the in-page work and the payload small.
  resultTypes: ["violations"],
};

export type AxeSelector = string | ReadonlyArray<string>;

export type AxeViolation = {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: Array<{ html: string; target: ReadonlyArray<AxeSelector> }>;
};

const MAX_NODES_SHOWN = 3;
const MAX_HTML_CHARS = 200;

let cachedSource: string | null = null;

// Read from the installed package (pinned in package.json) so CI never fetches
// a script from the network.
function axeSource(): string {
  if (cachedSource === null) {
    const resolve = createRequire(join(process.cwd(), "package.json")).resolve;
    cachedSource = readFileSync(resolve("axe-core/axe.min.js"), "utf8");
  }
  return cachedSource;
}

export function formatAxeViolations(
  violations: ReadonlyArray<AxeViolation>,
): string {
  if (violations.length === 0) return "";
  const lines: string[] = [
    `${violations.length} accessibility violation${violations.length === 1 ? "" : "s"}`,
  ];
  violations.forEach((violation, index) => {
    const count = violation.nodes.length;
    lines.push(
      `${index + 1}. ${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}`,
      `   ${violation.helpUrl}`,
      `   ${count} element${count === 1 ? "" : "s"}${count > MAX_NODES_SHOWN ? `, first ${MAX_NODES_SHOWN} shown` : ""}`,
    );
    for (const node of violation.nodes.slice(0, MAX_NODES_SHOWN)) {
      const html = node.html.replace(/\s+/g, " ").trim();
      lines.push(
        `   html: ${html.length > MAX_HTML_CHARS ? `${html.slice(0, MAX_HTML_CHARS)}…` : html}`,
        `   target: ${node.target.flat().join(" >>> ")}`,
      );
    }
  });
  return lines.join("\n");
}

export async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axeSource() });
  return page.evaluate(async (options) => {
    const axe = (
      window as unknown as {
        axe: {
          run(
            context: Document,
            options: unknown,
          ): Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    const results = await axe.run(document, options);
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        target: node.target,
      })),
    }));
  }, AXE_RUN_OPTIONS);
}

/** Longest wait for the page's finite animations to end before axe runs anyway. */
export const AXE_SETTLE_TIMEOUT_MS = 5_000;

/**
 * Waits until every finite CSS animation and transition on the page has ended.
 *
 * Why: a card that is still fading in is faint for a moment, and axe measures
 * the colour it has at that instant. The product's stagger-grid fades each
 * card in over 0.5 s after 50 ms x its position, so the fourth KPI card of
 * /analytics failed color-contrast when axe happened to run early (PR #620).
 * Faint-for-a-moment is not a defect; faint-when-finished is, and that is what
 * this lets axe see. Animations that never end (spinners, shimmer) are not
 * waited for. Nothing is excluded from axe: it still runs strict afterwards.
 * Returns false when the limit passed with motion still running.
 */
export async function settleMotion(
  page: Page,
  timeoutMs: number = AXE_SETTLE_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await page.waitForFunction(
      () =>
        document.getAnimations().every((animation) => {
          const timing = animation.effect?.getComputedTiming();
          if (!timing || timing.endTime === Infinity) return true;
          // "pending" is not a playState any more (lib.dom: paused | idle | finished | running); a play that has
          // been requested but has not started yet is the separate boolean `pending`.
          return !animation.pending && animation.playState !== "running";
        }),
      undefined,
      { timeout: timeoutMs, polling: 50 },
    );
    return true;
  } catch (error) {
    // Only "the motion did not end in time" is expected here. A closed page or a broken browser must stay visible,
    // not be read as "still animating".
    if (error instanceof Error && error.name === "TimeoutError") return false;
    throw error;
  }
}

/** Longest wait for loading placeholders to be replaced by their content before axe runs anyway. */
export const AXE_LOAD_TIMEOUT_MS = 10_000;

/**
 * True when no loading placeholder is drawn on the page. A placeholder is the Skeleton primitive, anything that says it
 * is busy (`aria-busy="true"`), or a pulsing bar inside a `role="status"` region (what the profile editor shows while
 * /api/profile loads). One that sits under `display: none`, `hidden` or `inert` is not drawn and is not waited for, and
 * neither is a pulsing dot with no status region around it (a "live" indicator is not a placeholder).
 *
 * Self-contained on purpose: waitForFunction serialises it into the page, so it may not use anything outside itself.
 */
export function noLoadingPlaceholders(): boolean {
  const placeholders = document.querySelectorAll(
    '[data-slot="skeleton"], [aria-busy="true"], [role="status"] .animate-pulse',
  );
  for (const element of Array.from(placeholders)) {
    if (element.closest("[hidden], [inert]")) continue;
    let drawn = getComputedStyle(element).visibility !== "hidden";
    for (let node: Element | null = element; drawn && node; node = node.parentElement) {
      if (getComputedStyle(node).display === "none") drawn = false;
    }
    if (drawn) return false;
  }
  return true;
}

/**
 * Waits until no loading placeholder is drawn.
 *
 * Why: the Settings detail panel is a scroller. While its form is a placeholder it holds nothing a keyboard can reach,
 * and at large text it already overflows, so `scrollable-region-focusable` fires on it. Measured on 31 Oct 2026
 * (Chromium 149, 32 px browser font): that stage lasted 287 to 1022 ms in 11 loads and 5587 ms in a cold one, axe run
 * inside it flagged the panel in 12 of 12 loads, and once the form was drawn it flagged it in none. The 200% text runs
 * flagged it on a different few cells each time, whichever cell axe reached in that stage. A placeholder is not the page;
 * a page that is loaded is what must pass. Nothing is excluded from axe: it still runs strict afterwards, and a page that
 * is still loading after the limit is judged as it is, with a note in the message.
 * Returns false when the limit passed with a placeholder still drawn.
 */
export async function settleLoading(
  page: Page,
  timeoutMs: number = AXE_LOAD_TIMEOUT_MS,
): Promise<boolean> {
  try {
    await page.waitForFunction(noLoadingPlaceholders, undefined, { timeout: timeoutMs, polling: 50 });
    return true;
  } catch (error) {
    // Only "the placeholder did not go in time" is expected here. A closed page or a broken browser must stay visible.
    if (error instanceof Error && error.name === "TimeoutError") return false;
    throw error;
  }
}

export async function assertNoAxeViolations(
  page: Page,
  label: string,
): Promise<void> {
  const settled = await settleMotion(page);
  const violations = await runAxe(page);
  if (violations.length > 0) {
    const note = settled
      ? ""
      : `\n(the page was still animating after ${AXE_SETTLE_TIMEOUT_MS} ms; a faint element may only be mid-fade)`;
    throw new Error(`${label}\n${formatAxeViolations(violations)}${note}`);
  }
}
