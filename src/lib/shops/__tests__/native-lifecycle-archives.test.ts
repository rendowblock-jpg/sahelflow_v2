import { createHmac } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  dataRoot: "",
  masterKeyHex: "11".repeat(32),
}));

vi.mock("@/lib/storage/data-root", () => ({
  dataRoot: () => harness.dataRoot,
}));
vi.mock("@/lib/crypto/master-key", () => ({
  getMasterKey: () => Buffer.from(harness.masterKeyHex, "hex"),
}));

import {
  getNativeShopArchive,
  listNativeShopArchives,
  type NativeShopArchive,
} from "../native-lifecycle-archives";

const KEY_DOMAIN = Buffer.from("sahelflow.shop-archive.key.v1", "utf8");
const MAC_DOMAIN = "sahelflow.shop-archive.v1";
const MEDIA_FRAME = "whatsapp-media-archive-scope-v1";

class TestFrameWriter {
  private readonly chunks: Buffer[] = [];

  u8(value: number): void {
    const output = Buffer.allocUnsafe(1);
    output.writeUInt8(value);
    this.chunks.push(output);
  }

  u64(value: number): void {
    const output = Buffer.allocUnsafe(8);
    output.writeBigUInt64BE(BigInt(value));
    this.chunks.push(output);
  }

  string(value: string): void {
    const encoded = Buffer.from(value, "utf8");
    this.u64(encoded.length);
    this.chunks.push(encoded);
  }

  optionalString(value: string | null): void {
    if (value === null) {
      this.u8(0);
      return;
    }
    this.u8(1);
    this.string(value);
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function archiveMessage(state: NativeShopArchive): Buffer {
  const writer = new TestFrameWriter();
  writer.string(MAC_DOMAIN);
  writer.u8(0);
  writer.u8(state.formatVersion);
  writer.string(state.archiveId);
  writer.string(state.workspaceId);
  writer.string(state.installationId);
  writer.u8(state.status === "archived" ? 1 : 2);
  writer.string(state.shop.id);
  writer.string(state.shop.incarnationId);
  writer.string(state.shop.name);
  writer.string(state.shop.databaseFile);
  writer.optionalString(state.shop.icon);
  writer.string(state.shop.createdAt);
  writer.string(state.databaseSha256);
  if (state.whatsappMedia) {
    writer.string(MEDIA_FRAME);
    writer.u64(state.whatsappMedia.objectCount);
    writer.u64(state.whatsappMedia.ciphertextBytes);
    writer.string(state.whatsappMedia.scopeSha256);
  }
  writer.u64(state.archivedAtUnixMs);
  writer.u64(state.sourceRegistryRevision);
  writer.string(state.operationId);
  return writer.finish();
}

function archiveMac(state: NativeShopArchive): string {
  const root = Buffer.from(harness.masterKeyHex, "hex");
  const key = createHmac("sha256", root).update(KEY_DOMAIN).digest();
  try {
    return createHmac("sha256", key).update(archiveMessage(state)).digest("hex");
  } finally {
    root.fill(0);
    key.fill(0);
  }
}

function writeArchive(state: NativeShopArchive): string {
  const directory = join(harness.dataRoot, "shop-archives", state.archiveId);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "manifest.json");
  writeFileSync(
    path,
    JSON.stringify({
      formatVersion: 1,
      keyId: "installation-root-shop-archive-hmac-v1",
      state,
      mac: archiveMac(state),
    }),
  );
  return path;
}

function state(
  archiveId: string,
  archivedAtUnixMs: number,
  media = false,
): NativeShopArchive {
  return {
    formatVersion: 1,
    archiveId,
    workspaceId: "b".repeat(32),
    installationId: "c".repeat(32),
    status: "archived",
    shop: {
      id: `shop-${archiveId[0]}`,
      incarnationId: "d".repeat(32),
      name: `Shop ${archiveId[0]}`,
      databaseFile: `shop-${archiveId[0]}.db`,
      icon: null,
      createdAt: "2026-08-26T00:00:00.000Z",
    },
    databaseSha256: "e".repeat(64),
    ...(media
      ? {
          whatsappMedia: {
            objectCount: 2,
            ciphertextBytes: 4096,
            scopeSha256: "f".repeat(64),
          },
        }
      : {}),
    archivedAtUnixMs,
    sourceRegistryRevision: 7,
    operationId: archiveId,
  };
}

let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sahelflow-native-archives-"));
  harness.dataRoot = root;
  mkdirSync(join(root, "shop-archives"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  harness.dataRoot = "";
});

describe("native lifecycle archive authentication", () => {
  it("accepts both legacy and media-bearing format-v1 MAC framing", () => {
    const legacy = state("a".repeat(32), 1_000, false);
    const media = state("1".repeat(32), 2_000, true);
    writeArchive(legacy);
    writeArchive(media);

    expect(getNativeShopArchive(legacy.archiveId).whatsappMedia).toBeUndefined();
    expect(getNativeShopArchive(media.archiveId).whatsappMedia).toEqual(
      media.whatsappMedia,
    );
    expect(listNativeShopArchives().map((archive) => archive.archiveId)).toEqual([
      media.archiveId,
      legacy.archiveId,
    ]);
  });

  it("rejects media metadata changed after the archive MAC was created", () => {
    const media = state("2".repeat(32), 3_000, true);
    const path = writeArchive(media);
    const envelope = JSON.parse(readFileSync(path, "utf8")) as {
      state: { whatsappMedia: { objectCount: number } };
    };
    envelope.state.whatsappMedia.objectCount += 1;
    writeFileSync(path, JSON.stringify(envelope));

    expect(() => getNativeShopArchive(media.archiveId)).toThrow(
      "authentication failed",
    );
    expect(listNativeShopArchives()).toEqual([]);
  });
});
