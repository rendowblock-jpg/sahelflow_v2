/**
 * INT-10: background workers used to swallow every error in a bare `catch {}`.
 * The recorder keeps the privacy rule (no message, URL or customer value ever
 * leaves the error) and adds the missing signal: a status, timestamps and a
 * failure CODE per worker.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SahelFlowError } from "@/types/errors";
import {
  BACKGROUND_WORKER_IDS,
  __resetBackgroundWorkerHealthForTests,
  classifyWorkerFailure,
  getBackgroundWorkerHealth,
  recordWorkerFailure,
  recordWorkerIdle,
  recordWorkerSuccess,
} from "../worker-health";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const HOSTILE =
  "Bearer abc123SECRET https://user:pw@192.168.0.7/orders?phone=0555123456 Amina Benali";

describe("classifyWorkerFailure", () => {
  it("passes a developer-defined code and nothing else", () => {
    expect(classifyWorkerFailure(new SahelFlowError(HOSTILE, "LICENSE_EXPIRED", 403))).toBe(
      "LICENSE_EXPIRED",
    );
    expect(classifyWorkerFailure(Object.assign(new Error(HOSTILE), { code: "P2034" }))).toBe("P2034");
    expect(classifyWorkerFailure(Object.assign(new Error(HOSTILE), { code: "ECONNREFUSED" }))).toBe(
      "ECONNREFUSED",
    );
  });

  it("never reads a message and rejects codes that are not identifiers", () => {
    expect(classifyWorkerFailure(new Error(HOSTILE))).toBe("UNCLASSIFIED");
    expect(classifyWorkerFailure(new SahelFlowError("x", HOSTILE, 500))).toBe("UNCLASSIFIED");
    expect(classifyWorkerFailure(Object.assign(new Error("x"), { code: HOSTILE }))).toBe("UNCLASSIFIED");
    expect(classifyWorkerFailure(HOSTILE)).toBe("UNCLASSIFIED");
    expect(classifyWorkerFailure(null)).toBe("UNCLASSIFIED");
  });

  it("maps timeouts and validation failures to fixed words", () => {
    expect(classifyWorkerFailure(new DOMException("aborted", "AbortError"))).toBe("TIMEOUT");
    expect(classifyWorkerFailure(Object.assign(new Error("x"), { name: "ZodError" }))).toBe("INVALID_DATA");
  });
});

describe("background worker health", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetBackgroundWorkerHealthForTests();
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists every worker as pending before its first tick, which is not the same as healthy", () => {
    const snapshot = getBackgroundWorkerHealth();
    expect(snapshot.map((entry) => entry.worker)).toEqual([...BACKGROUND_WORKER_IDS]);
    expect(snapshot.every((entry) => entry.status === "pending" && entry.lastTickAt === null)).toBe(true);
  });

  it("records a licence failure as a code with a time, and clears it on the next success", () => {
    recordWorkerFailure("commerce-sync", new SahelFlowError(HOSTILE, "LICENSE_EXPIRED", 403));
    const failing = getBackgroundWorkerHealth().find((entry) => entry.worker === "commerce-sync");
    expect(failing).toMatchObject({
      status: "failing",
      lastFailureCode: "LICENSE_EXPIRED",
      consecutiveFailures: 1,
    });
    expect(failing?.lastFailureAt).not.toBeNull();

    recordWorkerSuccess("commerce-sync");
    const healthy = getBackgroundWorkerHealth().find((entry) => entry.worker === "commerce-sync");
    expect(healthy).toMatchObject({ status: "ok", consecutiveFailures: 0, lastFailureCode: "LICENSE_EXPIRED" });
    expect(healthy?.lastSuccessAt).not.toBeNull();
  });

  it("keeps a failure visible through 'nothing due' ticks but lets a deliberate rest replace it", () => {
    recordWorkerFailure("google-sheets-bridge", new Error("x"));
    recordWorkerIdle("google-sheets-bridge", "nothing_due");
    expect(getBackgroundWorkerHealth().find((e) => e.worker === "google-sheets-bridge")?.status).toBe("failing");

    recordWorkerFailure("storefront-receipts", new Error("x"));
    recordWorkerIdle("storefront-receipts", "not_enrolled");
    expect(getBackgroundWorkerHealth().find((e) => e.worker === "storefront-receipts")).toMatchObject({
      status: "idle",
      consecutiveFailures: 0,
    });
  });

  it("contains nothing from a hostile error in the snapshot or in any log line", () => {
    recordWorkerFailure("courier-outbox", new Error(HOSTILE));
    recordWorkerFailure("automations", Object.assign(new Error(HOSTILE), { code: "SQLITE_BUSY" }));
    recordWorkerSuccess("automations");

    const everything = JSON.stringify([
      getBackgroundWorkerHealth(),
      warn.mock.calls,
      info.mock.calls,
    ]);
    for (const secret of ["abc123SECRET", "user:pw", "192.168.0.7", "0555123456", "Amina", "Bearer"]) {
      expect(everything).not.toContain(secret);
    }
    expect(everything).toContain("UNCLASSIFIED");
    expect(everything).toContain("SQLITE_BUSY");
  });

  it("logs the first failure, each power of ten and a change of code, and a recovery once", () => {
    for (let i = 0; i < 25; i += 1) recordWorkerFailure("meta-capi", new Error("x"));
    // 1st and 10th only
    expect(warn).toHaveBeenCalledTimes(2);
    recordWorkerFailure("meta-capi", Object.assign(new Error("x"), { code: "ETIMEDOUT" }));
    expect(warn).toHaveBeenCalledTimes(3);
    recordWorkerSuccess("meta-capi");
    recordWorkerSuccess("meta-capi");
    expect(info).toHaveBeenCalledTimes(1);
  });
});

describe("every background worker reports instead of swallowing (source pins)", () => {
  const WORKERS: ReadonlyArray<readonly [string, string]> = [
    ["src/lib/integrations/ecommerce/worker.ts", "commerce-sync"],
    ["src/lib/automations/worker.ts", "automations"],
    ["src/lib/delivery/outbox-worker.ts", "courier-outbox"],
    ["src/lib/meta/capi-worker.ts", "meta-capi"],
    ["src/lib/integrations/google-sheets/bridge-worker.ts", "google-sheets-bridge"],
    ["src/lib/connected-platform/storefront-receipt-worker.ts", "storefront-receipts"],
    ["src/lib/integrations/reconcile-worker.ts", "scheduled-reconcile"],
  ];

  it.each(WORKERS)("%s records success and failure for %s", (path, id) => {
    const source = read(path);
    expect(source).toContain("@/lib/integrations/worker-health");
    expect(source).toContain(`recordWorkerSuccess("${id}")`);
    expect(source).toContain(`recordWorkerFailure("${id}", error)`);
    expect(source).not.toMatch(/catch \{/);
    expect(source).not.toMatch(/error\.message|String\(error\)/);
  });

  it("covers exactly the workers the recorder knows", () => {
    expect(WORKERS.map(([, id]) => id).sort()).toEqual([...BACKGROUND_WORKER_IDS].sort());
  });

  it("the receipt importer logs failure codes, never relay or release messages", () => {
    const importer = read("src/lib/connected-platform/storefront-receipt-import.ts");
    expect(importer).not.toMatch(/releaseError\.message|error\.message/);
    expect(importer).toContain("reason: classifyWorkerFailure(error)");
  });
});
