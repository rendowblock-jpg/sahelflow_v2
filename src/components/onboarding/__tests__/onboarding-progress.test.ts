import { describe, expect, it } from "vitest";

import {
  ONBOARDING_FINISH_STEP,
  ONBOARDING_PROGRESS_SETTING_KEY,
  ONBOARDING_STEP_COUNT,
  clampOnboardingStep,
  isOnboardingFinished,
  parseOnboardingProgress,
  serializeOnboardingProgress,
} from "../onboarding-progress";

describe("onboarding checklist progress persistence (R4-b)", () => {
  it("persists through the generic settings key namespace (no reserved prefix)", () => {
    expect(ONBOARDING_PROGRESS_SETTING_KEY).toBe("onboarding_progress");
    // Reserved prefixes are auth_, active_license, active_machine_id and
    // identity_authority_ — onboarding_progress must not collide with any.
    for (const reserved of [
      "auth_",
      "active_license",
      "active_machine_id",
      "identity_authority_",
    ]) {
      expect(ONBOARDING_PROGRESS_SETTING_KEY.startsWith(reserved)).toBe(false);
    }
  });

  it("round-trips a resume point and finish timestamp", () => {
    const progress = {
      version: 1,
      lastStep: 2,
      finishedAt: "2026-08-30T10:00:00.000Z",
    } as const;
    const parsed = parseOnboardingProgress(serializeOnboardingProgress(progress));
    expect(parsed).toEqual(progress);
  });

  it("resumes a first-time seller on step 0 and never beyond the summary screen", () => {
    expect(parseOnboardingProgress(null)).toBeNull();
    expect(parseOnboardingProgress("")).toBeNull();
    const fresh = parseOnboardingProgress(
      serializeOnboardingProgress({ version: 1, lastStep: 0, finishedAt: null }),
    );
    expect(fresh?.lastStep).toBe(0);
    expect(isOnboardingFinished(fresh)).toBe(false);

    const beyond = parseOnboardingProgress(
      JSON.stringify({ version: 1, lastStep: 99, finishedAt: null }),
    );
    expect(beyond?.lastStep).toBe(ONBOARDING_FINISH_STEP);
    expect(ONBOARDING_FINISH_STEP).toBe(ONBOARDING_STEP_COUNT);
  });

  it("clamps hostile step values without throwing", () => {
    expect(clampOnboardingStep(-3)).toBe(0);
    expect(clampOnboardingStep(2.9)).toBe(2);
    expect(clampOnboardingStep(Number.NaN)).toBe(0);
    expect(clampOnboardingStep(Number.POSITIVE_INFINITY)).toBe(
      ONBOARDING_FINISH_STEP,
    );
  });

  it("degrades corrupt or foreign blobs to a fresh start instead of blocking onboarding", () => {
    for (const bad of [
      "not json",
      "42",
      JSON.stringify({ version: 2, lastStep: 1 }),
      JSON.stringify({ version: 1, lastStep: "one", finishedAt: 7 }),
      JSON.stringify([1, 2, 3]),
    ]) {
      const parsed = parseOnboardingProgress(bad);
      // Either rejected outright or normalized into a safe shape.
      if (parsed !== null) {
        expect(parsed.version).toBe(1);
        expect(typeof parsed.lastStep).toBe("number");
        expect(
          parsed.finishedAt === null || typeof parsed.finishedAt === "string",
        ).toBe(true);
      }
    }
    expect(
      parseOnboardingProgress(
        JSON.stringify({ version: 1, lastStep: 3, finishedAt: "x" }),
      ),
    ).toEqual({ version: 1, lastStep: 3, finishedAt: "x" });
  });

  it("treats an empty finishedAt as not finished on serialize", () => {
    const serialized = serializeOnboardingProgress({
      version: 1,
      lastStep: 1,
      finishedAt: "",
    });
    expect(JSON.parse(serialized)).toEqual({
      version: 1,
      lastStep: 1,
      finishedAt: null,
    });
  });
});
