import { describe, expect, it } from "vitest";

import {
  decideRecordingPointerUp,
  decideSlideCancel,
  slideTransform,
  VOICE_LOCK_RISE_PX,
  VOICE_SLIDE_CANCEL_PX,
  VOICE_TAP_MAX_MS,
} from "@/components/inbox/voice-recording-gestures";

/**
 * Ledger INB-24 — WhatsApp voice recording gestures, desktop pointer truth.
 * These decisions are design law: hold-to-record, slide-up-to-lock,
 * release-to-preview, tap-to-record (existing habit + keyboard path) and
 * direction-neutral slide-to-cancel.
 */
describe("voice recording gesture decisions (INB-24)", () => {
  describe("decideRecordingPointerUp", () => {
    it("keeps the take on a quick tap so the click habit and keyboard path survive", () => {
      expect(
        decideRecordingPointerUp({ locked: false, elapsedMs: 0 }),
      ).toBe("keep");
      expect(
        decideRecordingPointerUp({ locked: false, elapsedMs: 200 }),
      ).toBe("keep");
      expect(
        decideRecordingPointerUp({ locked: false, elapsedMs: VOICE_TAP_MAX_MS - 1 }),
      ).toBe("keep");
    });

    it("finishes into the preview once the hold is real", () => {
      expect(
        decideRecordingPointerUp({ locked: false, elapsedMs: VOICE_TAP_MAX_MS }),
      ).toBe("finish");
      expect(
        decideRecordingPointerUp({ locked: false, elapsedMs: 5_000 }),
      ).toBe("finish");
    });

    it("lock wins over the release: a locked take keeps recording", () => {
      expect(decideRecordingPointerUp({ locked: true, elapsedMs: 0 })).toBe(
        "lock",
      );
      expect(
        decideRecordingPointerUp({ locked: true, elapsedMs: 60_000 }),
      ).toBe("lock");
    });
  });

  describe("decideSlideCancel", () => {
    it("cancels only past the threshold, in either physical direction", () => {
      expect(decideSlideCancel(0)).toBe(false);
      expect(decideSlideCancel(VOICE_SLIDE_CANCEL_PX - 1)).toBe(false);
      expect(decideSlideCancel(VOICE_SLIDE_CANCEL_PX)).toBe(true);
      // RTL: the mirrored drag is the same affordance.
      expect(decideSlideCancel(-VOICE_SLIDE_CANCEL_PX)).toBe(true);
      expect(decideSlideCancel(-500)).toBe(true);
    });

    it("honors a custom threshold", () => {
      expect(decideSlideCancel(20, 20)).toBe(true);
      expect(decideSlideCancel(19, 20)).toBe(false);
    });
  });

  describe("slideTransform", () => {
    it("damps the pill follow-up and clamps at the threshold", () => {
      expect(slideTransform(0)).toBe(0);
      expect(slideTransform(48)).toBe(Math.round(48 * 0.6));
      expect(slideTransform(10_000)).toBe(Math.round(VOICE_SLIDE_CANCEL_PX * 0.6));
      expect(slideTransform(-10_000)).toBe(
        -Math.round(VOICE_SLIDE_CANCEL_PX * 0.6),
      );
    });
  });

  it("ships the documented gesture constants", () => {
    expect(VOICE_LOCK_RISE_PX).toBe(48);
    expect(VOICE_SLIDE_CANCEL_PX).toBe(96);
    expect(VOICE_TAP_MAX_MS).toBe(500);
  });
});
