// W3b SEC2: the strict HTML reader must stay strict (positive controls) and must not be fooled by a long, escaped value.
import { describe, expect, it } from "vitest";
import { violations } from "./sec-html-check";

describe("sec-html-check positive controls", () => {
  it("a raw hostile tag and a javascript: link are still reported", () => {
    expect(violations("<p><img src=x onerror=1></p>").length).toBeGreaterThan(0);
    expect(violations('<p><a href="javascript:x">y</a></p>')).toContain("href is not tel:digits: javascript:x");
    expect(violations("<p>a<script>1</script></p>").some((v) => v.includes("allowlist"))).toBe(true);
    expect(violations('<button onclick="1">x</button>')).toContain("attribute not in the allowlist: onclick");
    expect(violations("<p>x > y</p>").some((v) => v.includes("raw angle bracket"))).toBe(true);
  });
  it("a 100,000-character escaped value in an attribute is accepted, and a hostile attribute after it is still reported", () => {
    const long = "A".repeat(100_000);
    expect(violations(`<li data-id="${long}" id="${long}"><span>x</span></li>`)).toEqual([]);
    expect(violations(`<li data-id="${long}" onclick="1"><span>x</span></li>`)).toContain("attribute not in the allowlist: onclick");
    expect(violations(`<li data-id="${long}"><img src=x onerror=1></li>`).length).toBeGreaterThan(0);
  });
  it("a raw > inside an attribute value and an unterminated tag are reported", () => {
    expect(violations('<li data-id="a>b">x</li>').length).toBeGreaterThan(0);
    expect(violations("<li data-id=\"a\"").length).toBeGreaterThan(0);
  });
  it("a bidi override straight inside a span is reported, inside bdi it is not", () => {
    expect(violations("<span>\u202Eevil</span>").length).toBe(1);
    expect(violations("<bdi>\u202Eevil</bdi>")).toEqual([]);
  });
});
