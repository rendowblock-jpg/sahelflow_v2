import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { publishDeviceKinds, publishToApprovedDevices } from "./remote-projection-worker";

type Kind = "dashboard" | "orders" | "conversations";
function rig(failing: Partial<Record<Kind, unknown>> = {}) {
  const calls: Kind[] = [];
  const secondary: Array<[string, unknown]> = [];
  const step = (kind: Kind) => async () => {
    calls.push(kind);
    if (kind in failing) throw failing[kind];
  };
  return {
    calls, secondary,
    input: {
      dashboard: step("dashboard"), orders: step("orders"), conversations: step("conversations"),
      onSecondaryFailure: (kind: string, error: unknown) => { secondary.push([kind, error]); },
    },
  };
}

describe("publishDeviceKinds", () => {
  it("publishes dashboard, then orders, then conversations", async () => {
    const r = rig();
    await publishDeviceKinds(r.input);
    expect(r.calls).toEqual(["dashboard", "orders", "conversations"]);
    expect(r.secondary).toEqual([]);
  });

  it("an orders failure is logged, does not throw, and conversations still runs", async () => {
    const boom = new Error("orders down");
    const r = rig({ orders: boom });
    await expect(publishDeviceKinds(r.input)).resolves.toBeUndefined();
    expect(r.calls).toEqual(["dashboard", "orders", "conversations"]);
    expect(r.secondary).toEqual([["orders", boom]]);
  });

  it("a conversations failure is logged and does not throw", async () => {
    const boom = new Error("inbox down");
    const r = rig({ conversations: boom });
    await expect(publishDeviceKinds(r.input)).resolves.toBeUndefined();
    expect(r.secondary).toEqual([["conversations", boom]]);
  });

  it("a dashboard failure throws and skips the other kinds", async () => {
    const r = rig({ dashboard: new Error("policy refused") });
    await expect(publishDeviceKinds(r.input)).rejects.toThrow("policy refused");
    expect(r.calls).toEqual(["dashboard"]);
  });
});

describe("one device failing never stops the others (all three kinds)", () => {
  it("device A's dashboard fails; device B still gets all three", async () => {
    const seen: string[] = [];
    const failed: string[] = [];
    const result = await publishToApprovedDevices({
      devices: [{ deviceId: "phone_aaaaaaaa" }, { deviceId: "phone_bbbbbbbb" }],
      approvedIds: new Set(["phone_aaaaaaaa", "phone_bbbbbbbb"]),
      publish: (device) => publishDeviceKinds({
        dashboard: async () => {
          seen.push(`${device.deviceId}:dashboard`);
          if (device.deviceId === "phone_aaaaaaaa") throw new Error("A fails");
        },
        orders: async () => { seen.push(`${device.deviceId}:orders`); },
        conversations: async () => { seen.push(`${device.deviceId}:conversations`); },
        onSecondaryFailure: () => undefined,
      }),
      onFailure: (device) => { failed.push(device.deviceId); },
    });
    expect(result).toEqual({ published: ["phone_bbbbbbbb"], skippedPending: [], failed: ["phone_aaaaaaaa"] });
    expect(failed).toEqual(["phone_aaaaaaaa"]);
    expect(seen).toEqual([
      "phone_aaaaaaaa:dashboard",
      "phone_bbbbbbbb:dashboard", "phone_bbbbbbbb:orders", "phone_bbbbbbbb:conversations",
    ]);
  });
});
