/**
 * Request-id replay guard (audit 7-a F5).
 *
 * Plain create routes (`POST /api/returns`, `POST /api/expenses`) execute an
 * insert on every attempt: a network timeout followed by a client retry, a
 * double click, or a proxy replay silently creates duplicate rows. The
 * command-kernel routes are sealed by durable idempotency records; these
 * legacy intake paths are not. This guard gives them the same contract at the
 * API layer.
 *
 * Contract: the client sends a stable `x-request-id` header per logical
 * submission (8-128 safe characters). The first execution's response
 * (status + JSON body) is remembered for REPLAY_TTL_MS; a replayed request
 * receives the stored response with an `X-SahelFlow-Replayed: true` header
 * instead of a duplicate execution. A concurrent duplicate (same id while the
 * original is still executing) fails closed with the coded 409
 * REQUEST_ALREADY_IN_PROGRESS rather than racing two inserts.
 *
 * Storage is process-local by design: SahelFlow is a local-first app with one
 * Next.js process per shop SQLite file (single writer), so a bounded
 * in-memory map provides the same replay window as a durable record without
 * new schema. The map is TTL-pruned and capped, so adversarial header
 * rotation cannot grow memory: an id only occupies an entry once its request
 * actually executes, and entries expire quickly.
 *
 * Absent header = legacy behavior (execute once, no replay memory), so
 * existing clients keep working while the UI adopts the header.
 */
import "server-only";

import { NextResponse } from "next/server";

import { SahelFlowError } from "@/types/errors";

/** Header carrying the client-chosen logical submission id. */
export const REPLAY_REQUEST_ID_HEADER = "x-request-id";

/** How long a completed response stays replayable. */
const REPLAY_TTL_MS = 10 * 60_000;

/** Upper bound of remembered responses (memory cap against id flooding). */
const MAX_REPLAY_ENTRIES = 1_000;

/** Safe request-id shape: 8-128 chars, no whitespace/control characters. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

interface ReplayRecord {
  status: number;
  body: unknown;
  expiresAt: number;
}

const records = new Map<string, ReplayRecord>();
const inFlight = new Set<string>();

function pruneExpired(now: number): void {
  for (const [key, record] of records) {
    if (record.expiresAt <= now) records.delete(key);
  }
}

function enforceCap(): void {
  while (records.size >= MAX_REPLAY_ENTRIES) {
    // Map iteration is insertion-ordered: evict the oldest entry.
    const oldest = records.keys().next().value;
    if (oldest === undefined) break;
    records.delete(oldest);
  }
}

/**
 * Extract and validate the replay id from a request. Returns null when the
 * header is absent (legacy single-execution behavior). Throws a coded 400
 * when the header is present but malformed, so a truncated/duplicated id can
 * never silently alias another logical submission.
 */
export function readReplayRequestId(req: Request): string | null {
  const raw = req.headers.get(REPLAY_REQUEST_ID_HEADER)?.trim() ?? "";
  if (!raw) return null;
  if (!REQUEST_ID_PATTERN.test(raw)) {
    throw new SahelFlowError(
      `The ${REPLAY_REQUEST_ID_HEADER} header must be 8-128 characters of letters, digits, dot, dash, colon or underscore`,
      "INVALID_REQUEST_ID",
      400,
    );
  }
  return raw;
}

/**
 * Execute the handler under replay protection. With a null requestId this is
 * a pass-through (the handler still runs exactly once).
 */
export async function withReplayGuard(
  shopId: string,
  requestId: string | null,
  execute: () => Promise<NextResponse>,
): Promise<NextResponse> {
  if (!requestId) return execute();

  const key = `${shopId}:${requestId}`;
  const now = Date.now();
  pruneExpired(now);

  const record = records.get(key);
  if (record && record.expiresAt > now) {
    const replay = NextResponse.json(record.body, { status: record.status });
    replay.headers.set("X-SahelFlow-Replayed", "true");
    return replay;
  }

  if (inFlight.has(key)) {
    throw new SahelFlowError(
      "An identical request is still being processed. Retry with the same request id to receive its result instead of duplicating it",
      "REQUEST_ALREADY_IN_PROGRESS",
      409,
    );
  }

  inFlight.add(key);
  try {
    const response = await execute();
    try {
      // Keep a JSON clone of the response for the replay window. The original
      // response is returned untouched; a non-JSON body simply gets no replay
      // memory.
      const body = (await response.clone().json()) as unknown;
      enforceCap();
      records.set(key, {
        status: response.status,
        body,
        expiresAt: Date.now() + REPLAY_TTL_MS,
      });
    } catch {
      // Non-JSON response (or clone raced) — return it without replay memory.
    }
    return response;
  } finally {
    inFlight.delete(key);
  }
}

/** Test-only: reset all replay-guard state. */
export function _resetReplayGuardForTests(): void {
  records.clear();
  inFlight.clear();
}
