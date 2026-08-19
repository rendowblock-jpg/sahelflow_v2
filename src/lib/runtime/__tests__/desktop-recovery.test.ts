import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DESKTOP_RECOVERY_RETRY_MAX_MS,
  DESKTOP_RESUME_GAP_MS,
  desktopRecoveryRetryDelayMs,
  isDesktopResumeGap,
  readRequestedLocaleCookie,
  waitForDesktopRuntimeRecovery,
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

  it("keeps recovery alive across failed health batches until the runtime returns", async () => {
    const outcomes = [false, false, true];
    let probes = 0;
    const waits: number[] = [];

    const recovered = await waitForDesktopRuntimeRecovery({
      probe: async () => outcomes[probes++] ?? false,
      wait: async (ms) => {
        waits.push(ms);
      },
    });

    expect(recovered).toBe(true);
    expect(probes).toBe(3);
    expect(waits).toEqual([2_000, 4_000]);
  });

  it("backs prolonged recovery off without ever turning it into a give-up timeout", () => {
    expect(desktopRecoveryRetryDelayMs(1)).toBe(2_000);
    expect(desktopRecoveryRetryDelayMs(3)).toBe(6_000);
    expect(desktopRecoveryRetryDelayMs(99)).toBe(DESKTOP_RECOVERY_RETRY_MAX_MS);
  });

  it("stops persistent recovery only when its owning controller is disposed", async () => {
    let cancelled = false;
    let probes = 0;

    const recovered = await waitForDesktopRuntimeRecovery({
      probe: async () => {
        probes += 1;
        return false;
      },
      wait: async () => {
        cancelled = true;
      },
      isCancelled: () => cancelled,
    });

    expect(recovered).toBe(false);
    expect(probes).toBe(1);
  });
});
