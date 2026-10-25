import { describe, expect, it } from "vitest";
import { formatAxeViolations, type AxeViolation } from "../e2e/support/axe";

const violation = (over: Partial<AxeViolation> = {}): AxeViolation => ({
  id: "button-name",
  impact: "critical",
  help: "Buttons must have discernible text",
  helpUrl: "https://dequeuniversity.com/rules/axe/4.10/button-name?application=axeAPI",
  nodes: [
    { html: '<button class="x"></button>', target: ["main > button.x"] },
  ],
  ...over,
});

describe("formatAxeViolations", () => {
  it("returns an empty string for no violations", () => {
    expect(formatAxeViolations([])).toBe("");
  });

  it("renders rule id, impact, help URL, node html and target selector", () => {
    const text = formatAxeViolations([violation()]);
    expect(text).toContain("button-name");
    expect(text).toContain("critical");
    expect(text).toContain(
      "https://dequeuniversity.com/rules/axe/4.10/button-name?application=axeAPI",
    );
    expect(text).toContain('<button class="x"></button>');
    expect(text).toContain("main > button.x");
  });

  it("shows only the first 3 nodes and says how many there were", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      html: `<a id="n${i}"></a>`,
      target: [`#n${i}`],
    }));
    const text = formatAxeViolations([violation({ nodes })]);
    for (const shown of ["n0", "n1", "n2"]) expect(text).toContain(`#${shown}`);
    for (const hidden of ["n3", "n4"]) expect(text).not.toContain(`#${hidden}`);
    expect(text).toContain("5 elements");
  });

  it("truncates long html to 200 characters and keeps it on one line", () => {
    const html = `<div>${"a".repeat(500)}\n<b>tail</b></div>`;
    const text = formatAxeViolations([
      violation({ nodes: [{ html, target: ["div"] }] }),
    ]);
    expect(text).toContain("a".repeat(194));
    expect(text).not.toContain("a".repeat(200));
    expect(text).not.toContain("tail");
    const htmlLine = text.split("\n").find((l) => l.includes("<div>aaaa"));
    expect(htmlLine).toBeDefined();
    expect((htmlLine ?? "").trim().replace(/^html: /, "").length).toBeLessThanOrEqual(201);
  });

  it("joins iframe and shadow selector paths and numbers several violations", () => {
    const text = formatAxeViolations([
      violation({ nodes: [{ html: "<i></i>", target: [["#frame", "i.a"]] }] }),
      violation({ id: "image-alt", impact: null, nodes: [] }),
    ]);
    expect(text).toContain("#frame >>> i.a");
    expect(text).toContain("2 accessibility violations");
    expect(text).toContain("image-alt");
    expect(text).toContain("unknown");
  });
});
