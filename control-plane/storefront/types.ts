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

export type ServiceFetcher = { fetch: (request: Request) => Promise<Response> };
export type RateLimiter = {
  limit: (input: { key: string }) => Promise<{ success: boolean }>;
};

export interface StorefrontWorkerEnvironment {
  DB: D1Database;
  CONTROL: ServiceFetcher;
  CHECKOUT_RATE_LIMITER: RateLimiter;
}

export type StorefrontRow = {
  storefront_id: string;
  workspace_id: string;
  shop_id: string;
  slug: string;
  receipt_encryption_public_key: string;
  active_release_id: string | null;
  state: "active" | "paused";
};

export type ReleaseRow = {
  release_id: string;
  storefront_id: string;
  parent_release_id: string | null;
  template_id: "sahara" | "atlas" | "oasis";
  locale: "ar" | "fr" | "en";
  artifact_json: string;
  artifact_digest: string;
};

export type AllocationRow = {
  item_key: string;
  unit_price_dzd: number;
  remaining_quantity: number;
};

export type ReceiptState = "received" | "imported" | "rejected" | "reconciled";

export type ReceiptRow = {
  relay_sequence: number;
  receipt_id: string;
  storefront_id: string;
  release_id: string;
  idempotency_key: string;
  request_digest: string;
  state: ReceiptState;
  canonical_order_ref: string | null;
  result_digest: string | null;
  total_dzd: number;
  completed_at: string | null;
};
