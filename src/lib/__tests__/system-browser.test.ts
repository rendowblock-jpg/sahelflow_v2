/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { openInSystemBrowser } from "../system-browser";

const HOSTS = ["auth.openai.com", "chatgpt.com"] as const;

describe("openInSystemBrowser", () => {
  afterEach(() => vi.restoreAllMocks());

  it("opens an https address of an allowed host in a new, unlinked window (the shell sends it to the system browser)", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    expect(openInSystemBrowser("https://auth.openai.com/api/accounts/authorize?state=abc", HOSTS)).toBe(true);
    expect(open).toHaveBeenCalledWith("https://auth.openai.com/api/accounts/authorize?state=abc", "_blank", "noopener,noreferrer");
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
    expect(openInSystemBrowser(url, HOSTS)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
