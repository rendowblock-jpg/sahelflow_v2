import { describe, expect, it } from "vitest";

import {
  arrivedChunkIndexes,
  damagedChunks,
  planMatches,
  type ChunkRecord,
  type RemoteObject,
  type RequestedPlan,
  type StoredBackupPlan,
  type StoredChunkPlan,
} from "./plan";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);

const requested: RequestedPlan = {
  shopId: "shop-aaaaaaaa",
  retentionClass: "daily",
  wrappedDek: "d3JhcHBlZC1kZWstYnl0ZXM=",
  manifestSha256: A,
  manifestBytes: 100,
  totalBytes: 100 + 10 + 20,
  chunks: [
    { index: 0, sha256: B, byteSize: 10 },
    { index: 1, sha256: C, byteSize: 20 },
  ],
};
const stored: StoredBackupPlan = {
  shop_id: "shop-aaaaaaaa",
  retention_class: "daily",
  wrapped_dek: "d3JhcHBlZC1kZWstYnl0ZXM=",
  manifest_sha256: A,
  manifest_bytes: 100,
  chunk_count: 2,
  total_bytes: 130,
};
const storedChunks: StoredChunkPlan[] = [
  { chunk_index: 0, sha256: B, byte_size: 10, uploaded_at: "2026-10-19 09:00:00" },
  { chunk_index: 1, sha256: C, byte_size: 20, uploaded_at: null },
];

describe("planMatches", () => {
  it("accepts the identical plan", () => {
    expect(planMatches(stored, storedChunks, requested)).toBe(true);
  });

  it("treats numbers from storage that arrive as numbers or digits alike", () => {
    const loose = { ...stored, manifest_bytes: "100" as unknown as number };
    expect(planMatches(loose, storedChunks, requested)).toBe(true);
  });

  it("refuses every single difference", () => {
    const cases: Array<[string, StoredBackupPlan, readonly StoredChunkPlan[], RequestedPlan]> = [
      ["shop", { ...stored, shop_id: "shop-bbbbbbbb" }, storedChunks, requested],
      ["class", { ...stored, retention_class: "weekly" }, storedChunks, requested],
      ["wrapped key", { ...stored, wrapped_dek: "b3RoZXIta2V5LWJ5dGVz" }, storedChunks, requested],
      ["manifest hash", { ...stored, manifest_sha256: B }, storedChunks, requested],
      ["manifest size", { ...stored, manifest_bytes: 101 }, storedChunks, requested],
      ["total size", { ...stored, total_bytes: 131 }, storedChunks, requested],
      ["chunk count", { ...stored, chunk_count: 3 }, storedChunks, requested],
      ["a chunk hash", stored, [storedChunks[0]!, { ...storedChunks[1]!, sha256: B }], requested],
      ["a chunk size", stored, [storedChunks[0]!, { ...storedChunks[1]!, byte_size: 21 }], requested],
      ["a missing chunk row", stored, [storedChunks[0]!], requested],
      ["a repeated chunk row", stored, [storedChunks[0]!, storedChunks[0]!], requested],
      ["an extra requested chunk", stored, storedChunks, { ...requested, chunks: [...requested.chunks, { index: 2, sha256: A, byteSize: 1 }] }],
      ["a reordered chunk index", stored, storedChunks, { ...requested, chunks: [{ index: 1, sha256: B, byteSize: 10 }, { index: 0, sha256: C, byteSize: 20 }] }],
    ];
    for (const [label, s, c, r] of cases) {
      expect(planMatches(s, c, r), label).toBe(false);
    }
  });
});

describe("arrivedChunkIndexes", () => {
  it("lists only the chunks the cloud holds, in order", () => {
    expect(arrivedChunkIndexes(storedChunks)).toEqual([0]);
    expect(arrivedChunkIndexes([
      { chunk_index: 2, sha256: A, byte_size: 1, uploaded_at: "x" },
      { chunk_index: 0, sha256: A, byte_size: 1, uploaded_at: "x" },
      { chunk_index: 1, sha256: A, byte_size: 1, uploaded_at: null },
    ])).toEqual([0, 2]);
    expect(arrivedChunkIndexes([])).toEqual([]);
  });
});

describe("damagedChunks", () => {
  const records: ChunkRecord[] = [
    { chunk_index: 0, object_key: "k/0", byte_size: 10, sha256: B, etag: "e0" },
    { chunk_index: 1, object_key: "k/1", byte_size: 20, sha256: C, etag: "e1" },
    { chunk_index: 2, object_key: "k/2", byte_size: 30, sha256: A, etag: null },
  ];
  const healthy = (): Map<string, RemoteObject> => new Map([
    ["k/0", { size: 10, etag: "e0", sha256: B }],
    ["k/1", { size: 20, etag: "e1", sha256: null }],
    ["k/2", { size: 30, etag: "anything", sha256: null }],
  ]);

  it("reports nothing when every object is as accepted", () => {
    expect(damagedChunks(records, healthy())).toEqual([]);
  });

  it("reports an object that vanished", () => {
    const remote = healthy();
    remote.delete("k/1");
    expect(damagedChunks(records, remote)).toEqual([1]);
  });

  it("reports a different size", () => {
    const remote = healthy();
    remote.set("k/0", { size: 11, etag: "e0", sha256: B });
    expect(damagedChunks(records, remote)).toEqual([0]);
  });

  it("reports a different checksum when the storage states one", () => {
    const remote = healthy();
    remote.set("k/0", { size: 10, etag: "e0", sha256: C });
    expect(damagedChunks(records, remote)).toEqual([0]);
  });

  it("reports a changed entity tag even when size and checksum are not available", () => {
    const remote = healthy();
    remote.set("k/1", { size: 20, etag: "changed", sha256: null });
    expect(damagedChunks(records, remote)).toEqual([1]);
  });

  it("does not compare a tag that was never recorded", () => {
    const remote = healthy();
    remote.set("k/2", { size: 30, etag: "different", sha256: null });
    expect(damagedChunks(records, remote)).toEqual([]);
  });

  it("returns every damaged index once, ascending", () => {
    expect(damagedChunks(records, new Map())).toEqual([0, 1, 2]);
  });
});
