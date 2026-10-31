import { describe, expect, it } from "vitest";

import { gateRemovals } from "@/components/storefront/studio/manager-feedback";

const off = { otpEnabled: false, turnstileEnabled: false, hasDzverifyApiKey: false, hasTurnstileSecretKey: false };
const erase = { otpEnabled: false, turnstileEnabled: false, dzverifyApiKey: "-", turnstileSecretKey: "-" };

describe("gateRemovals edges", () => {
  it("erasing a key that was never stored loses nothing", () => {
    expect(gateRemovals({ config: off, form: erase })).toEqual([]);
  });
  it("a gate that was already off and stays off loses nothing", () => {
    expect(gateRemovals({ config: off, form: { ...erase, dzverifyApiKey: "", turnstileSecretKey: "" } })).toEqual([]);
  });
  it("each stored thing that is switched off or erased is named, in order", () => {
    const stored = { otpEnabled: true, turnstileEnabled: true, hasDzverifyApiKey: true, hasTurnstileSecretKey: true };
    expect(gateRemovals({ config: stored, form: erase })).toEqual(["otp", "otpKey", "turnstile", "turnstileKey"]);
  });
  it("only the turnstile key erased: the other stored things stay", () => {
    const stored = { otpEnabled: true, turnstileEnabled: true, hasDzverifyApiKey: true, hasTurnstileSecretKey: true };
    const form = { otpEnabled: true, turnstileEnabled: true, dzverifyApiKey: "", turnstileSecretKey: "-" };
    expect(gateRemovals({ config: stored, form })).toEqual(["turnstileKey"]);
  });
});
