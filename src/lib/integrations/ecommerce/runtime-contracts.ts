import "server-only";

import { createHash } from "node:crypto";

import type { EcommercePlatform, NormalizedOrder } from "./types";

export const COMMERCE_RUN_ACTIVE_KEY_PREFIX = "commerce-sync-active";
export const COMMERCE_FETCH_MAX_ATTEMPTS = 5;
export const COMMERCE_ITEM_DEFAULT_MAX_ATTEMPTS = 5;
export const COMMERCE_LEASE_MS = 60_000;

export const COMMERCE_RUN_ACTIVE_STATES = [
  "queued",
  "fetching",
  "processing",
  "retrying",
  "partially_completed",
  "dead_letter",
] as const;

export type CommerceRunActiveState =
  (typeof COMMERCE_RUN_ACTIVE_STATES)[number];

export interface CommerceIntegrationConfig {
  watermark: string;
  lastSyncAt: string;
}

export function parseCommerceIntegrationConfig(
  value: string | null,
): CommerceIntegrationConfig {
  if (!value) return { watermark: "", lastSyncAt: "" };
  try {
    const parsed = JSON.parse(value) as Partial<CommerceIntegrationConfig>;
    return {
      watermark: typeof parsed.watermark === "string" ? parsed.watermark : "",
      lastSyncAt:
        typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : "",
    };
  } catch {
    return { watermark: "", lastSyncAt: "" };
  }
}

export function canonicalCommerceJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalCommerceJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${canonicalCommerceJson(entry)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function commerceHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalCommerceJson(value))
    .digest("hex");
}

export function commerceActiveKey(platform: EcommercePlatform): string {
  return `${COMMERCE_RUN_ACTIVE_KEY_PREFIX}:${platform}`;
}

export function commerceItemIdentity(order: NormalizedOrder): {
  sourceRevision: string;
  payloadHash: string;
} {
  const payloadHash = commerceHash(order);
  const sourceRevision = order.sourceRevision?.trim() || payloadHash;
  return { sourceRevision, payloadHash };
}

export function safeCommerceErrorCode(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code.slice(0, 100);
  }
  if (error instanceof Error && error.name) {
    return error.name.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 100);
  }
  return "COMMERCE_SYNC_UNKNOWN";
}

export function commerceRetryAt(attemptCount: number): Date {
  const boundedAttempt = Math.max(1, Math.min(attemptCount, 8));
  const delay = Math.min(15 * 60_000, 2_000 * 2 ** (boundedAttempt - 1));
  return new Date(Date.now() + delay);
}
