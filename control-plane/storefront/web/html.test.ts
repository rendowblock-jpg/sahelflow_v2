import { describe, expect, it } from "vitest";

import { escapeHtml, jsonForScript } from "./html";

describe("escapeHtml", () => {
  it("escapes the five characters that can break out of text or a quoted attribute", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("leaves Arabic and accented text alone", () => {
    expect(escapeHtml("متجر الساحل - Décoratif")).toBe("متجر الساحل - Décoratif");
  });
});

describe("jsonForScript", () => {
  it("cannot close the script element or start a comment", () => {
    const out = jsonForScript({ a: "</script><script>alert(1)</script>", b: "<!--", c: "&", d: "\u2028\u2029" });
    expect(out).not.toMatch(/<|>|&/);
    expect(out).not.toContain("\u2028");
    expect(out).not.toContain("\u2029");
  });

  it("round-trips the original value", () => {
    const value = { a: "</script>", n: [1, 2, { x: "é<>&" }] };
    expect(JSON.parse(jsonForScript(value))).toEqual(value);
  });
});
