/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { AXE_RUN_OPTIONS, AXE_TAGS } from "../e2e/support/axe";
import type { Cell } from "../e2e/support/a11y-matrix-plan";
import { gateCell } from "../e2e/support/page-checks";

// Same stand-in as tests/axe-engine.test.ts: the gate's own addScriptTag / evaluate calls run against this happy-dom
// document, so the real axe-core and the real option set decide. This is the self-test that the matrix gate FAILS on an
// injected violation and passes the repaired page (the browser itself is not needed for that).
function makePage(): Page {
  return {
    waitForFunction: async () => undefined,
    addScriptTag: async ({ content }: { content: string }) => {
      (0, eval)(content);
    },
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
  } as unknown as Page;
}

const cell: Cell = { route: "/orders", locale: "en", theme: "dark", viewport: "phone", mode: "normal" };

const render = (button: string) => {
  document.documentElement.lang = "en";
  document.title = "Orders";
  document.body.innerHTML = `<main><h1>Orders</h1>${button}</main>`;
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the axe options the matrix relies on", () => {
  it("keeps all six tags", () => {
    expect([...AXE_TAGS]).toEqual(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]);
  });

  it("runs exactly those tags, reports only violations, and excludes nothing", () => {
    expect(Object.keys(AXE_RUN_OPTIONS).sort()).toEqual(["resultTypes", "runOnly"]);
    expect(AXE_RUN_OPTIONS.runOnly).toEqual({
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
    });
    const text = JSON.stringify(AXE_RUN_OPTIONS);
    for (const word of ["exclude", "include", "disableRules", "rules"]) expect(text).not.toContain(word);
  });
});

describe("gateCell on an injected violation (self-test of the gate)", () => {
  it("fails strict on an unlabelled button and names the rule, the route and the cell", async () => {
    render("<button></button>");
    const result = await gateCell(makePage(), cell, { reportOnly: false, failures: [] });
    expect(result.status).toBe("fail");
    expect(result.shouldThrow).toBe(true);
    expect(result.violations.map((v) => v.rule)).toContain("button-name");
    expect(result.message).toContain("button-name");
    expect(result.message).toContain("/orders");
    expect(result.message).toContain("dark");
    expect(result.message).toContain("phone");
  });

  it("report-only records the same failure without throwing", async () => {
    render("<button></button>");
    const result = await gateCell(makePage(), cell, { reportOnly: true, failures: [] });
    expect(result.status).toBe("fail");
    expect(result.shouldThrow).toBe(false);
    expect(result.violations.map((v) => v.rule)).toContain("button-name");
  });

  it("passes the repaired page", async () => {
    render('<button type="button">Save</button>');
    const result = await gateCell(makePage(), cell, { reportOnly: false, failures: [] });
    expect(result).toMatchObject({ status: "pass", shouldThrow: false, message: "", violations: [], settled: true });
  });

  it("fails on a layout-check failure handed in, even when axe is clean", async () => {
    render('<button type="button">Save</button>');
    const result = await gateCell(makePage(), cell, { reportOnly: false, failures: ["sideways scroll: content is 412 px wide in a 390 px window"] });
    expect(result.status).toBe("fail");
    expect(result.shouldThrow).toBe(true);
    expect(result.message).toContain("sideways scroll");
  });
});
