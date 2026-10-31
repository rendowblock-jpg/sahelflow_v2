/**
 * Held-out accuracy scorer (PB-EXTRACTION-GOLDEN-SET).
 *
 * Per field: correct / wrong / missed over the messages that STATE the field,
 * a Wilson 95% interval, and how many messages a 99.5% claim would need.
 * A value the reader produced where the message states nothing is counted
 * apart as "spurious" (out of the messages that state nothing).
 */
import type { ExtractedItem, ExtractedOrder } from "@/lib/ai/extraction/types";
import { fold, messagesNeededForClaim, wilsonInterval } from "./wilson";

export { fold, messagesNeededForClaim, wilsonInterval };

export type HeldoutField = "phone" | "wilaya" | "commune" | "productQty" | "productQtyLenient" | "total";
export const HELDOUT_FIELDS: readonly HeldoutField[] = ["phone", "wilaya", "commune", "productQty", "productQtyLenient", "total"];
export const CLAIM_TARGET = 0.995;

export interface HeldoutItem {
  productName: string;
  quantity: number;
}
export interface HeldoutExpected {
  isOrder: boolean;
  phone?: string;
  wilaya?: string;
  commune?: string;
  items?: HeldoutItem[];
  totalPrice?: number;
}
export interface HeldoutEntry {
  id: string;
  group: string;
  text: string;
  expected: HeldoutExpected;
}
export interface Reading {
  predictedOrder: boolean;
  order: ExtractedOrder | null;
}
export type Verdict = "correct" | "wrong" | "missed" | "spurious" | "absent";
export interface Tally {
  stated: number;
  correct: number;
  wrong: number;
  missed: number;
  unstated: number;
  spurious: number;
}
export interface HeldoutFailure {
  id: string;
  field: string;
  verdict: Verdict;
  expected: string;
  got: string;
}
export interface HeldoutScore {
  entries: number;
  tallies: Record<HeldoutField, Tally>;
  detection: Tally;
  failures: HeldoutFailure[];
}

export function emptyTally(): Tally {
  return { stated: 0, correct: 0, wrong: 0, missed: 0, unstated: 0, spurious: 0 };
}

export function addVerdict(tally: Tally, verdict: Verdict): void {
  if (verdict === "absent") tally.unstated += 1;
  else if (verdict === "spurious") {
    tally.unstated += 1;
    tally.spurious += 1;
  } else {
    tally.stated += 1;
    tally[verdict] += 1;
  }
}

function judgeText(want: string | undefined, have: string | undefined, same: (a: string, b: string) => boolean): Verdict {
  const got = have === undefined || have === "" ? undefined : have;
  if (want === undefined) return got === undefined ? "absent" : "spurious";
  if (got === undefined) return "missed";
  return same(want, got) ? "correct" : "wrong";
}

function nameMatches(want: string, have: string, lenient: boolean): boolean {
  const a = fold(want);
  const b = fold(have);
  if (a.length > 0 && a === b) return true;
  return lenient && Math.min(a.length, b.length) >= 3 && (a.includes(b) || b.includes(a));
}

function judgeItems(want: HeldoutItem[] | undefined, have: ExtractedItem[] | undefined, lenient: boolean): Verdict {
  const wanted = want ?? [];
  const got = have ?? [];
  if (wanted.length === 0) return got.length > 0 ? "spurious" : "absent";
  if (got.length === 0) return "missed";
  if (wanted.length !== got.length) return "wrong";
  const used = new Set<number>();
  for (const w of wanted) {
    let found = -1;
    for (let i = 0; i < got.length; i++) {
      const item = got[i];
      if (!item || used.has(i) || item.quantity !== w.quantity) continue;
      if (!nameMatches(w.productName, item.productName, lenient)) continue;
      found = i;
      break;
    }
    if (found < 0) return "wrong";
    used.add(found);
  }
  return "correct";
}

export function judgeField(field: HeldoutField, expected: HeldoutExpected, got: ExtractedOrder | null): Verdict {
  switch (field) {
    case "phone":
      return judgeText(expected.phone, got?.phone?.replace(/\D/g, ""), (a, b) => a === b);
    case "wilaya":
      return judgeText(expected.wilaya, got?.wilaya, (a, b) => fold(a) === fold(b));
    case "commune":
      return judgeText(expected.commune, got?.commune, (a, b) => fold(a) === fold(b));
    case "productQty":
      return judgeItems(expected.items, got?.items, false);
    case "productQtyLenient":
      return judgeItems(expected.items, got?.items, true);
    case "total": {
      const have = got?.totalPrice;
      if (expected.totalPrice === undefined) return have === undefined ? "absent" : "spurious";
      if (have === undefined) return "missed";
      return have === expected.totalPrice ? "correct" : "wrong";
    }
  }
}

function describeField(field: HeldoutField, o: HeldoutExpected | ExtractedOrder | null): string {
  if (!o) return "none";
  if (field === "productQty" || field === "productQtyLenient") {
    return (o.items ?? []).map((i) => `${i.quantity}x ${i.productName}`).join(" + ") || "none";
  }
  const value = field === "total" ? o.totalPrice : o[field];
  return value === undefined ? "none" : String(value);
}

export function scoreHeldout(entries: readonly HeldoutEntry[], read: (text: string) => Reading): HeldoutScore {
  const tallies = {} as Record<HeldoutField, Tally>;
  for (const field of HELDOUT_FIELDS) tallies[field] = emptyTally();
  const detection = emptyTally();
  const failures: HeldoutFailure[] = [];
  for (const entry of entries) {
    const reading = read(entry.text);
    for (const field of HELDOUT_FIELDS) {
      const verdict = judgeField(field, entry.expected, reading.order);
      addVerdict(tallies[field], verdict);
      if (verdict === "wrong" || verdict === "missed" || verdict === "spurious") {
        failures.push({ id: entry.id, field, verdict, expected: describeField(field, entry.expected), got: describeField(field, reading.order) });
      }
    }
    const detected: Verdict = entry.expected.isOrder ? (reading.predictedOrder ? "correct" : "missed") : reading.predictedOrder ? "spurious" : "absent";
    addVerdict(detection, detected);
    if (detected === "missed" || detected === "spurious") {
      failures.push({ id: entry.id, field: "isOrder", verdict: detected, expected: String(entry.expected.isOrder), got: String(reading.predictedOrder) });
    }
  }
  return { entries: entries.length, tallies, detection, failures };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function formatFieldLine(field: string, t: Tally): string {
  const head = `${field.padEnd(18)}stated ${t.stated} | correct ${t.correct} | wrong ${t.wrong} | missed ${t.missed}`;
  let middle = "accuracy n/a | Wilson95 n/a";
  if (t.stated > 0) {
    const w = wilsonInterval(t.correct, t.stated);
    middle = `accuracy ${pct(t.correct / t.stated)} | Wilson95 [${pct(w.low)}, ${pct(w.high)}]`;
  }
  return `${head} | ${middle} | spurious ${t.spurious}/${t.unstated}`;
}

export function formatReport(score: HeldoutScore, label = "HELD-OUT SET"): string {
  const lines: string[] = [`${label}: ${score.entries} messages`];
  for (const field of HELDOUT_FIELDS) lines.push(formatFieldLine(field, score.tallies[field]));
  lines.push(formatFieldLine("isOrder(detect)", score.detection));
  const clean = messagesNeededForClaim(CLAIM_TARGET, 1);
  lines.push(`99.5% claim: zero errors need ${clean} messages per field (Wilson95 lower bound)`);
  for (const field of HELDOUT_FIELDS) {
    const t = score.tallies[field];
    const n = t.stated === 0 ? null : messagesNeededForClaim(CLAIM_TARGET, t.correct / t.stated);
    lines.push(`  ${field}: ${n === null ? "not reachable at the observed accuracy" : `${n} messages at the observed accuracy`}`);
  }
  return lines.join("\n");
}

/**
 * Running number = position in the array, starting at 1. Odd = DIAG (the half
 * a failure may be read from), even = SEALED (the half the claim rests on).
 */
export function splitHeldout(entries: readonly HeldoutEntry[]): { diag: HeldoutEntry[]; sealed: HeldoutEntry[] } {
  const diag: HeldoutEntry[] = [];
  const sealed: HeldoutEntry[] = [];
  entries.forEach((entry, index) => {
    if ((index + 1) % 2 === 1) diag.push(entry);
    else sealed.push(entry);
  });
  return { diag, sealed };
}

/** Per-field report of each half. Only the DIAG failures are handed out. */
export function splitReports(
  entries: readonly HeldoutEntry[],
  read: (text: string) => Reading,
): { diag: string; sealed: string; diagFailures: HeldoutFailure[] } {
  const { diag, sealed } = splitHeldout(entries);
  const diagScore = scoreHeldout(diag, read);
  const sealedScore = scoreHeldout(sealed, read);
  return {
    diag: formatReport(diagScore, "DIAG half (odd running numbers)"),
    sealed: formatReport(sealedScore, "SEALED half (even running numbers)"),
    diagFailures: diagScore.failures,
  };
}
