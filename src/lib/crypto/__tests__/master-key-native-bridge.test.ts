import { afterEach, describe, expect, it, vi } from "vitest";

const NATIVE_ROOT_SYMBOL = Symbol.for("sahelflow.installation-root.v1");
const NATIVE_ROOT_CACHE_SYMBOL = Symbol.for(
  "sahelflow.installation-root.cache.v1",
);
const NATIVE_ROOT_SOURCE = "native-stdin-v1";
type NativeRootHolder = { [key: symbol]: unknown };

const originalSource = process.env.SF_INSTALLATION_ROOT_SOURCE;
const originalOverride = process.env.SF_MASTER_KEY;

function restoreEnvironment(): void {
  if (originalSource === undefined) {
    delete process.env.SF_INSTALLATION_ROOT_SOURCE;
  } else {
    process.env.SF_INSTALLATION_ROOT_SOURCE = originalSource;
  }
  if (originalOverride === undefined) {
    delete process.env.SF_MASTER_KEY;
  } else {
    process.env.SF_MASTER_KEY = originalOverride;
  }
}

afterEach(() => {
  const holder = globalThis as NativeRootHolder;
  delete holder[NATIVE_ROOT_SYMBOL];
  delete (process as unknown as NativeRootHolder)[NATIVE_ROOT_CACHE_SYMBOL];
  restoreEnvironment();
  vi.resetModules();
});

describe("packaged installation-root bridge", () => {
  it("shares the one consumed root across duplicated bundled module copies", async () => {
    process.env.SF_INSTALLATION_ROOT_SOURCE = NATIVE_ROOT_SOURCE;
    delete process.env.SF_MASTER_KEY;
    const root = Buffer.alloc(32, 0x5a);
    const consume = vi.fn(() => {
      delete (globalThis as NativeRootHolder)[NATIVE_ROOT_SYMBOL];
      return Buffer.from(root);
    });
    Object.defineProperty(globalThis, NATIVE_ROOT_SYMBOL, {
      configurable: true,
      enumerable: false,
      value: consume,
    });

    vi.resetModules();
    const firstModule = await import("../master-key");
    expect(firstModule.getMasterKey()).toEqual(root);

    vi.resetModules();
    const duplicateModule = await import("../master-key");
    expect(duplicateModule.getMasterKey()).toEqual(root);
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it("does not downgrade to the development override when transfer is absent", async () => {
    process.env.SF_INSTALLATION_ROOT_SOURCE = NATIVE_ROOT_SOURCE;
    process.env.SF_MASTER_KEY = "11".repeat(32);

    vi.resetModules();
    const masterKeyModule = await import("../master-key");
    expect(() => masterKeyModule.getMasterKey()).toThrow(
      /was not transferred by the native runtime/,
    );
  });
});
