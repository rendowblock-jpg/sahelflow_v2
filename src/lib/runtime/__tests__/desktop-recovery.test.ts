import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DESKTOP_RESUME_GAP_MS,
  isDesktopResumeGap,
  readRequestedLocaleCookie,
} from "@/lib/runtime/desktop-recovery";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop resume recovery contract", () => {
  it("only treats a suspended wall-clock gap as resume", () => {
    expect(isDesktopResumeGap(1_000, 1_000 + DESKTOP_RESUME_GAP_MS - 1)).toBe(
      false,
    );
    expect(isDesktopResumeGap(1_000, 1_000 + DESKTOP_RESUME_GAP_MS)).toBe(true);
    expect(isDesktopResumeGap(1_000, 1_000 + DESKTOP_RESUME_GAP_MS * 20)).toBe(
      true,
    );
  });

  it("restores only a valid cookie-backed locale", () => {
    vi.stubGlobal("document", {
      cookie: "session=abc; sahelflow-locale=ar; theme=dark",
    });
    expect(readRequestedLocaleCookie()).toBe("ar");

    vi.stubGlobal("document", {
      cookie: "sahelflow-locale=de",
    });
    expect(readRequestedLocaleCookie()).toBeNull();
  });
});
