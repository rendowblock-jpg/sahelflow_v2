/**
 * @vitest-environment happy-dom
 */
/**
 * The accessibility matrix waits for loading placeholders to be replaced by their content before axe runs.
 *
 * Why: the Settings detail panel is a scroller. While its form is still a placeholder (role="status" with pulsing bars,
 * waiting on /api/profile) it holds nothing a keyboard can reach, and at large text it already overflows, so axe's
 * `scrollable-region-focusable` fires on it. Measured on 31 Oct 2026 (Chromium 149, 32 px browser font): the placeholder
 * stage lasted 287 to 1022 ms in 11 loads and 5587 ms in a cold one, axe run inside it flagged the panel in 12 of 12
 * loads, and once the form was drawn (six tabbable controls) it flagged it in none. The 200% text runs flagged it on a
 * different handful of cells each time (3, 3, 1, 1), whichever cell axe happened to reach in that stage. A placeholder
 * is not a page; the run now looks at the page after it has loaded, as it already does after the fade-in of a card.
 *
 * The predicate runs inside the page (it is serialised by waitForFunction), so it is tested here against a DOM; the
 * browser run (probe in the pull request) shows the effect on the real panel.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { AXE_LOAD_TIMEOUT_MS, noLoadingPlaceholders, settleLoading } from "../e2e/support/axe";
import { cellVerdict, type Cell } from "../e2e/support/a11y-matrix-plan";
import { gateCell } from "../e2e/support/page-checks";

const cell: Cell = { route: "/profile", locale: "ar", theme: "light", viewport: "desktop", mode: "text200" };

afterEach(() => {
  document.body.innerHTML = "";
});

const body = (html: string) => {
  document.documentElement.lang = "en";
  document.title = "Settings";
  document.body.innerHTML = `<main><h1>Settings</h1>${html}</main>`;
};

describe("noLoadingPlaceholders (runs inside the page)", () => {
  it("is true on a page that only has content", () => {
    body('<form><label for="n">Name</label><input id="n" /></form>');
    expect(noLoadingPlaceholders()).toBe(true);
  });

  it("is false while the Skeleton primitive is drawn", () => {
    body('<div data-slot="skeleton" aria-hidden="true" class="animate-pulse"></div>');
    expect(noLoadingPlaceholders()).toBe(false);
  });

  it("is false while a role=status placeholder of pulsing bars is drawn (the profile editor)", () => {
    body('<div role="status" aria-label="Loading"><span class="animate-pulse"></span><span class="animate-pulse"></span></div>');
    expect(noLoadingPlaceholders()).toBe(false);
  });

  it("is false while a region says it is busy", () => {
    body('<div aria-busy="true"><p>Updating</p></div>');
    expect(noLoadingPlaceholders()).toBe(false);
  });

  it("does not wait for a placeholder that is not drawn (display none or hidden ancestor)", () => {
    body('<div style="display:none"><div data-slot="skeleton"></div></div><div hidden><div role="status"><i class="animate-pulse"></i></div></div>');
    expect(noLoadingPlaceholders()).toBe(true);
  });

  it("does not wait for a pulsing dot that is not a placeholder (no role=status around it)", () => {
    body('<span class="animate-pulse" aria-hidden="true"></span><button type="button">Live</button>');
    expect(noLoadingPlaceholders()).toBe(true);
  });

  it("turns true as soon as the placeholder is replaced by the content", () => {
    body('<div id="slot"><div role="status"><span class="animate-pulse"></span></div></div>');
    expect(noLoadingPlaceholders()).toBe(false);
    const slot = document.getElementById("slot");
    if (!slot) throw new Error("the slot is missing");
    slot.innerHTML = '<label for="n">Name</label><input id="n" />';
    expect(noLoadingPlaceholders()).toBe(true);
  });
});

type Recorded = { kind: "wait"; source: string; timeout: number | undefined } | { kind: "axe" };

function recordingPage(failLoadingWith?: Error): { page: Page; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const page = {
    waitForFunction: async (fn: () => unknown, _arg: unknown, options?: { timeout?: number }) => {
      const source = String(fn);
      calls.push({ kind: "wait", source, timeout: options?.timeout });
      if (failLoadingWith && source.includes("skeleton")) throw failLoadingWith;
      return undefined;
    },
    addScriptTag: async ({ content }: { content: string }) => {
      calls.push({ kind: "axe" });
      (0, eval)(content);
    },
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
  } as unknown as Page;
  return { page, calls };
}

const timeoutError = () => Object.assign(new Error("Timeout 10000ms exceeded"), { name: "TimeoutError" });

describe("settleLoading", () => {
  it("waits with the loading timeout, on the placeholder predicate, and says the page loaded", async () => {
    const { page, calls } = recordingPage();
    await expect(settleLoading(page)).resolves.toBe(true);
    expect(AXE_LOAD_TIMEOUT_MS).toBe(10_000);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: "wait", timeout: AXE_LOAD_TIMEOUT_MS });
    expect((calls[0] as { source: string }).source).toContain("skeleton");
  });

  it("says the page did not finish loading when the wait times out", async () => {
    const { page } = recordingPage(timeoutError());
    await expect(settleLoading(page)).resolves.toBe(false);
  });

  it("does not hide a broken page: any other error is thrown", async () => {
    const { page } = recordingPage(new Error("Target page, context or browser has been closed"));
    await expect(settleLoading(page)).rejects.toThrow(/closed/);
  });
});

describe("gateCell and loading placeholders", () => {
  it("waits for the placeholders to go BEFORE axe runs", async () => {
    body('<button type="button">Save</button>');
    const { page, calls } = recordingPage();
    const result = await gateCell(page, cell, { reportOnly: true, failures: [] });
    const firstLoading = calls.findIndex((c) => c.kind === "wait" && c.source.includes("skeleton"));
    const axeRun = calls.findIndex((c) => c.kind === "axe");
    expect(firstLoading).toBeGreaterThanOrEqual(0);
    expect(axeRun).toBeGreaterThan(firstLoading);
    expect(result).toMatchObject({ status: "pass", loaded: true, settled: true });
  });

  it("still runs axe, and says so in the failure, when the page is still loading after the limit", async () => {
    body("<button></button>");
    const { page, calls } = recordingPage(timeoutError());
    const result = await gateCell(page, cell, { reportOnly: true, failures: [] });
    expect(calls.some((c) => c.kind === "axe")).toBe(true);
    expect(result.loaded).toBe(false);
    expect(result.status).toBe("fail");
    expect(result.violations.map((v) => v.rule)).toContain("button-name");
    expect(result.message).toContain("loading placeholder");
  });

  it("does not turn a clean page into a failure just because it was slow to load", async () => {
    body('<button type="button">Save</button>');
    const { page } = recordingPage(timeoutError());
    const result = await gateCell(page, cell, { reportOnly: false, failures: [] });
    expect(result).toMatchObject({ status: "pass", shouldThrow: false, message: "", loaded: false });
  });
});

describe("cellVerdict note about loading", () => {
  const violations = [
    {
      id: "scrollable-region-focusable",
      impact: "serious",
      help: "Scrollable region must have keyboard access",
      helpUrl: "https://dequeuniversity.com/rules/axe/4.10/scrollable-region-focusable",
      nodes: [{ html: "<div></div>", target: ["section > div"] }],
    },
  ];
  const base = { cell, violations, failures: [], reportOnly: true, settled: true };

  it("adds the note only when the page was still loading", () => {
    expect(cellVerdict({ ...base, loaded: false }).message).toContain("loading placeholder");
    expect(cellVerdict({ ...base, loaded: true }).message).not.toContain("loading placeholder");
    expect(cellVerdict(base).message).not.toContain("loading placeholder");
  });

  it("keeps a passing cell silent", () => {
    expect(cellVerdict({ ...base, violations: [], loaded: false })).toEqual({ status: "pass", shouldThrow: false, message: "" });
  });
});
