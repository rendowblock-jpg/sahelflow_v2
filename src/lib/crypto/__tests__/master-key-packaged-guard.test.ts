/**
 * S01b-11: the development/test authority switches (SF_MASTER_KEY, data/master.key,
 * first-run key generation) must be unreachable in a PACKAGED desktop process even
 * when the native root-source marker is missing. A packaged process is the Tauri
 * runtime: NODE_ENV=production plus the 32-hex SF_RUNTIME_INSTANCE_ID.
 *
 * CI exports SF_MASTER_KEY in every lane, so the switches must keep working
 * everywhere that is NOT a packaged desktop process (unit tests, e2e production
 * server without an instance id).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const OVERRIDE = "ab".repeat(32);
const INSTANCE = "c".repeat(32);

let scratch: string | null = null;

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = null;
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadGetMasterKey() {
  vi.resetModules();
  return (await import("../master-key")).getMasterKey;
}

describe("getMasterKey in a packaged desktop process (S01b-11)", () => {
  it("refuses the SF_MASTER_KEY override when the native root marker is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", INSTANCE);
    vi.stubEnv("SF_INSTALLATION_ROOT_SOURCE", "");
    vi.stubEnv("SF_MASTER_KEY", OVERRIDE);
    const getMasterKey = await loadGetMasterKey();
    expect(() => getMasterKey()).toThrow(/packaged/i);
  });

  it("refuses to fall back to a key file or to generate a new root", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", INSTANCE);
    vi.stubEnv("SF_INSTALLATION_ROOT_SOURCE", "");
    vi.stubEnv("SF_MASTER_KEY", "");
    scratch = mkdtempSync(join(tmpdir(), "sf-packaged-guard-"));
    vi.stubEnv("SF_DATA_DIR", scratch);
    const getMasterKey = await loadGetMasterKey();
    expect(() => getMasterKey()).toThrow(/packaged/i);
  });
});

describe("getMasterKey outside a packaged desktop process (CI shapes)", () => {
  it("still honours SF_MASTER_KEY under NODE_ENV=test even with an instance id", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", INSTANCE);
    vi.stubEnv("SF_INSTALLATION_ROOT_SOURCE", "");
    vi.stubEnv("SF_MASTER_KEY", OVERRIDE);
    const getMasterKey = await loadGetMasterKey();
    expect(getMasterKey().toString("hex")).toBe(OVERRIDE);
  });

  it("still honours SF_MASTER_KEY in a production-mode server without an instance id", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SF_RUNTIME_INSTANCE_ID", "");
    vi.stubEnv("SF_INSTALLATION_ROOT_SOURCE", "");
    vi.stubEnv("SF_MASTER_KEY", OVERRIDE);
    const getMasterKey = await loadGetMasterKey();
    expect(getMasterKey().toString("hex")).toBe(OVERRIDE);
  });
});

describe("the inlined packaged-process predicate", () => {
  it("agrees with isPackagedDesktopRuntime() for every env shape", async () => {
    const shapes: Array<[string, string]> = [
      ["production", INSTANCE],
      ["production", INSTANCE.toUpperCase()],
      ["production", ""],
      ["production", "c".repeat(31)],
      ["production", "z".repeat(32)],
      ["test", INSTANCE],
      ["development", INSTANCE],
    ];
    for (const [nodeEnv, instanceId] of shapes) {
      vi.unstubAllEnvs();
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("SF_RUNTIME_INSTANCE_ID", instanceId);
      vi.stubEnv("SF_INSTALLATION_ROOT_SOURCE", "");
      vi.stubEnv("SF_MASTER_KEY", OVERRIDE);
      const { isPackagedDesktopRuntime } = await import("@/lib/runtime/background-start");
      const getMasterKey = await loadGetMasterKey();
      let refused = false;
      try {
        getMasterKey();
      } catch (error) {
        refused = /packaged/i.test(String((error as Error).message));
      }
      expect(refused, `${nodeEnv}/${instanceId}`).toBe(isPackagedDesktopRuntime());
    }
  });
});
