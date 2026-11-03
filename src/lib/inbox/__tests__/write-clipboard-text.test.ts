/**
 * @vitest-environment happy-dom
 */
// F-0027 round 2. Clipboard write for "Copy details": navigator.clipboard first,
// a hidden textarea + execCommand("copy") as the fallback, false only when both
// refuse so the UI can say so. Real code: the helper. Stand-ins: navigator.clipboard
// and document.execCommand (happy-dom has neither working). NOT covered: a real
// WebView2 clipboard.
import { afterEach, describe, expect, it, vi } from "vitest";

import { writeClipboardText } from "@/lib/inbox/write-clipboard-text";

const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, "clipboard", original);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("writeClipboardText", () => {
  it("uses navigator.clipboard when it works and touches no textarea", async () => {
    const writeText = vi.fn(async () => undefined);
    setClipboard({ writeText });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    await expect(writeClipboardText("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls back to a textarea when navigator.clipboard is missing, and cleans up", async () => {
    setClipboard(undefined);
    let copied = "";
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn((command: string) => {
        copied = (document.querySelector("textarea") as HTMLTextAreaElement).value;
        return command === "copy";
      }),
    });
    await expect(writeClipboardText("line 1\nline 2")).resolves.toBe(true);
    expect(copied).toBe("line 1\nline 2");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to the textarea when navigator.clipboard rejects", async () => {
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new DOMException("denied", "NotAllowedError"))) });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: exec });
    await expect(writeClipboardText("x")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("returns false when both ways refuse", async () => {
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error("no"))) });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => false) });
    await expect(writeClipboardText("x")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("returns false (never throws) when the fallback itself throws", async () => {
    setClipboard(undefined);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("boom");
      }),
    });
    await expect(writeClipboardText("x")).resolves.toBe(false);
  });
});
