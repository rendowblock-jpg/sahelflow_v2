/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { openInSystemBrowser } from "../system-browser";

const HOSTS = ["auth.openai.com", "chatgpt.com"] as const;

describe("openInSystemBrowser", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clicks a real <a target=_blank> inside the page body, because the desktop shell's link catcher only sees clicks on anchors (it never sees window.open)", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const seen: Array<{ href: string; target: string; rel: string; inBody: boolean; tag: string }> = [];
    // Same place and same test the shell plugin uses: one click listener on <body>, looking for an <a> with target=_blank.
    const catcher = (event: Event) => {
      const anchor = (event.target as HTMLElement).closest("a");
      seen.push({
        href: anchor?.href ?? "",
        target: anchor?.target ?? "",
        rel: anchor?.rel ?? "",
        inBody: Boolean(anchor && document.body.contains(anchor)),
        tag: anchor?.tagName ?? "",
      });
      event.preventDefault();
    };
    document.body.addEventListener("click", catcher);
    try {
      expect(openInSystemBrowser("https://auth.openai.com/api/accounts/authorize?state=abc", HOSTS)).toBe(true);
    } finally {
      document.body.removeEventListener("click", catcher);
    }
    expect(seen).toEqual([
      {
        href: "https://auth.openai.com/api/accounts/authorize?state=abc",
        target: "_blank",
        rel: "noopener noreferrer",
        inBody: true,
        tag: "A",
      },
    ]);
    expect(open).not.toHaveBeenCalled();
    // Nothing is left behind in the page.
    expect(document.querySelectorAll("a[target=_blank]")).toHaveLength(0);
  });

  it("still opens the address (and removes the helper link) when nothing listens for the click", () => {
    expect(openInSystemBrowser("https://chatgpt.com/", HOSTS)).toBe(true);
    expect(document.querySelectorAll("a[target=_blank]")).toHaveLength(0);
  });

  it.each([
    "http://auth.openai.com/x",
    "javascript:alert(1)",
    "file:///C:/Windows/win.ini",
    "https://user:pass@auth.openai.com/x",
    "https://auth.openai.com.evil.example/x",
    "https://evil.example/x",
    "not a url",
    "",
  ])("refuses %j and opens nothing", (url) => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const clicks = vi.fn();
    document.body.addEventListener("click", clicks);
    try {
      expect(openInSystemBrowser(url, HOSTS)).toBe(false);
    } finally {
      document.body.removeEventListener("click", clicks);
    }
    expect(open).not.toHaveBeenCalled();
    expect(clicks).not.toHaveBeenCalled();
  });
});
