export type D1RunResult = {
  success: boolean;
  meta?: { changes?: number; last_row_id?: number };
};

export type D1AllResult<T> = { success: boolean; results?: T[] };

export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  first: <T>() => Promise<T | null>;
  all: <T>() => Promise<D1AllResult<T>>;
  run: () => Promise<D1RunResult>;
};

export type D1Database = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<D1RunResult[]>;
};

export type R2Checksums = { sha256?: ArrayBuffer };
export type R2Object = {
  key: string;
  size: number;
  etag: string;
  checksums: R2Checksums;
  customMetadata?: Record<string, string>;
};
export type R2ObjectBody = R2Object & { body: ReadableStream };
export type R2Bucket = {
  put: (
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
    options?: {
      sha256?: ArrayBuffer | string;
      customMetadata?: Record<string, string>;
    },
  ) => Promise<R2Object | null>;
  head: (key: string) => Promise<R2Object | null>;
  get: (key: string) => Promise<R2ObjectBody | null>;
  delete: (key: string | string[]) => Promise<void>;
};

export interface BackupWorkerEnvironment {
  DB: D1Database;
  BACKUPS: R2Bucket;
  PRODUCT_MAJOR: string;
  SF_LICENSE_TRIAL_PUBLIC_KEYS: string;
  SF_LICENSE_PERMANENT_PUBLIC_KEYS: string;
}

export type BackupWorkspaceRow = {
  workspace_id: string;
  license_id: string;
  installation_id: string;
  license_type: "trial" | "extension" | "permanent";
  backup_bytes: number;
  entitlement_revocation_epoch: number;
  desktop_token_hash: string;
  desktop_signing_public_key: string;
  revoked_at: string | null;
};

export type BackupState =
  | "initiated"
  | "uploading"
  | "awaiting_verification"
  | "verified"
  | "failed"
  | "deleting"
  | "deleted";

export type BackupRow = {
  workspace_id: string;
  backup_id: string;
  shop_id: string;
  retention_class: "daily" | "weekly" | "monthly" | "pinned" | "trial";
  wrapped_dek: string;
  manifest_sha256: string;
  manifest_bytes: number;
  manifest_uploaded_at: string | null;
  chunk_count: number;
  total_bytes: number;
  state: BackupState;
  verification_receipt_digest: string | null;
  created_at: string;
  verified_at: string | null;
};

export type BackupChunkRow = {
  workspace_id: string;
  backup_id: string;
  chunk_index: number;
  object_key: string;
  sha256: string;
  byte_size: number;
  uploaded_at: string | null;
  etag: string | null;
};
