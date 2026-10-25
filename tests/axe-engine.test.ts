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
// waitForFunction is how the helper waits for finite CSS animations to end before axe measures (PR #620); happy-dom
// has no animations, so the stand-in answers at once. Tests that need another answer build their own page.
const calls: string[] = [];
function makePage(waitForFunction: () => Promise<unknown> = async () => undefined): Page {
  return {
    waitForFunction: async () => {
      calls.push("settle");
      return waitForFunction();
    },
    addScriptTag: async ({ content }: { content: string }) => {
      calls.push("axe-loaded");
      (0, eval)(content);
    },
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
  } as unknown as Page;
}
const page = makePage();

const fixture = (button: string) =>
  `<main><h1>Orders</h1>${button}</main>`;

beforeEach(() => {
  calls.length = 0;
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

describe("axe waits for the page to settle (PR #620: a card still fading in measured as low contrast)", () => {
  const labelled = '<button type="button" aria-label="Save order"></button>';
  const unlabelled = '<button type="button"></button>';
  const timeout = () => Object.assign(new Error("page.waitForFunction: Timeout 5000ms exceeded."), { name: "TimeoutError" });

  it("lets the finite animations end first, then measures", async () => {
    document.body.innerHTML = fixture(labelled);
    await assertNoAxeViolations(page, "/analytics (ar)");
    expect(calls.slice(0, 2)).toEqual(["settle", "axe-loaded"]);
  });

  it("still measures when the motion never settles, and says so in the failure", async () => {
    document.body.innerHTML = fixture(unlabelled);
    const stuck = makePage(async () => {
      throw timeout();
    });
    await expect(assertNoAxeViolations(stuck, "/analytics (ar)")).rejects.toThrow(
      /button-name \(critical\)[\s\S]*still animating after 5000 ms/,
    );
  });

  it("passes a page that has no violation even if the motion never settled", async () => {
    document.body.innerHTML = fixture(labelled);
    const stuck = makePage(async () => {
      throw timeout();
    });
    await expect(assertNoAxeViolations(stuck, "/analytics (ar)")).resolves.toBeUndefined();
  });

  it("does not hide a real failure of the wait (a closed page) behind a timeout", async () => {
    document.body.innerHTML = fixture(labelled);
    const closed = makePage(async () => {
      throw new Error("Target page, context or browser has been closed");
    });
    await expect(assertNoAxeViolations(closed, "/analytics (ar)")).rejects.toThrow(/has been closed/);
  });
});
