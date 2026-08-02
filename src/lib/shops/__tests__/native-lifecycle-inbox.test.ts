jest.mock("server-only", () => ({}));

jest.mock("@/lib/crypto/master-key", () => ({
  getMasterKey: () => Buffer.alloc(32, 9),
}));

import { nativeShopLifecycleSessionBinding } from "@/lib/shops/native-lifecycle-inbox";

describe("native shop lifecycle session binding", () => {
  it("produces a deterministic opaque binding without persisting the raw session", () => {
    const sessionId = "session-secret-001";
    const first = nativeShopLifecycleSessionBinding(sessionId);
    const second = nativeShopLifecycleSessionBinding(sessionId);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain(sessionId);
  });

  it("separates distinct authenticated sessions", () => {
    expect(nativeShopLifecycleSessionBinding("session-a")).not.toBe(
      nativeShopLifecycleSessionBinding("session-b"),
    );
  });

  it("rejects empty, padded, or unbounded session identities", () => {
    expect(() => nativeShopLifecycleSessionBinding("")).toThrow(
      "Authenticated session cannot be bound",
    );
    expect(() => nativeShopLifecycleSessionBinding(" padded ")).toThrow(
      "Authenticated session cannot be bound",
    );
    expect(() => nativeShopLifecycleSessionBinding("x".repeat(257))).toThrow(
      "Authenticated session cannot be bound",
    );
  });
});
