/**
 * Pure decisions the backup Worker makes about an upload plan and about the
 * objects it holds. No storage access here, so each rule is unit-tested.
 */

export type RequestedPlan = Readonly<{
  shopId: string;
  retentionClass: string;
  wrappedDek: string;
  manifestSha256: string;
  manifestBytes: number;
  totalBytes: number;
  chunks: ReadonlyArray<Readonly<{ index: number; sha256: string; byteSize: number }>>;
}>;

export type StoredBackupPlan = Readonly<{
  shop_id: string;
  retention_class: string;
  wrapped_dek: string;
  manifest_sha256: string;
  manifest_bytes: number;
  chunk_count: number;
  total_bytes: number;
}>;

export type StoredChunkPlan = Readonly<{
  chunk_index: number;
  sha256: string;
  byte_size: number;
  uploaded_at: string | null;
}>;

/**
 * True when a re-sent plan is exactly the plan already reserved: same shop,
 * class, wrapped key, manifest, sizes and every chunk's index, hash and size.
 * Only then may the reservation be resumed; any difference is a conflict.
 */
export function planMatches(
  stored: StoredBackupPlan,
  storedChunks: readonly StoredChunkPlan[],
  requested: RequestedPlan,
): boolean {
  if (
    stored.shop_id !== requested.shopId ||
    stored.retention_class !== requested.retentionClass ||
    stored.wrapped_dek !== requested.wrappedDek ||
    stored.manifest_sha256 !== requested.manifestSha256 ||
    Number(stored.manifest_bytes) !== requested.manifestBytes ||
    Number(stored.total_bytes) !== requested.totalBytes ||
    Number(stored.chunk_count) !== requested.chunks.length ||
    storedChunks.length !== requested.chunks.length
  ) return false;
  const byIndex = new Map(storedChunks.map((chunk) => [Number(chunk.chunk_index), chunk] as const));
  if (byIndex.size !== storedChunks.length) return false;
  for (const wanted of requested.chunks) {
    const have = byIndex.get(wanted.index);
    if (!have || have.sha256 !== wanted.sha256 || Number(have.byte_size) !== wanted.byteSize) {
      return false;
    }
  }
  return true;
}

/** Indexes of the chunks the cloud already holds, ascending. */
export function arrivedChunkIndexes(chunks: readonly StoredChunkPlan[]): number[] {
  return chunks
    .filter((chunk) => chunk.uploaded_at !== null)
    .map((chunk) => Number(chunk.chunk_index))
    .sort((a, b) => a - b);
}

export type ChunkRecord = Readonly<{
  chunk_index: number;
  object_key: string;
  byte_size: number;
  sha256: string;
  etag: string | null;
}>;

export type RemoteObject = Readonly<{
  size: number;
  etag: string;
  /** lowercase hex, or null when the storage listing does not report it */
  sha256: string | null;
}>;

/**
 * Indexes of the chunks whose stored object is gone or no longer the object
 * that was accepted: missing, a different size, a different checksum when the
 * storage reports one, or a different entity tag from the one recorded at
 * upload time (the tag changes whenever the bytes do).
 */
export function damagedChunks(
  records: readonly ChunkRecord[],
  remote: ReadonlyMap<string, RemoteObject>,
): number[] {
  const damaged: number[] = [];
  for (const record of records) {
    const object = remote.get(record.object_key);
    if (!object || object.size !== Number(record.byte_size)) {
      damaged.push(Number(record.chunk_index));
    } else if (object.sha256 !== null && object.sha256 !== record.sha256) {
      damaged.push(Number(record.chunk_index));
    } else if (record.etag !== null && object.etag !== record.etag) {
      damaged.push(Number(record.chunk_index));
    }
  }
  return damaged.sort((a, b) => a - b);
}
