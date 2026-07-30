import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const DATA_DIR = process.env.SF_DATA_DIR ?? join(process.cwd(), "data");
const RECEIPT_FILE = resolve(DATA_DIR, "whatsapp-send-receipts.json");
const MAX_RECEIPTS = 10_000;

export interface DurableSendReceipt {
  requestBinding: string;
  id: string;
  status: string;
  completedAt: string;
}

type ReceiptJournal = Record<string, DurableSendReceipt>;

export interface DurableSendReceiptJournal {
  find(effectKey: string, requestBinding: string): DurableSendReceipt | null;
  record(effectKey: string, receipt: DurableSendReceipt): void;
}

export function createDurableSendReceiptJournal(
  receiptFile = RECEIPT_FILE,
): DurableSendReceiptJournal {
  let journal: ReceiptJournal | null = null;

  function loadJournal(): ReceiptJournal {
    if (journal) return journal;
    if (!existsSync(receiptFile)) {
      journal = {};
      return journal;
    }
    try {
      const parsed = JSON.parse(readFileSync(receiptFile, "utf8")) as unknown;
      journal = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as ReceiptJournal
        : {};
    } catch {
      // A corrupt receipt journal must not authorize a duplicate send. The
      // endpoint reports an ambiguous failure until the operator inspects it.
      throw new Error("WhatsApp send receipt journal is unreadable");
    }
    return journal;
  }

  function persistJournal(value: ReceiptJournal): void {
    mkdirSync(dirname(receiptFile), { recursive: true });
    const temp = `${receiptFile}.tmp`;
    writeFileSync(temp, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, receiptFile);
    try { chmodSync(receiptFile, 0o600); } catch { /* Windows ACL is authoritative */ }
  }

  return {
    find(effectKey, requestBinding) {
      const receipt = loadJournal()[effectKey];
      if (!receipt) return null;
      if (receipt.requestBinding !== requestBinding) {
        throw new Error("WhatsApp effect key is already bound to different content");
      }
      return receipt;
    },
    record(effectKey, receipt) {
      const current = loadJournal();
      const existing = current[effectKey];
      if (existing) {
        if (existing.requestBinding !== receipt.requestBinding) {
          throw new Error("WhatsApp effect key is already bound to different content");
        }
        return;
      }
      const next: ReceiptJournal = { ...current, [effectKey]: receipt };
      const keys = Object.keys(next);
      if (keys.length > MAX_RECEIPTS) {
        keys
          .sort((left, right) => next[left]!.completedAt.localeCompare(next[right]!.completedAt))
          .slice(0, keys.length - MAX_RECEIPTS)
          .forEach((key) => delete next[key]);
      }
      persistJournal(next);
      journal = next;
    },
  };
}

const durableReceiptJournal = createDurableSendReceiptJournal();

export function deterministicWhatsAppMessageId(effectKey: string): string {
  return createHash("sha256")
    .update("sahelflow-whatsapp-message-v1\0")
    .update(effectKey)
    .digest("hex")
    .slice(0, 20)
    .toUpperCase();
}

export function findDurableSendReceipt(
  effectKey: string,
  requestBinding: string,
): DurableSendReceipt | null {
  return durableReceiptJournal.find(effectKey, requestBinding);
}

export function recordDurableSendReceipt(
  effectKey: string,
  receipt: DurableSendReceipt,
): void {
  durableReceiptJournal.record(effectKey, receipt);
}
