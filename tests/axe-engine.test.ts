/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Page } from "@playwright/test";
import { assertNoAxeViolations, runAxe } from "../e2e/support/axe";

// A stand-in for the Playwright page: it runs the helper's own addScriptTag and
// evaluate calls against this happy-dom document, so the real axe-core file and
// the real option set decide the result. Layout rules (colour contrast) need a
// browser and are not exercised here.
const page = {
  addScriptTag: async ({ content }: { content: string }) => {
    (0, eval)(content);
  },
  evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
} as unknown as Page;

const fixture = (button: string) =>
  `<main><h1>Orders</h1>${button}</main>`;

beforeEach(() => {
  document.documentElement.lang = "en";
  document.title = "Orders";
});

describe("axe check wiring (happy-dom, real axe-core 4.10.2)", () => {
  it("passes a labelled button", async () => {
    document.body.innerHTML = fixture(
      '<button type="button" aria-label="Save order"></button>',
    );
    expect(await runAxe(page)).toEqual([]);
    await expect(assertNoAxeViolations(page, "/orders (en)")).resolves.toBeUndefined();
  });

  it("fails with the rule, the element and the label when the aria-label is removed", async () => {
    document.body.innerHTML = fixture('<button type="button"></button>');
    const violations = await runAxe(page);
    expect(violations.map((v) => v.id)).toEqual(["button-name"]);
    await expect(
      assertNoAxeViolations(page, "/orders (en)"),
    ).rejects.toThrow(/\/orders \(en\)[\s\S]*button-name \(critical\)[\s\S]*<button type="button"><\/button>/);
  });
});
