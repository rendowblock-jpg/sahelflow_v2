/**
 * LIVE Groq run over the golden set: paced, budgeted, resumable. Harness only, nothing in the app imports it.
 *
 * WHY: the free Groq key allows about 8,000 tokens a minute and 200,000 a day for the whole organisation, and the real
 * extraction prompt costs about 3,400 tokens, so a run is a series of small slices over several minutes and days.
 *
 * - It calls extractWithGroq exactly as smart-router.ts does. That function hides the rate-limit headers and the raw
 *   model text, so a thin fetch tap sits under it and records them; the app code is untouched.
 * - PACING: before each call it waits until Groq's own headers said at least MIN_REMAINING_TOKENS are left in the
 *   minute window (it sleeps for the reset time Groq named). After a 429 it fires nothing more: the run stops at the
 *   first quota answer and never retries.
 * - BUDGET: it sums the tokens Groq reported and stops before a call that could pass GOLDEN_TOKEN_BUDGET.
 * - RESUME: every answer is appended as one JSON line; a re-run skips the ids already answered.
 * - HOLDOUT: its lines go to their own file (answers-holdout.jsonl) that nothing prints; only the report reads it,
 *   and the report holds aggregates for that half (same rule as zz-golden-measure.manual.test.ts).
 * The key is passed in by the caller, never stored here, and every line written is scrubbed of it.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { extractWithGroq } from "@/lib/ai/extraction/groq-extractor";
import type { ExtractedOrder, ExtractionInput, ExtractionResult } from "@/lib/ai/extraction/types";
import {
  groqRetryAfterSeconds,
  readGroqRateLimit,
  scrubGroqSecrets,
  type GroqRateLimitInfo,
} from "@/lib/ai/providers/groq/provider";
import type { GoldenEntry } from "./golden-set";
import { isHoldout } from "./split";

/** Real extraction prompt (about 3,400 tokens) plus the answer. */
export const MIN_REMAINING_TOKENS = 4_000;
export const DEFAULT_TOKEN_BUDGET = 180_000;
const DEFAULT_FALLBACK_GAP_MS = 30_000;
const MAX_WAIT_MS = 120_000;
const RESET_MARGIN_MS = 250;
const MAX_CONSECUTIVE_INFRA = 3;
/** The model answered, but with nothing usable: its fault, so it is a result, not an infrastructure error. */
const UNUSABLE_CODES = new Set(["GROQ_EMPTY_RESPONSE", "GROQ_INVALID_EXTRACTION"]);
/** Retrying cannot help: stop the run. */
const FATAL_CODES = new Set(["GROQ_KEY_MISSING", "GROQ_KEY_INVALID", "GROQ_PERMISSION_DENIED", "GROQ_MODEL_UNAVAILABLE", "GROQ_REQUEST_INVALID"]);

export type LiveKind = "ok" | "infra" | "unusable";

export interface LiveRecord {
  id: string;
  kind: LiveKind;
  at: string;
  latencyMs: number;
  /** Error code when kind is not ok. */
  code?: string;
  status?: number;
  /** Raw model text. */
  answer?: string;
  order?: ExtractedOrder;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  remainingTokens?: number;
  resetTokensSeconds?: number;
}

export const answersFile = (dir: string, half: "dev" | "holdout") => join(dir, `answers-${half}.jsonl`);
const halfOf = (entry: { id: string }) => (isHoldout(entry) ? "holdout" : "dev");

/** Every line of both files, in file order. A line that is not JSON (a cut write) is ignored. */
export function readAllLines(dir: string): LiveRecord[] {
  const lines: LiveRecord[] = [];
  for (const half of ["dev", "holdout"] as const) {
    const file = answersFile(dir, half);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line) as LiveRecord);
      } catch {
        /* a half-written last line */
      }
    }
  }
  return lines;
}

/** Newest line per id wins (a later success replaces an earlier infrastructure error). */
export function latestRecords(lines: readonly LiveRecord[]): Map<string, LiveRecord> {
  const latest = new Map<string, LiveRecord>();
  for (const line of [...lines].sort((a, b) => a.at.localeCompare(b.at))) latest.set(line.id, line);
  return latest;
}

/** An id is done when the model answered (usable or not). An infrastructure error is asked again. */
export const isDone = (record: LiveRecord | undefined) => record !== undefined && record.kind !== "infra";

export const tokensOf = (record: LiveRecord) => (record.promptTokens ?? 0) + (record.completionTokens ?? 0);

/** Message order for a run. Every mode round-robins the languages so a short slice is not all Arabic. */
export type GoldenOrder = "dev-first" | "holdout-last" | "interleaved";

export function orderEntries(entries: readonly GoldenEntry[], mode: GoldenOrder = "interleaved"): GoldenEntry[] {
  const spread = (list: readonly GoldenEntry[]) => {
    const groups = new Map<string, GoldenEntry[]>();
    for (const entry of list) groups.set(entry.language, [...(groups.get(entry.language) ?? []), entry]);
    const queues = [...groups.values()];
    const out: GoldenEntry[] = [];
    for (let round = 0; out.length < list.length; round += 1) {
      for (const queue of queues) {
        const item = queue[round];
        if (item) out.push(item);
      }
    }
    return out;
  };
  const dev = spread(entries.filter((e) => !isHoldout(e)));
  const holdout = spread(entries.filter(isHoldout));
  if (mode !== "interleaved") return [...dev, ...holdout]; // dev-first and holdout-last are the same order
  const out: GoldenEntry[] = [];
  for (let i = 0; i < Math.max(dev.length, holdout.length); i += 1) {
    const d = dev[i];
    const h = holdout[i];
    if (d) out.push(d);
    if (h) out.push(h);
  }
  return out;
}

export function parseOrder(value: string | undefined): GoldenOrder {
  if (value === undefined || value === "") return "interleaved";
  if (value === "dev-first" || value === "holdout-last" || value === "interleaved") return value;
  throw new Error(`GOLDEN_ORDER must be dev-first, holdout-last or interleaved, got ${value}`);
}

/** GOLDEN_ONLY file: ids separated by spaces, commas or lines; a line starting with # is a comment. */
export function parseIdsFile(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join(" ")
    .split(/[\s,]+/)
    .filter(Boolean);
}

export function onlyIds(entries: readonly GoldenEntry[], ids: readonly string[]): GoldenEntry[] {
  const wanted = new Set(ids);
  const known = new Set(entries.map((e) => e.id));
  const missing = [...wanted].filter((id) => !known.has(id));
  if (missing.length) throw new Error(`GOLDEN_ONLY has ${missing.length} id(s) that are not in the golden set`);
  return entries.filter((e) => wanted.has(e.id));
}

/** Reads the key from a file. The error never carries the key. */
export function readApiKeyFile(path: string | undefined): string {
  if (!path) throw new Error("GOLDEN_READER=groq needs GROQ_TEST_API_KEY_FILE (a path, not the key)");
  const key = readFileSync(path, "utf8").trim();
  if (!key) throw new Error("GROQ_TEST_API_KEY_FILE is empty");
  return key;
}

// ---- the tap -----------------------------------------------------------------------------------------------------

export interface TapCall {
  status: number;
  rateLimit: GroqRateLimitInfo;
  retryAfterSeconds: number | null;
  content?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
}

/** Wraps fetch: the caller gets the untouched response, the tap keeps a copy of status, headers and body. */
export function createGroqTap(inner: typeof fetch) {
  let calls: TapCall[] = [];
  const tapped = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const response = await inner(input, init);
    try {
      const body = (await response.clone().json()) as { choices?: Array<{ message?: { content?: unknown } }>; usage?: TapCall["usage"]; model?: string };
      const content = body.choices?.[0]?.message?.content;
      calls.push({
        status: response.status,
        rateLimit: readGroqRateLimit(response.headers),
        retryAfterSeconds: response.status === 429 ? groqRetryAfterSeconds(response.headers) : null,
        ...(typeof content === "string" ? { content } : {}),
        usage: body.usage,
        model: body.model,
      });
    } catch {
      calls.push({ status: response.status, rateLimit: readGroqRateLimit(response.headers), retryAfterSeconds: null });
    }
    return response;
  }) as typeof fetch;
  return {
    fetch: tapped,
    /** The calls since the last drain (more than one when the provider retried a 5xx). */
    drain(): TapCall[] {
      const taken = calls;
      calls = [];
      return taken;
    },
  };
}

// ---- the pacer ---------------------------------------------------------------------------------------------------

export interface PacerOptions {
  minRemainingTokens: number;
  fallbackGapMs: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export function createPacer(options: PacerOptions) {
  let last: { at: number; status: number; remaining?: number; resetMs?: number } | undefined;
  return {
    /** True after a 429: nothing more may be fired. */
    get blocked() {
      return last?.status === 429;
    },
    observe(call: TapCall | undefined, at: number) {
      last = call
        ? { at, status: call.status, remaining: call.rateLimit.remainingTokens, resetMs: call.rateLimit.resetTokensSeconds === undefined ? undefined : call.rateLimit.resetTokensSeconds * 1000 }
        : undefined;
    },
    /** Sleeps until the minute window should hold enough tokens; returns the milliseconds slept. */
    async beforeCall(): Promise<number> {
      if (!last) return 0;
      const elapsed = options.now() - last.at;
      let wait = 0;
      if (last.remaining === undefined) wait = options.fallbackGapMs - elapsed; // Groq sent no budget header
      else if (last.remaining < options.minRemainingTokens) wait = (last.resetMs ?? options.fallbackGapMs) + RESET_MARGIN_MS - elapsed;
      wait = Math.min(Math.max(wait, 0), MAX_WAIT_MS);
      if (wait > 0) await options.sleep(wait);
      return wait;
    },
  };
}

// ---- the run -----------------------------------------------------------------------------------------------------

export type StopReason = "finished" | "limit" | "quota" | "budget" | "fatal" | "infra";

export interface RunOptions {
  entries: readonly GoldenEntry[];
  apiKey: string;
  dir: string;
  tokenBudget?: number;
  /** Most NEW calls in this run. */
  limit?: number;
  minRemainingTokens?: number;
  fallbackGapMs?: number;
  /** Tokens assumed for the next call when none has been seen yet. */
  callEstimateTokens?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Defaults to extractWithGroq, the function smart-router.ts calls. */
  extractor?: (input: ExtractionInput, options: { apiKey: string }) => Promise<ExtractionResult>;
  /** Aggregate progress lines only (no id, no text). */
  log?: (line: string) => void;
}

export interface RunSummary {
  stopped: StopReason;
  calls: number;
  alreadyDone: number;
  remaining: number;
  tokensThisRun: number;
  tokensTotal: number;
  waitedMs: number;
}

export async function runGroqSlice(options: RunOptions): Promise<RunSummary> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const budget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
  const extractor = options.extractor ?? extractWithGroq;
  const log = options.log ?? (() => {});
  mkdirSync(options.dir, { recursive: true });

  const lines = readAllLines(options.dir);
  const latest = latestRecords(lines);
  let tokensTotal = lines.reduce((sum, line) => sum + tokensOf(line), 0);
  let biggestCall = lines.reduce((max, line) => Math.max(max, tokensOf(line)), 0);
  const todo = options.entries.filter((entry) => !isDone(latest.get(entry.id)));
  const alreadyDone = options.entries.length - todo.length;

  const pacer = createPacer({
    minRemainingTokens: options.minRemainingTokens ?? MIN_REMAINING_TOKENS,
    fallbackGapMs: options.fallbackGapMs ?? DEFAULT_FALLBACK_GAP_MS,
    now,
    sleep,
  });
  const realFetch = globalThis.fetch;
  const tap = createGroqTap(realFetch);
  let calls = 0;
  let tokensThisRun = 0;
  let waitedMs = 0;
  let consecutiveInfra = 0;
  let stopped: StopReason = "finished";

  globalThis.fetch = tap.fetch;
  try {
    for (const entry of todo) {
      if (options.limit !== undefined && calls >= options.limit) {
        stopped = "limit";
        break;
      }
      if (tokensTotal + Math.max(biggestCall, options.callEstimateTokens ?? MIN_REMAINING_TOKENS) > budget) {
        stopped = "budget";
        break;
      }
      waitedMs += await pacer.beforeCall();

      tap.drain();
      const startedAt = now();
      const result = await extractor({ body: entry.text }, { apiKey: options.apiKey });
      const latencyMs = now() - startedAt;
      const tapCalls = tap.drain();
      const finalCall = tapCalls[tapCalls.length - 1];
      pacer.observe(finalCall, now());
      calls += 1;

      const code = result.order === null ? result.missingFields?.[0] : undefined;
      const answerCall = [...tapCalls].reverse().find((c) => c.content !== undefined);
      const usage = [...tapCalls].reverse().find((c) => c.usage)?.usage;
      const record: LiveRecord = {
        id: entry.id,
        kind: result.order !== null ? "ok" : UNUSABLE_CODES.has(code ?? "") ? "unusable" : "infra",
        at: new Date(now()).toISOString(),
        latencyMs,
        ...(code ? { code } : {}),
        ...(finalCall ? { status: finalCall.status } : {}),
        ...(answerCall?.content !== undefined ? { answer: answerCall.content } : {}),
        ...(result.order ? { order: result.order } : {}),
        ...(answerCall?.model ? { model: answerCall.model } : {}),
        ...(usage ? { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 } : {}),
        ...(finalCall?.rateLimit.remainingTokens !== undefined ? { remainingTokens: finalCall.rateLimit.remainingTokens } : {}),
        ...(finalCall?.rateLimit.resetTokensSeconds !== undefined ? { resetTokensSeconds: finalCall.rateLimit.resetTokensSeconds } : {}),
      };
      appendFileSync(answersFile(options.dir, halfOf(entry)), `${scrubGroqSecrets(JSON.stringify(record), options.apiKey)}\n`);
      tokensThisRun += tokensOf(record);
      tokensTotal += tokensOf(record);
      biggestCall = Math.max(biggestCall, tokensOf(record));
      log(`call ${calls}: ${record.kind}${code ? ` ${code}` : ""}, tokens so far ${tokensTotal}/${budget}`);

      if (pacer.blocked || code === "GROQ_QUOTA_EXHAUSTED") {
        stopped = "quota"; // the first quota answer ends the run; waiting is the next run's job
        break;
      }
      if (record.kind === "infra" && FATAL_CODES.has(code ?? "")) {
        stopped = "fatal";
        break;
      }
      consecutiveInfra = record.kind === "infra" ? consecutiveInfra + 1 : 0;
      if (consecutiveInfra >= MAX_CONSECUTIVE_INFRA) {
        stopped = "infra";
        break;
      }
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  const doneNow = options.entries.filter((entry) => isDone(latestRecords(readAllLines(options.dir)).get(entry.id))).length;
  return { stopped, calls, alreadyDone, remaining: options.entries.length - doneNow, tokensThisRun, tokensTotal, waitedMs };
}
