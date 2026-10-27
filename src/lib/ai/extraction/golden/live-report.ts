/**
 * Report over a live Groq run (see live-groq.ts). Built only from the JSON lines, no network.
 *
 * For the messages Groq has answered so far it scores the live answers and, on EXACTLY the same ids, the offline
 * reader, with the same scoring code as the manual baseline (scoring.ts), so a partial slice is still a fair
 * comparison. Messages not asked yet, answered with nothing usable, or lost to an infrastructure error are counted
 * and never scored as wrong.
 *
 * HOLDOUT RULE: the holdout half appears only as aggregates (counts, percentages). No id, no text, no answer, no
 * failure list. The text form that scripts print has no message id for either half.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { GOLDEN_SET, GOLDEN_SET_VERSION, type GoldenEntry } from "./golden-set";
import { type LiveRecord, latestRecords, readAllLines, tokensOf } from "./live-groq";
import { offlineReading, scoreSplit, table, type Reading } from "./scoring";
import { isHoldout } from "./split";

const HEADLINE = ["isOrder", "productAndQuantity", "phone"] as const;
type Cell = ReturnType<typeof table>[string];

export interface ReaderBlock {
  fields: Record<string, Cell>;
  byLanguage: Record<string, Record<string, Cell>>;
  criticalEntries: number;
  fullyCorrectEntries: number;
}

export interface HalfReport {
  half: "dev" | "holdout";
  entries: number;
  answered: number;
  unusable: number;
  infraErrors: number;
  notAsked: number;
  orders: number;
  notOrders: number;
  live: ReaderBlock;
  offline: ReaderBlock;
  /** Dev only: where the live reader fails. Never present for the holdout. */
  failureShapes?: Array<{ shape: string; count: number; exampleIds: string[] }>;
}

export interface LiveReport {
  goldenVersion: string;
  generatedAt: string;
  calls: number;
  tokens: { prompt: number; completion: number; total: number; perCall: number | null };
  latencyMs: { calls: number; p50: number | null; p90: number | null; max: number | null };
  infraErrorsByCode: Record<string, number>;
  dev: HalfReport;
  holdout: HalfReport;
}

function block(score: ReturnType<typeof scoreSplit>, entries: readonly GoldenEntry[]): ReaderBlock {
  const byLanguage = Object.fromEntries(
    Object.entries(score.byLanguage).map(([language, tallies]) => [language, Object.fromEntries(Object.entries(table(tallies)).filter(([field]) => (HEADLINE as readonly string[]).includes(field)))]),
  );
  return {
    fields: table(score.overall),
    byLanguage,
    criticalEntries: score.criticalEntries.size,
    fullyCorrectEntries: entries.filter((e) => score.entryClean.get(e.id) === true).length,
  };
}

function half(label: "dev" | "holdout", all: readonly GoldenEntry[], latest: Map<string, LiveRecord>): HalfReport {
  const entries = all.filter((e) => isHoldout(e) === (label === "holdout"));
  const answeredEntries = entries.filter((e) => latest.get(e.id)?.kind === "ok");
  const readLive = (entry: GoldenEntry): Reading | null => {
    const order = latest.get(entry.id)?.order;
    return order ? { predictedOrder: order.items.length > 0, got: order } : null;
  };
  const live = scoreSplit(answeredEntries, readLive);
  const offline = scoreSplit(answeredEntries, offlineReading);
  const kinds = entries.map((e) => latest.get(e.id)?.kind);
  const report: HalfReport = {
    half: label,
    entries: entries.length,
    answered: answeredEntries.length,
    unusable: kinds.filter((k) => k === "unusable").length,
    infraErrors: kinds.filter((k) => k === "infra").length,
    notAsked: kinds.filter((k) => k === undefined).length,
    orders: answeredEntries.filter((e) => e.expected.isOrder).length,
    notOrders: answeredEntries.filter((e) => !e.expected.isOrder).length,
    live: block(live, answeredEntries),
    offline: block(offline, answeredEntries),
  };
  if (label === "dev") {
    const shapes = new Map<string, string[]>();
    for (const failure of live.failures) shapes.set(`${failure.field}:${failure.kind}`, [...(shapes.get(`${failure.field}:${failure.kind}`) ?? []), failure.id]);
    report.failureShapes = [...shapes.entries()]
      .map(([shape, ids]) => ({ shape, count: ids.length, exampleIds: [...new Set(ids)].slice(0, 3) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }
  return report;
}

/** Same rule as the Gemini harness: the value at floor(p * n), clamped. */
function quantile(sorted: readonly number[], p: number): number | null {
  return sorted.length === 0 ? null : (sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null);
}

export function buildLiveReport(lines: readonly LiveRecord[], entries: readonly GoldenEntry[] = GOLDEN_SET, generatedAt = new Date().toISOString()): LiveReport {
  const latest = latestRecords(lines);
  const answeredLines = lines.filter((l) => l.kind !== "infra");
  const ms = answeredLines.map((l) => l.latencyMs).sort((a, b) => a - b);
  const prompt = lines.reduce((s, l) => s + (l.promptTokens ?? 0), 0);
  const completion = lines.reduce((s, l) => s + (l.completionTokens ?? 0), 0);
  const counted = lines.filter((l) => tokensOf(l) > 0).length;
  const infraErrorsByCode: Record<string, number> = {};
  for (const record of latest.values()) if (record.kind === "infra") infraErrorsByCode[record.code ?? "unknown"] = (infraErrorsByCode[record.code ?? "unknown"] ?? 0) + 1;
  return {
    goldenVersion: GOLDEN_SET_VERSION,
    generatedAt,
    calls: lines.length,
    tokens: { prompt, completion, total: prompt + completion, perCall: counted === 0 ? null : Math.round((prompt + completion) / counted) },
    latencyMs: { calls: ms.length, p50: quantile(ms, 0.5), p90: quantile(ms, 0.9), max: ms.length === 0 ? null : (ms[ms.length - 1] ?? null) },
    infraErrorsByCode,
    dev: half("dev", entries, latest),
    holdout: half("holdout", entries, latest),
  };
}

export function buildLiveReportFromDir(dir: string): LiveReport {
  return buildLiveReport(readAllLines(dir));
}

const pct = (cell: Cell | undefined) => (!cell || cell.accuracy === null ? "-" : `${cell.correct}/${cell.total} (${(cell.accuracy * 100).toFixed(1)}%)`);

function halfLines(h: HalfReport): string[] {
  const out = [
    `## ${h.half} half: ${h.answered} answered of ${h.entries} (${h.orders} orders, ${h.notOrders} not-an-order); not asked ${h.notAsked}, unusable answers ${h.unusable}, infrastructure errors ${h.infraErrors} (not scored)`,
    "",
    "| check | live Groq | offline reader (same ids) |",
    "|---|---|---|",
    ...HEADLINE.map((f) => `| ${f} | ${pct(h.live.fields[f])} | ${pct(h.offline.fields[f])} |`),
    `| critical-error entries | ${h.live.criticalEntries} of ${h.answered} | ${h.offline.criticalEntries} of ${h.answered} |`,
    `| every check right | ${h.live.fullyCorrectEntries} of ${h.answered} | ${h.offline.fullyCorrectEntries} of ${h.answered} |`,
    "",
    "| language | live isOrder | live product+qty | live phone | offline isOrder | offline product+qty | offline phone |",
    "|---|---|---|---|---|---|---|",
    ...Object.keys(h.live.byLanguage).sort().map((l) => {
      const a = h.live.byLanguage[l] ?? {};
      const b = h.offline.byLanguage[l] ?? {};
      return `| ${l} | ${pct(a.isOrder)} | ${pct(a.productAndQuantity)} | ${pct(a.phone)} | ${pct(b.isOrder)} | ${pct(b.productAndQuantity)} | ${pct(b.phone)} |`;
    }),
    "",
  ];
  return out;
}

function headerLines(r: LiveReport): string[] {
  return [
    `# Golden set, live Groq reader (${r.goldenVersion})`,
    "",
    `Generated ${r.generatedAt}. ${r.calls} calls; tokens ${r.tokens.total} (prompt ${r.tokens.prompt}, answer ${r.tokens.completion}, about ${r.tokens.perCall ?? "-"} per call); latency p50 ${r.latencyMs.p50 ?? "-"} ms, p90 ${r.latencyMs.p90 ?? "-"} ms, max ${r.latencyMs.max ?? "-"} ms over ${r.latencyMs.calls} answered calls.`,
    `Infrastructure errors (not scored): ${Object.entries(r.infraErrorsByCode).map(([c, n]) => `${c} ${n}`).join(", ") || "none"}.`,
    "",
  ];
}

/** What a script prints: aggregates for both halves, never a message id. */
export function formatAggregates(r: LiveReport): string {
  return [...headerLines(r), ...halfLines(r.dev), ...halfLines(r.holdout)].join("\n");
}

/** The evidence file: the aggregates plus, for the dev half only, the failure shapes with example ids. */
export function formatMarkdown(r: LiveReport): string {
  const shapes = r.dev.failureShapes?.length
    ? ["## dev half: where the live reader fails", "", "| shape (field:kind) | count | example ids |", "|---|---|---|", ...r.dev.failureShapes.map((s) => `| ${s.shape} | ${s.count} | ${s.exampleIds.join(", ")} |`), ""]
    : [];
  return `${[...headerLines(r), ...halfLines(r.dev), ...shapes, ...halfLines(r.holdout)].join("\n")}\n`;
}

export function writeLiveReport(r: LiveReport, dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "report.json"), `${JSON.stringify(r, null, 2)}\n`);
  writeFileSync(join(dir, "report.md"), formatMarkdown(r));
}
