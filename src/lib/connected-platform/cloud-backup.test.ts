import { generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const runtimeHolder: { current: unknown } = { current: null };
vi.mock("./runtime", () => ({
  loadBackupRuntimeIfEnrolled: vi.fn(async () => runtimeHolder.current),
}));

import type { BackupEntry } from "@/lib/backup";
import type { ServiceContext } from "@/lib/data/service-base";

import { canonicalBackupVerificationBytes } from "./backup-protocol";
import { uploadNativeBackupToCloudIfEnrolled } from "./cloud-backup";
import { ConnectedPlatformHttpError } from "./client";

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const SHOP = "fedcba9876543210fedcba9876543210";
const BACKUP_ID = "backup-1760000000000-0123456789abcdef";
const OTHER_BACKUP_ID = "backup-1760000000001-ffffffffffffffff";

const signing = generateKeyPairSync("ed25519");
const signingPrivateKeyPkcs8 = signing.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");

const context = { prisma: {} as never, shop: { workspaceId: WORKSPACE, shopId: SHOP } } as unknown as ServiceContext;
const noWait = vi.fn(async (_milliseconds: number) => undefined);
const upload = () => uploadNativeBackupToCloudIfEnrolled(context, entry, "permanent", { sleep: noWait });

let root = "";
let entry: BackupEntry;
const FILES = ["manifest.sfm", "objects/part-0001.bin", "objects/part-0002.bin"] as const;

beforeEach(() => {
  noWait.mockClear();
  root = mkdtempSync(join(tmpdir(), "sf-cloud-backup-"));
  const location = join(root, `${BACKUP_ID}.sfbackup`);
  mkdirSync(join(location, "objects"), { recursive: true });
  writeFileSync(join(location, "descriptor.json"), JSON.stringify({
    formatVersion: 1,
    format: "sahelflow-survivability-backup",
    backupId: BACKUP_ID,
    workspaceId: WORKSPACE,
    manifestFile: "manifest.sfm",
    wrappedDek: { alg: "AES-256-GCM", keyId: "brk-1", sealed: "c2VhbGVkLWtleS1ieXRlcw==" },
  }));
  for (const [index, file] of FILES.entries()) {
    writeFileSync(join(location, ...file.split("/")), Buffer.alloc(300 + index * 100, index + 1));
  }
  entry = { backupId: BACKUP_ID, location } as unknown as BackupEntry;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  runtimeHolder.current = null;
});

type Plan = { manifestBytes: number; chunks: Array<{ byteSize: number }> };
type Call = { name: string; args: unknown[] };

/** What the service would compute for a plan, so a test never leans on the code under test. */
const totalOf = (plan: Plan) => plan.manifestBytes + plan.chunks.reduce((sum, chunk) => sum + chunk.byteSize, 0);
const fresh = (plan: Plan) => ({ backupId: BACKUP_ID, state: "initiated", totalBytes: totalOf(plan) });
const resumedAs = (state: string, extra: Record<string, unknown> = {}) => (plan: Plan) => ({
  backupId: BACKUP_ID, state, resumed: true, totalBytes: totalOf(plan), ...extra,
});
const allArrived = { manifestUploaded: true, uploadedChunks: [0, 1, 2] };
const alreadyVerified = (receiptDigest: string) => () => ({
  backupId: BACKUP_ID, state: "verified", resumed: true, verifiedAt: "2026-10-19T10:00:00Z", receiptDigest,
});
const http = (status: number, code = "x") => new ConnectedPlatformHttpError(status, code);

/** A cloud client whose answers are scripted per call; every call is recorded. */
function fakeCloud(script: {
  initiate?: unknown[];
  manifest?: Array<Error | undefined>;
  chunk?: (index: number, nth: number) => Error | undefined;
  verify?: unknown[];
}) {
  const calls: Call[] = [];
  const chunkSeen = new Map<number, number>();
  let initiateN = 0;
  let manifestN = 0;
  let verifyN = 0;
  const client = {
    initiateBackup: vi.fn(async (...args: unknown[]) => {
      calls.push({ name: "initiate", args });
      const step = script.initiate?.[initiateN++];
      if (step instanceof Error) throw step;
      return typeof step === "function" ? (step as (plan: Plan) => unknown)(args[0] as Plan) : step;
    }),
    uploadBackupManifest: vi.fn(async (...args: unknown[]) => {
      calls.push({ name: "manifest", args });
      const step = script.manifest?.[manifestN++];
      if (step) throw step;
      return { status: "uploaded", replay: false };
    }),
    uploadBackupChunk: vi.fn(async (...args: unknown[]) => {
      const index = args[1] as number;
      calls.push({ name: `chunk${index}`, args });
      const nth = (chunkSeen.get(index) ?? 0) + 1;
      chunkSeen.set(index, nth);
      const failure = script.chunk?.(index, nth);
      if (failure) throw failure;
      return { status: "uploaded", replay: false };
    }),
    verifyBackup: vi.fn(async (...args: unknown[]) => {
      calls.push({ name: "verify", args });
      const step = script.verify?.[verifyN++];
      if (step instanceof Error) throw step;
      return step ?? { backupId: BACKUP_ID, state: "verified", verifiedAt: "x", receiptDigest: "r".repeat(64) };
    }),
    deleteRemoteBackup: vi.fn(async (...args: unknown[]) => {
      calls.push({ name: "delete", args });
      return { backupId: BACKUP_ID, state: "deleted" };
    }),
  };
  runtimeHolder.current = { client, desktopKeys: { signingPrivateKeyPkcs8 } };
  return { client, calls, names: () => calls.map((call) => call.name) };
}

describe("uploadNativeBackupToCloudIfEnrolled", () => {
  it("returns null, calling nothing, when the shop is not enrolled for cloud backup", async () => {
    runtimeHolder.current = null;
    await expect(upload()).resolves.toBeNull();
  });

  it("uploads everything once and returns the verified receipt on a clean run", async () => {
    const cloud = fakeCloud({ initiate: [fresh] });
    await expect(upload()).resolves.toEqual({ backupId: BACKUP_ID, state: "verified", receiptDigest: "r".repeat(64) });
    expect(cloud.names()).toEqual(["initiate", "manifest", "chunk0", "chunk1", "chunk2", "verify"]);
    expect(noWait).not.toHaveBeenCalled();
  });

  it("signs a verification receipt over the exact plan it sent", async () => {
    const cloud = fakeCloud({ initiate: [fresh] });
    await upload();
    const plan = (cloud.calls.find((call) => call.name === "initiate")?.args[0] ?? {}) as Plan & { manifestSha256: string };
    const sent = (cloud.calls.find((call) => call.name === "verify")?.args[1] ?? {}) as {
      workspaceId: string; verifiedAt: string; signature: string;
    };
    expect(sent.workspaceId).toBe(WORKSPACE);
    const canonical = canonicalBackupVerificationBytes({
      workspaceId: WORKSPACE, shopId: SHOP, backupId: BACKUP_ID,
      manifestSha256: plan.manifestSha256, totalBytes: totalOf(plan), chunkCount: 3, verifiedAt: sent.verifiedAt,
    });
    expect(verify(null, Buffer.from(canonical), signing.publicKey, Buffer.from(sent.signature, "base64"))).toBe(true);
  });

  it("refuses an answer whose byte total differs from the local plan, without retrying", async () => {
    const cloud = fakeCloud({ initiate: [(plan: Plan) => ({ ...fresh(plan), totalBytes: totalOf(plan) + 1 })] });
    await expect(upload()).rejects.toThrow(/did not acknowledge/);
    expect(cloud.names()).toEqual(["initiate"]);
    expect(noWait).not.toHaveBeenCalled();
  });

  it("refuses an answer about another backup, without retrying", async () => {
    const cloud = fakeCloud({ initiate: [(plan: Plan) => ({ ...fresh(plan), backupId: OTHER_BACKUP_ID })] });
    await expect(upload()).rejects.toThrow(/did not acknowledge/);
    expect(cloud.names()).toEqual(["initiate"]);
  });

  it("refuses a first-time answer that claims to be a resumed one in a state it cannot be in", async () => {
    const cloud = fakeCloud({ initiate: [resumedAs("failed")] });
    await expect(upload()).rejects.toThrow(/did not acknowledge/);
    expect(cloud.names()).toEqual(["initiate"]);
  });

  describe("retry", () => {
    it("after a transient chunk failure it resumes: only the missing chunks are sent again, after a 1 s pause", async () => {
      const cloud = fakeCloud({
        initiate: [fresh, resumedAs("uploading", { manifestUploaded: true, uploadedChunks: [0] })],
        chunk: (index, nth) => (index === 1 && nth === 1 ? http(503, "remote_unavailable") : undefined),
      });
      const result = await upload();
      expect(result?.state).toBe("verified");
      expect(cloud.names()).toEqual(["initiate", "manifest", "chunk0", "chunk1", "initiate", "chunk1", "chunk2", "verify"]);
      expect(noWait.mock.calls.map((call) => call[0])).toEqual([1_000]);
      expect(cloud.client.deleteRemoteBackup).not.toHaveBeenCalled();
    });

    it("does not trust nonsense about what arrived: unusable indexes mean 'not held'", async () => {
      const cloud = fakeCloud({
        initiate: [
          fresh,
          resumedAs("uploading", { manifestUploaded: false, uploadedChunks: [-1, 1.5, 99, "0", null, 2, 2] }),
        ],
        chunk: (index, nth) => (index === 0 && nth === 1 ? http(504, "remote_timeout") : undefined),
      });
      await upload();
      // only chunk 2 is genuinely held; the manifest was not reported held either
      expect(cloud.names()).toEqual(["initiate", "manifest", "chunk0", "initiate", "manifest", "chunk0", "chunk1", "verify"]);
    });

    it("only believes 'already uploaded' from an answer that is a resumed one", async () => {
      const cloud = fakeCloud({
        initiate: [
          (plan: Plan) => ({ ...fresh(plan), manifestUploaded: true, uploadedChunks: [0, 1, 2] }),
        ],
      });
      await upload();
      expect(cloud.names()).toEqual(["initiate", "manifest", "chunk0", "chunk1", "chunk2", "verify"]);
    });

    it("when the verification reply was lost the retry learns it is already verified and uploads nothing", async () => {
      const cloud = fakeCloud({
        initiate: [fresh, alreadyVerified("d".repeat(64))],
        verify: [http(504, "remote_timeout")],
      });
      await expect(upload()).resolves.toEqual({ backupId: BACKUP_ID, state: "verified", receiptDigest: "d".repeat(64) });
      expect(cloud.names()).toEqual(["initiate", "manifest", "chunk0", "chunk1", "chunk2", "verify", "initiate"]);
      expect(cloud.client.deleteRemoteBackup).not.toHaveBeenCalled();
    });

    it("a verification the service did not complete is verified again, not re-uploaded", async () => {
      const cloud = fakeCloud({
        initiate: [fresh, resumedAs("awaiting_verification", allArrived)],
        verify: [http(503, "retention_cleanup_unavailable")],
      });
      const result = await upload();
      expect(result?.state).toBe("verified");
      expect(cloud.names()).toEqual(["initiate", "manifest", "chunk0", "chunk1", "chunk2", "verify", "initiate", "verify"]);
    });

    it("gives up after three attempts (pauses 1 s then 4 s), releases the reservation once, and rethrows the last error", async () => {
      const cloud = fakeCloud({
        initiate: [fresh, fresh, fresh],
        manifest: [http(503, "a"), http(503, "b"), http(503, "last")],
      });
      await expect(upload()).rejects.toMatchObject({ status: 503, code: "last" });
      expect(cloud.names().filter((name) => name === "initiate")).toHaveLength(3);
      expect(noWait.mock.calls.map((call) => call[0])).toEqual([1_000, 4_000]);
      expect(cloud.names().filter((name) => name === "delete")).toHaveLength(1);
      expect(cloud.names().at(-1)).toBe("delete");
    });

    it("keeps the cloud copy when verification was started and never confirmed (it may already exist)", async () => {
      const cloud = fakeCloud({
        initiate: [fresh, resumedAs("awaiting_verification", allArrived), resumedAs("awaiting_verification", allArrived)],
        verify: [http(504, "remote_timeout"), http(504, "remote_timeout"), http(504, "remote_timeout")],
      });
      await expect(upload()).rejects.toMatchObject({ status: 504 });
      expect(cloud.client.deleteRemoteBackup).not.toHaveBeenCalled();
    });

    it("also retries a 408 and a 429", async () => {
      for (const status of [408, 429]) {
        const cloud = fakeCloud({
          initiate: [fresh, resumedAs("uploading", { manifestUploaded: true, uploadedChunks: [] })],
          manifest: [http(status, "slow_down")],
        });
        await upload();
        expect(cloud.names().filter((name) => name === "initiate")).toHaveLength(2);
      }
    });

    it("never retries a refusal that repeating cannot change, and releases the reservation at once", async () => {
      for (const status of [400, 401, 403, 404, 409]) {
        noWait.mockClear();
        const cloud = fakeCloud({ initiate: [fresh], chunk: (index) => (index === 1 ? http(status, "chunk_integrity_mismatch") : undefined) });
        await expect(upload()).rejects.toMatchObject({ status });
        expect(cloud.names().filter((name) => name === "initiate")).toHaveLength(1);
        expect(cloud.names().at(-1)).toBe("delete");
        expect(noWait).not.toHaveBeenCalled();
      }
    });

    it("never retries a local error that is not an HTTP answer", async () => {
      const cloud = fakeCloud({ initiate: [fresh], manifest: [new TypeError("boom")] });
      await expect(upload()).rejects.toThrow("boom");
      expect(cloud.names().filter((name) => name === "initiate")).toHaveLength(1);
      expect(noWait).not.toHaveBeenCalled();
    });

    it("releases nothing when the very first reservation failed (nothing was reserved)", async () => {
      const cloud = fakeCloud({ initiate: [http(503, "a"), http(503, "b"), http(503, "c")] });
      await expect(upload()).rejects.toMatchObject({ status: 503 });
      expect(cloud.client.deleteRemoteBackup).not.toHaveBeenCalled();
      expect(noWait.mock.calls.map((call) => call[0])).toEqual([1_000, 4_000]);
    });
  });
});
