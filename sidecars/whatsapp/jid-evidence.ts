/**
 * "How customers arrive": counts, never ids (identity design, slice 1).
 *
 * WhatsApp now hides the phone number of some customers behind an "@lid" id.
 * Before deciding how to merge such a customer with the same person reached by
 * phone, we measure three things for about a week:
 *   1. of the customer messages that arrive from an @lid, how many carry a
 *      number hint (the frame's `sender_pn`): yes/no only, the hint itself is
 *      never read beyond "is it a phone address";
 *   2. how many `chats.phoneNumberShare` events the provider emits;
 *   3. how many history chats carry BOTH a phone id and an @lid id.
 *
 * Privacy contract: only integers are stored, logged and exposed. No id, name,
 * text or key enters the counters; payloads are inspected for presence only.
 * Every entry point swallows its own errors: counting must never disturb the
 * WhatsApp connection.
 *
 * Kept free of the provider socket so it can be tested.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { diagnostics, type DiagnosticsSink } from "./diagnostics-log";

const FORMAT_VERSION = 1;
const PERSIST_EVERY_MS = 30_000;
const REPORT_EVERY_MS = 10 * 60_000;
const PHONE_JID_SUFFIX = "@s.whatsapp.net";

export interface JidEvidenceSummary {
  v: 1;
  /** Customer messages that arrived from a hidden (@lid) id. */
  lidMessages: { total: number; withNumberHint: number; withoutNumberHint: number };
  phoneNumberShareEvents: number;
  /** History chats the provider listed on (re)link. */
  historyChats: { seen: number; withBothIds: number };
}

export interface JidEvidence {
  /** The hint (true/false) for an @lid customer message frame; null when the frame is not one. Never throws. */
  observeMessageFrame(node: unknown): boolean | null;
  /** One `chats.phoneNumberShare` event. The payload is not read. */
  recordPhoneNumberShare(payload?: unknown): void;
  observeHistoryChats(chats: unknown): void;
  summary(): JidEvidenceSummary;
  /** Write the counters file now if something changed. */
  flush(): void;
}

export interface JidEvidenceOptions {
  /** Where the totals survive a restart. Omit for memory only (tests). */
  file?: string | undefined;
  diagnostics?: DiagnosticsSink | undefined;
  now?: (() => number) | undefined;
}

function zero(): JidEvidenceSummary {
  return {
    v: FORMAT_VERSION,
    lidMessages: { total: 0, withNumberHint: 0, withoutNumberHint: 0 },
    phoneNumberShareEvents: 0,
    historyChats: { seen: 0, withBothIds: 0 },
  };
}

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

/** A missing, unreadable or foreign file means "start from zero". */
function readSaved(file: string | undefined): JidEvidenceSummary {
  if (!file) return zero();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<JidEvidenceSummary> | null;
    const lid = raw?.lidMessages;
    const history = raw?.historyChats;
    if (
      raw?.v !== FORMAT_VERSION ||
      !lid ||
      !history ||
      !count(lid.total) ||
      !count(lid.withNumberHint) ||
      !count(lid.withoutNumberHint) ||
      !count(raw.phoneNumberShareEvents) ||
      !count(history.seen) ||
      !count(history.withBothIds)
    ) {
      return zero();
    }
    return {
      v: FORMAT_VERSION,
      lidMessages: { total: lid.total, withNumberHint: lid.withNumberHint, withoutNumberHint: lid.withoutNumberHint },
      phoneNumberShareEvents: raw.phoneNumberShareEvents,
      historyChats: { seen: history.seen, withBothIds: history.withBothIds },
    };
  } catch {
    return zero();
  }
}

const isPhoneAddress = (value: unknown): boolean =>
  typeof value === "string" && value.length > PHONE_JID_SUFFIX.length && value.endsWith(PHONE_JID_SUFFIX);

export function createJidEvidence(options: JidEvidenceOptions = {}): JidEvidence {
  const now = options.now ?? Date.now;
  const totals = readSaved(options.file);
  let dirty = false;
  let lastWriteAt = Number.NEGATIVE_INFINITY;
  let changedSinceReport = false;
  let lastReportAt = Number.NEGATIVE_INFINITY;

  function write(): void {
    const file = options.file;
    if (!file) {
      dirty = false;
      return;
    }
    lastWriteAt = now();
    try {
      mkdirSync(dirname(file), { recursive: true });
      const temporary = `${file}.tmp`;
      writeFileSync(temporary, JSON.stringify(totals), { encoding: "utf8", mode: 0o600 });
      renameSync(temporary, file);
      try {
        chmodSync(file, 0o600);
      } catch {
        // Windows ACLs remain authoritative when POSIX chmod is unavailable.
      }
      dirty = false;
    } catch {
      // A locked or full disk must never reach the connection; the counts stay in memory.
      dirty = true;
    }
  }

  function report(): void {
    if (!options.diagnostics || !changedSinceReport || now() - lastReportAt < REPORT_EVERY_MS) return;
    lastReportAt = now();
    changedSinceReport = false;
    options.diagnostics.record("identity.evidence", {
      lidMessages: totals.lidMessages.total,
      lidWithHint: totals.lidMessages.withNumberHint,
      lidWithoutHint: totals.lidMessages.withoutNumberHint,
      phoneShares: totals.phoneNumberShareEvents,
      historyChats: totals.historyChats.seen,
      historyBoth: totals.historyChats.withBothIds,
    });
  }

  function changed(): void {
    dirty = true;
    changedSinceReport = true;
    if (now() - lastWriteAt >= PERSIST_EVERY_MS) write();
    report();
  }

  return {
    observeMessageFrame(node) {
      try {
        if (typeof node !== "object" || node === null) return null;
        const attrs = (node as { attrs?: unknown }).attrs;
        if (typeof attrs !== "object" || attrs === null) return null;
        const fields = attrs as Record<string, unknown>;
        const from = fields.from;
        if (typeof from !== "string" || !from.endsWith("@lid")) return null;
        // A `recipient` means the seller's own device wrote this: not a customer.
        if (fields.recipient !== undefined) return null;
        const hint = isPhoneAddress(fields.sender_pn);
        totals.lidMessages.total += 1;
        if (hint) totals.lidMessages.withNumberHint += 1;
        else totals.lidMessages.withoutNumberHint += 1;
        changed();
        return hint;
      } catch {
        return null;
      }
    },
    recordPhoneNumberShare() {
      try {
        totals.phoneNumberShareEvents += 1;
        changed();
      } catch {
        // Counting is best effort.
      }
    },
    observeHistoryChats(chats) {
      try {
        if (!Array.isArray(chats)) return;
        let touched = false;
        for (const chat of chats) {
          try {
            if (typeof chat !== "object" || chat === null) continue;
            const { pnJid, lidJid } = chat as { pnJid?: unknown; lidJid?: unknown };
            const both = typeof pnJid === "string" && pnJid.length > 0 && typeof lidJid === "string" && lidJid.length > 0;
            totals.historyChats.seen += 1;
            if (both) totals.historyChats.withBothIds += 1;
            touched = true;
          } catch {
            // One unreadable chat must not stop the others.
          }
        }
        if (touched) changed();
      } catch {
        // Counting is best effort.
      }
    },
    summary() {
      return {
        v: FORMAT_VERSION,
        lidMessages: { ...totals.lidMessages },
        phoneNumberShareEvents: totals.phoneNumberShareEvents,
        historyChats: { ...totals.historyChats },
      };
    },
    flush() {
      if (dirty) write();
    },
  };
}

/** Run a listener body so that nothing it does can reach the connection. */
function guarded(body: () => void): void {
  try {
    body();
  } catch {
    // Counting must never disturb the connection.
  }
}

/** Register the three provider signals on a socket. Safe on any shape of socket. */
export function attachJidEvidence(sock: { ws?: unknown; ev?: unknown }, evidence: JidEvidence): void {
  guarded(() => {
    const ws = sock.ws as { on?: unknown } | null | undefined;
    if (ws && typeof ws.on === "function") {
      (ws as { on: (event: string, listener: (node: unknown) => void) => unknown }).on("CB:message", (node) =>
        guarded(() => void evidence.observeMessageFrame(node)),
      );
    }
    const ev = sock.ev as { on?: unknown } | null | undefined;
    if (ev && typeof ev.on === "function") {
      const on = (ev as { on: (event: string, listener: (payload: unknown) => void) => unknown }).on.bind(ev);
      on("chats.phoneNumberShare", (payload) => guarded(() => evidence.recordPhoneNumberShare(payload)));
      on("messaging-history.set", (history) =>
        guarded(() => evidence.observeHistoryChats((history as { chats?: unknown } | null)?.chats)),
      );
    }
  });
}

/** The single evidence recorder for this sidecar process (memory only under tests). */
export const jidEvidence: JidEvidence = createJidEvidence(
  process.env.VITEST
    ? {}
    : {
        file: join(process.env.SF_DATA_DIR ?? join(process.cwd(), "data"), "whatsapp-jid-evidence.json"),
        diagnostics,
      },
);
