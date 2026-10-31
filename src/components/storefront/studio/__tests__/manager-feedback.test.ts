import { describe, expect, it } from "vitest";

import {
  canStartManagerAction,
  gateRemovals,
  managerFailureReason,
  managerSaveLine,
} from "@/components/storefront/studio/manager-feedback";

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key);

describe("managerSaveLine: the words beside the button", () => {
  it.each([
    [{ phase: "idle" }, "save", null],
    [{ phase: "saving" }, "save", { text: "storefront.studioStates.manager.saving", role: "status" }],
    [{ phase: "saved" }, "save", { text: "storefront.studioStates.manager.saved", role: "status" }],
    [{ phase: "saving" }, "remove", { text: "storefront.studioStates.manager.removing", role: "status" }],
    [{ phase: "saved" }, "remove", { text: "storefront.studioStates.manager.removed", role: "status" }],
    [{ phase: "saving" }, "change", { text: "storefront.studioStates.manager.updating", role: "status" }],
    [{ phase: "saved" }, "change", { text: "storefront.studioStates.manager.done", role: "status" }],
  ] as const)("%j (%s)", (state, verb, expected) => {
    expect(managerSaveLine(state, t, verb)).toEqual(expected);
  });

  it("a failure is an alert that carries its reason, per verb", () => {
    expect(managerSaveLine({ phase: "failed", reason: "no connection" }, t, "save")).toEqual({
      text: 'storefront.studioStates.save.notSaved|{"reason":"no connection"}',
      role: "alert",
    });
    expect(managerSaveLine({ phase: "failed", reason: "x" }, t, "remove")?.text).toContain("manager.notRemoved");
    expect(managerSaveLine({ phase: "failed", reason: "x" }, t, "change")?.text).toContain("manager.notDone");
  });
});

describe("canStartManagerAction: no double submit", () => {
  it.each([
    [{ canManage: true, busy: false }, true],
    [{ canManage: true, busy: true }, false],
    [{ canManage: false, busy: false }, false],
    [{ canManage: false, busy: true }, false],
  ])("%j -> %s", (input, expected) => {
    expect(canStartManagerAction(input)).toBe(expected);
  });
});

describe("managerFailureReason: never the raw server text", () => {
  it("no answer at all = no connection", () => {
    expect(managerFailureReason(null, t)).toBe("storefront.studioStates.failure.noConnection");
  });
  it("an unmapped server sentence never reaches the screen, in either wording world", () => {
    const text = managerFailureReason({ error: "PrismaClientKnownRequestError P2002 at line 4" }, t);
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("Prisma");
    expect(managerFailureReason({}, t)).toBe("storefront.studioStates.failure.serverRefused");
  });
  it("a mapped server sentence is translated", () => {
    expect(managerFailureReason({ error: "Rate limit exceeded" }, t)).toBe("error.rateLimited");
  });
});

describe("gateRemovals: what saving would switch off or erase", () => {
  const armed = { otpEnabled: true, turnstileEnabled: true, hasDzverifyApiKey: true, hasTurnstileSecretKey: true };
  const same = { otpEnabled: true, turnstileEnabled: true, dzverifyApiKey: "", turnstileSecretKey: "" };

  it("nothing changes -> nothing lost", () => {
    expect(gateRemovals({ config: armed, form: same })).toEqual([]);
  });
  it("first configuration (no stored config) can lose nothing", () => {
    expect(gateRemovals({ config: null, form: { ...same, otpEnabled: false } })).toEqual([]);
  });
  it("switching an armed gate off is a loss, switching one on is not", () => {
    expect(gateRemovals({ config: armed, form: { ...same, otpEnabled: false } })).toEqual(["otp"]);
    expect(gateRemovals({ config: armed, form: { ...same, turnstileEnabled: false } })).toEqual(["turnstile"]);
    expect(
      gateRemovals({ config: { ...armed, otpEnabled: false }, form: { ...same, otpEnabled: true } }),
    ).toEqual([]);
  });
  it('"-" erases a stored secret; it is only a loss when one is stored', () => {
    expect(gateRemovals({ config: armed, form: { ...same, dzverifyApiKey: "-" } })).toEqual(["otpKey"]);
    expect(gateRemovals({ config: armed, form: { ...same, turnstileSecretKey: "-" } })).toEqual(["turnstileKey"]);
    expect(
      gateRemovals({ config: { ...armed, hasDzverifyApiKey: false }, form: { ...same, dzverifyApiKey: "-" } }),
    ).toEqual([]);
    expect(gateRemovals({ config: armed, form: { ...same, dzverifyApiKey: "new-secret" } })).toEqual([]);
  });
  it("lists every loss, in a stable order", () => {
    expect(
      gateRemovals({
        config: armed,
        form: { otpEnabled: false, turnstileEnabled: false, dzverifyApiKey: "-", turnstileSecretKey: "-" },
      }),
    ).toEqual(["otp", "otpKey", "turnstile", "turnstileKey"]);
  });
});
