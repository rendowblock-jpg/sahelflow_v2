import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT_HEX = "11".repeat(32);
const NATIVE_ROOT_SYMBOL = Symbol.for("sahelflow.installation-root.v1");
const NATIVE_ROOT_CACHE_SYMBOL = Symbol.for(
  "sahelflow.installation-root.cache.v1",
);

type NativeRootHolder = { [key: symbol]: unknown };

function clearAuthorityState(): void {
  delete (globalThis as NativeRootHolder)[NATIVE_ROOT_SYMBOL];
  delete (globalThis as NativeRootHolder)[NATIVE_ROOT_CACHE_SYMBOL];
  delete (process as unknown as NativeRootHolder)[NATIVE_ROOT_CACHE_SYMBOL];
  delete process.env.SF_INSTALLATION_ROOT_SOURCE;
}

describe("packaged installation-root process cache", () => {
  beforeEach(() => {
    clearAuthorityState();
    vi.resetModules();
  });

  afterEach(() => {
    clearAuthorityState();
    vi.resetModules();
  });

  it("survives a fresh compiled module realm after the one-use bridge is consumed", async () => {
    process.env.SF_INSTALLATION_ROOT_SOURCE = "native-stdin-v1";
    let consumptions = 0;
    Object.defineProperty(globalThis as NativeRootHolder, NATIVE_ROOT_SYMBOL, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: () => {
        consumptions += 1;
        return Buffer.from(ROOT_HEX, "hex");
      },
    });

    const firstModule = await import("../master-key");
    expect(firstModule.getMasterKey().toString("hex")).toBe(ROOT_HEX);
    expect(consumptions).toBe(1);
    expect(
      Buffer.isBuffer(
        (process as unknown as NativeRootHolder)[NATIVE_ROOT_CACHE_SYMBOL],
      ),
    ).toBe(true);
    expect(
      (globalThis as NativeRootHolder)[NATIVE_ROOT_CACHE_SYMBOL],
    ).toBeUndefined();

    vi.resetModules();
    const secondModule = await import("../master-key");
    expect(secondModule.getMasterKey().toString("hex")).toBe(ROOT_HEX);
    expect(consumptions).toBe(1);
  });
});
