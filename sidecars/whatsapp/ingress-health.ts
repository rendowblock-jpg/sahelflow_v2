/**
 * "Ingress health": numbers and times about the WhatsApp inbound path, added
 * to the sidecar's /status answer. The sidecar only MEASURES here; the app
 * decides what the numbers mean, so a threshold can change without a new
 * sidecar build.
 *
 * Counts and times only. No phone number, chat id, name, message text or key
 * ever enters this module: the recorder is told a kind ("phone" or "lid") and
 * a loss reason, never the message.
 *
 * Kept free of the HTTP server and the provider socket so it can be tested.
 */
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import type { WhatsAppInboundSpoolSnapshot } from "./inbound-spool";

const FORMAT_VERSION = 1;
// The spool snapshot lists the quarantine folder synchronously. However often
// /status is asked, that listing happens at most once per this window.
const SPOOL_CACHE_MS = 10_000;
// The counters file is rewritten at most this often, except on a loss.
const PERSIST_EVERY_MS = 30_000;
// A failure code is a short token such as APP_INGRESS_TIMEOUT or HTTP_503.
// Anything else is not a code and is not repeated.
const FAILURE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;

export type IngressLossKind =
  | "spoolFailed"
  | "noPairedAccount"
  | "quarantinePruned"
  // A customer message from a group, status or broadcast list: skipped on
  // purpose, but the seller must be able to see that it was.
  | "unsupportedChat";
export type IngressJidKind = "phone" | "lid" | "other";

/** What the health block needs from the spool. */
export interface IngressSpoolView {
  snapshot(): WhatsAppInboundSpoolSnapshot;
  lastFailureCode(): string | null;
}

/** What the inbound gate needs from the health recorder. */
export interface IngressRecorder {
  recordLost(kind: IngressLossKind, count?: number): void;
  recordSpooled(info: { fromMe: boolean; kind: IngressJidKind }): void;
}

export interface IngressHealthBlock {
  v: 1;
  sampledAt: string;
  spool: {
    pending: number;
    oldestPendingSec: number | null;
    retrying: number;
    stuck: number;
    heldByApp: number;
    quarantined: number;
    unreadable: number;
    lastFailureCode: string | null;
  };
  lost: {
    sinceStart: { spoolFailed: number; noPairedAccount: number; unsupportedChat: number };
    total: {
      spoolFailed: number;
      noPairedAccount: number;
      quarantinePruned: number;
      unsupportedChat: number;
    };
    lastAt: string | null;
  };
  /** Decrypt stubs: information only. The real message arrives again, so this is not a loss. */
  undecryptable: { sinceStart: number };
  inbound: {
    lastSpooledAt: string | null;
    lastCommittedAt: string | null;
    /** Customer messages seen since start, by kind of chat address. */
    kinds: { phone: number; lid: number };
  };
}

export interface IngressHealth extends IngressRecorder {
  recordCommitted(): void;
  recordUndecryptable(count?: number): void;
  build(): IngressHealthBlock;
  /** Write the counters file now if something changed. */
  flush(): void;
}

export interface IngressHealthOptions {
  /** Where the loss counters and last-message times survive a restart. */
  file: string;
  /** The spool, looked up when needed (it is created after this module). */
  spool: () => IngressSpoolView | null;
  now?: () => number;
}

interface Saved {
  lost: {
    spoolFailed: number;
    noPairedAccount: number;
    quarantinePruned: number;
    unsupportedChat: number;
  };
  lastLostAt: string | null;
  lastSpooledAt: string | null;
  lastCommittedAt: string | null;
}

function emptySaved(): Saved {
  return {
    lost: { spoolFailed: 0, noPairedAccount: 0, quarantinePruned: 0, unsupportedChat: 0 },
    lastLostAt: null,
    lastSpooledAt: null,
    lastCommittedAt: null,
  };
}

function savedCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function savedTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** A missing, damaged or unknown-version file means "start from zero". Never throws. */
function readSaved(file: string): Saved {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptySaved();
    const record = parsed as Record<string, unknown>;
    if (record.v !== FORMAT_VERSION) return emptySaved();
    const lost = (record.lost && typeof record.lost === "object" ? record.lost : {}) as Record<string, unknown>;
    return {
      lost: {
        spoolFailed: savedCount(lost.spoolFailed),
        noPairedAccount: savedCount(lost.noPairedAccount),
        quarantinePruned: savedCount(lost.quarantinePruned),
        unsupportedChat: savedCount(lost.unsupportedChat),
      },
      lastLostAt: savedTime(record.lastLostAt),
      lastSpooledAt: savedTime(record.lastSpooledAt),
      lastCommittedAt: savedTime(record.lastCommittedAt),
    };
  } catch {
    return emptySaved();
  }
}

const ZERO_SPOOL: IngressHealthBlock["spool"] = {
  pending: 0,
  oldestPendingSec: null,
  retrying: 0,
  stuck: 0,
  heldByApp: 0,
  quarantined: 0,
  unreadable: 0,
  lastFailureCode: null,
};

export function createIngressHealth(options: IngressHealthOptions): IngressHealth {
  const now = options.now ?? Date.now;
  const iso = (ms: number): string => new Date(ms).toISOString();

  const saved = readSaved(options.file);
  const total = { ...saved.lost };
  const sinceStart = { spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 0 };
  const kinds = { phone: 0, lid: 0 };
  let undecryptable = 0;
  let lastLostAt = saved.lastLostAt;
  let lastSpooledAt = saved.lastSpooledAt;
  let lastCommittedAt = saved.lastCommittedAt;

  let dirty = false;
  let lastWriteAt = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cached: { at: number; spool: IngressHealthBlock["spool"] } | null = null;

  function write(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    dirty = false;
    lastWriteAt = now();
    try {
      mkdirSync(dirname(options.file), { recursive: true });
      const temporary = `${options.file}.tmp`;
      writeFileSync(
        temporary,
        JSON.stringify({
          v: FORMAT_VERSION,
          lost: total,
          lastLostAt,
          lastSpooledAt,
          lastCommittedAt,
        } satisfies Saved & { v: number }),
        { encoding: "utf8", mode: 0o600 },
      );
      renameSync(temporary, options.file);
      try {
        chmodSync(options.file, 0o600);
      } catch {
        // Windows ACLs remain authoritative when POSIX chmod is unavailable.
      }
    } catch {
      // A locked or full disk must never reach the inbound path. The counts
      // stay in memory and the next change tries again.
      dirty = true;
    }
  }

  function touch(): void {
    dirty = true;
    const wait = PERSIST_EVERY_MS - (now() - lastWriteAt);
    if (wait <= 0) {
      write();
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (dirty) write();
    }, wait);
    timer.unref?.();
  }

  function readSpool(): IngressHealthBlock["spool"] {
    const t = now();
    if (cached && t >= cached.at && t - cached.at < SPOOL_CACHE_MS) return cached.spool;
    try {
      const view = options.spool();
      if (!view) return cached?.spool ?? ZERO_SPOOL;
      const snapshot = view.snapshot();
      const code = view.lastFailureCode();
      const spool = {
        pending: snapshot.pending,
        oldestPendingSec: snapshot.oldestPendingSec,
        retrying: snapshot.retrying,
        stuck: snapshot.stuck,
        heldByApp: snapshot.appHeld,
        quarantined: snapshot.quarantined,
        unreadable: snapshot.unreadable,
        lastFailureCode: typeof code === "string" && FAILURE_CODE.test(code) ? code : null,
      };
      cached = { at: t, spool };
      return spool;
    } catch {
      // Unknown is not an alarm: show the last good numbers, or zeros.
      return cached?.spool ?? ZERO_SPOOL;
    }
  }

  return {
    recordLost(kind, count = 1) {
      const n = Number.isSafeInteger(count) && count > 0 ? count : 1;
      total[kind] += n;
      if (kind !== "quarantinePruned") sinceStart[kind] += n;
      lastLostAt = iso(now());
      // A restart must not erase the evidence of a loss: write at once.
      dirty = true;
      write();
    },
    recordSpooled({ fromMe, kind }) {
      // A phone echo is the seller's own message, not a customer message.
      if (fromMe) return;
      if (kind === "phone" || kind === "lid") kinds[kind] += 1;
      lastSpooledAt = iso(now());
      touch();
    },
    recordCommitted() {
      lastCommittedAt = iso(now());
      touch();
    },
    recordUndecryptable(count = 1) {
      undecryptable += Number.isSafeInteger(count) && count > 0 ? count : 1;
    },
    build() {
      const t = now();
      return {
        v: FORMAT_VERSION,
        sampledAt: iso(t),
        spool: readSpool(),
        lost: {
          sinceStart: { ...sinceStart },
          total: { ...total },
          lastAt: lastLostAt,
        },
        undecryptable: { sinceStart: undecryptable },
        inbound: { lastSpooledAt, lastCommittedAt, kinds: { ...kinds } },
      };
    },
    flush() {
      if (dirty) write();
    },
  };
}
