/**
 * MANUAL measurement, not part of CI: it only runs when GOLDEN_MEASURE=1.
 *
 *   GOLDEN_MEASURE=1 GOLDEN_SPLIT=dev GOLDEN_OUT_DIR=/some/dir sf vt wt-NAME \
 *     src/lib/ai/extraction/golden/__tests__/zz-golden-measure.manual.test.ts
 *
 * It runs the OFFLINE reader only (readOrderFields + extractWithRegex): no
 * network, no Gemini key, no database. It scores every golden entry against
 * the label written by meaning and writes baseline.json and baseline.md to
 * GOLDEN_OUT_DIR. It never asserts accuracy: the numbers are the finding.
 *
 * GOLDEN_SPLIT = dev | holdout | both (default dev; see ../split.ts). Each half
 * is scored and written on its own: baseline-dev.json/.md and
 * baseline-holdout.json/.md. The holdout files hold AGGREGATES ONLY (counts and
 * percentages): no id, no text, no per-entry row, no failure list, so reading
 * them cannot teach the reader anything about a single held-out message.
 *
 * GOLDEN_READER=groq runs the LIVE Groq reader instead (paced, budgeted, resumable; see ../live-groq.ts). Env:
 *   GROQ_TEST_API_KEY_FILE  path of the key file (never the key)      GOLDEN_LIVE_DIR      evidence folder (JSON lines + report)
 *   GOLDEN_TOKEN_BUDGET     tokens for the day, default 180000         GOLDEN_LIMIT         most NEW calls in this run
 *   GOLDEN_ONLY             file of ids to run                         GOLDEN_ORDER         dev-first | holdout-last | interleaved
 *   GOLDEN_REPORT_ONLY=1    rebuild the report from the lines, no call
 * It writes report.json, report.md and aggregates.txt (the only file a script should print) into GOLDEN_LIVE_DIR.
 *
 * Every field is reported twice: over all entries, and over the entries that
 * are NOT disputed (GoldenEntry.disputed: two careful readers read the message
 * differently, so it should not count for or against the extractor).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { extractWithGemini } from "@/lib/ai/extraction/gemini-extractor";
import type { ExtractionResult } from "@/lib/ai/extraction/types";
import { GOLDEN_SET, GOLDEN_SET_VERSION, type GoldenEntry } from "../golden-set";
import { DEFAULT_TOKEN_BUDGET, onlyIds, orderEntries, parseIdsFile, parseOrder, readApiKeyFile, runGroqSlice } from "../live-groq";
import { buildLiveReportFromDir, formatAggregates, writeLiveReport } from "../live-report";
import { type Failure, offlineReading, scoreSplit, table } from "../scoring";
import { isHoldout } from "../split";

const RUN = process.env.GOLDEN_MEASURE === "1";
const OUT_DIR = process.env.GOLDEN_OUT_DIR ?? join(tmpdir(), "golden-baseline");
const SPLIT = process.env.GOLDEN_SPLIT ?? "dev";
/**
 * GOLDEN_READER=gemini measures the LIVE Gemini path (extractWithGemini, the code the app runs) instead of the
 * offline reader. The key is read from the file named by GEMINI_TEST_API_KEY_FILE and is never printed, logged or
 * written; only the golden set (synthetic messages, no real customer text) is sent. Output files are named live-*.
 */
const LIVE_READER = process.env.GOLDEN_READER === "gemini";
const GROQ_READER = process.env.GOLDEN_READER === "groq";
const LIVE_CONCURRENCY = Number(process.env.GOLDEN_LIVE_CONCURRENCY ?? "3");
const FILE_PREFIX = LIVE_READER ? "live" : "baseline";
const liveResults = new Map<string, ExtractionResult>();
const liveErrors: string[] = [];
/** First-attempt duration and outcome per entry, as the app would see it (same default timeout as smart-router.ts:59). */
const liveFirst = new Map<string, { ms: number; ok: boolean }>();
const liveModels: Record<string, number> = {};

async function fetchLive(entries: readonly GoldenEntry[]): Promise<void> {
  const keyFile = process.env.GEMINI_TEST_API_KEY_FILE;
  if (!keyFile) throw new Error("GOLDEN_READER=gemini needs GEMINI_TEST_API_KEY_FILE (a path, not the key)");
  const apiKey = readFileSync(keyFile, "utf8").trim();
  const queue = [...entries].filter((entry) => !liveResults.has(entry.id));
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      let last: ExtractionResult | undefined;
      // A failed call (rate limit, timeout, invalid answer) is retried with a growing pause; what still fails is
      // reported as an error and NOT scored, so a network problem is never counted as a wrong answer.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const startedAt = Date.now();
        // Same call as smart-router.ts:59: default timeout, no override.
        last = await extractWithGemini({ body: entry.text }, { apiKey });
        if (attempt === 0) liveFirst.set(entry.id, { ms: Date.now() - startedAt, ok: last.order !== null });
        if (last.order !== null) break;
        // A daily-quota answer cannot be fixed by waiting a few seconds: stop, and leave the entry unscored.
        if (last.missingFields?.some((code) => /QUOTA/.test(code))) break;
        await new Promise((resolve) => setTimeout(resolve, 4_000 * 2 ** attempt));
      }
      if (last) liveResults.set(entry.id, last);
    }
  };
  await Promise.all(Array.from({ length: LIVE_CONCURRENCY }, worker));
}
if (RUN && !["dev", "holdout", "both"].includes(SPLIT)) throw new Error(`GOLDEN_SPLIT must be dev, holdout or both, got ${SPLIT}`);

function runSplit(label: "dev" | "holdout", entries: readonly GoldenEntry[]) {
  // The scoring lives in ../scoring.ts (shared with the live Groq report); this file only chooses the reader.
  const { overall, overallNotDisputed, byLanguage, failures, criticalKinds, entryClean, criticalEntries, perEntry } = scoreSplit(entries, (entry) => {
    const live = LIVE_READER ? liveResults.get(entry.id) : undefined;
    if (LIVE_READER && (!live || live.order === null)) {
      // No answer after the retries: counted as an error, not as a wrong answer.
      liveErrors.push(entry.id);
      return null;
    }
    if (live?.order) {
      const model = String((live.raw as { model?: unknown } | null | undefined)?.model ?? "unknown");
      liveModels[model] = (liveModels[model] ?? 0) + 1;
      // The live reader always returns an order object; "no order" is an answer with no item.
      return { predictedOrder: live.order.items.length > 0, got: live.order };
    }
    return offlineReading(entry);
  });


  const byTag: Record<string, { n: number; fullyCorrect: number }> = {};
  for (const entry of entries) {
    for (const tag of entry.tags ?? []) {
      byTag[tag] ??= { n: 0, fullyCorrect: 0 };
      byTag[tag].n += 1;
      if (entryClean.get(entry.id)) byTag[tag].fullyCorrect += 1;
    }
  }

  const shapeMap = new Map<string, Failure[]>();
  for (const failure of failures) {
    const key = `${failure.field}:${failure.kind}`;
    shapeMap.set(key, [...(shapeMap.get(key) ?? []), failure]);
  }
  const shapes = [...shapeMap.entries()]
    .map(([shape, list]) => {
      const tagCounts: Record<string, number> = {};
      for (const f of list) for (const t of f.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return {
        shape,
        count: list.length,
        topTags: topTags.map(([t, c]) => `${t} (${c})`),
        exampleIds: list.slice(0, 3).map((f) => f.id),
        example: { id: list[0]?.id, expected: list[0]?.expected, got: list[0]?.got },
      };
    })
    .sort((a, b) => b.count - a.count);

  const firstAttempts = entries.map((e) => liveFirst.get(e.id)).filter((x): x is { ms: number; ok: boolean } => x !== undefined);
  const sortedMs = firstAttempts.map((x) => x.ms).sort((a, b) => a - b);
  const quantile = (p: number) => (sortedMs.length === 0 ? null : (sortedMs[Math.min(sortedMs.length - 1, Math.floor(p * sortedMs.length))] ?? null));
  const latency = LIVE_READER
    ? {
        calls: firstAttempts.length,
        failedOnFirstAttempt: firstAttempts.filter((x) => !x.ok).length,
        p50Ms: quantile(0.5),
        p90Ms: quantile(0.9),
        maxMs: sortedMs.length === 0 ? null : (sortedMs[sortedMs.length - 1] ?? null),
        over15s: firstAttempts.filter((x) => x.ms > 15_000).length,
      }
    : undefined;
  const ordersN = entries.filter((e) => e.expected.isOrder).length;
  const disputedList = entries.filter((e) => e.disputed !== undefined);
  const keptList = entries.filter((e) => e.disputed === undefined);
  const report = {
    goldenVersion: GOLDEN_SET_VERSION,
    generatedAt: new Date().toISOString(),
    extractor: LIVE_READER
      ? "extractWithGemini (the LIVE Gemini path the app runs; synthetic messages only)"
      : "readOrderFields + extractWithRegex (offline reader, no network, no Gemini)",
    liveRun: LIVE_READER ? { errors: liveErrors.length, answered: entries.length - liveErrors.length, models: liveModels, firstAttempt: latency } : undefined,
    entries: entries.length,
    orders: ordersN,
    notOrders: entries.length - ordersN,
    overall: table(overall),
    overallNotDisputed: table(overallNotDisputed),
    disputedEntries: {
      count: disputedList.length,
      reasons: Object.fromEntries(disputedList.map((e) => [e.id, e.disputed])),
    },
    notDisputed: {
      entries: keptList.length,
      orders: keptList.filter((e) => e.expected.isOrder).length,
      criticalEntries: keptList.filter((e) => criticalEntries.has(e.id)).length,
      fullyCorrectEntries: keptList.filter((e) => entryClean.get(e.id) === true).length,
    },
    byLanguage: Object.fromEntries(Object.entries(byLanguage).map(([l, t]) => [l, table(t)])),
    criticalEntries: { count: criticalEntries.size, of: entries.length, kinds: criticalKinds },
    fullyCorrectEntries: { count: [...entryClean.values()].filter(Boolean).length, of: entries.length },
    byTag: Object.fromEntries(Object.entries(byTag).sort((a, b) => b[1].n - a[1].n)),
    shapes,
    failures,
    perEntry,
  };

  // Holdout: aggregates only. Nothing below may carry an id, a text or a row.
  const aggregateOnly = label === "holdout";
  const published = aggregateOnly
    ? {
        goldenVersion: report.goldenVersion,
        generatedAt: report.generatedAt,
        extractor: report.extractor,
        liveRun: report.liveRun,
        entries: report.entries,
        orders: report.orders,
        notOrders: report.notOrders,
        overall: report.overall,
        overallNotDisputed: report.overallNotDisputed,
        disputedEntries: { count: report.disputedEntries.count },
        notDisputed: report.notDisputed,
        byLanguage: report.byLanguage,
        criticalEntries: report.criticalEntries,
        fullyCorrectEntries: report.fullyCorrectEntries,
      }
    : report;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${FILE_PREFIX}-${label}.json`), `${JSON.stringify({ split: label, ...published }, null, 2)}\n`);

  const pct = (a: { accuracy: number | null }) => (a.accuracy === null ? "-" : `${(a.accuracy * 100).toFixed(1)}%`);
  const cells = (a?: { correct: number; total: number; accuracy: number | null; wilsonLower95: number }) =>
    a ? `${a.correct}/${a.total} | ${pct(a)} | ${(a.wilsonLower95 * 100).toFixed(1)}%` : "- | - | -";
  const lines: string[] = [
    `# Golden set baseline, ${label} half (${GOLDEN_SET_VERSION})`,
    "",
    `Offline reader only (no network, no key). ${report.entries} entries (${report.orders} orders, ${report.notOrders} not-an-order). Generated ${report.generatedAt}.`,
    "",
    `${report.disputedEntries.count} entries are disputed${aggregateOnly ? "" : ` (${disputedList.map((e) => e.id).join(", ")})`}. Each field is shown over ALL entries and over the ${report.notDisputed.entries} entries that are NOT disputed.`,
    "",
    "| field | all: correct/total | accuracy | Wilson 95% lower | not disputed: correct/total | accuracy | Wilson 95% lower |",
    "|---|---|---|---|---|---|---|",
    ...Object.entries(report.overall).map(([f, a]) => `| ${f} | ${cells(a)} | ${cells(report.overallNotDisputed[f])} |`),
    "",
    `Entries with a critical error (wrong phone/wilaya/quantity/price, invented price/phone/wilaya, extra item, order from a non-order): ${report.criticalEntries.count} of ${report.entries}.`,
    `Entries with every check right: ${report.fullyCorrectEntries.count} of ${report.entries}.`,
    `Not disputed only: critical error ${report.notDisputed.criticalEntries} of ${report.notDisputed.entries}; every check right ${report.notDisputed.fullyCorrectEntries} of ${report.notDisputed.entries}.`,
    "",
    "## By language",
    "",
    "| language | isOrder | product | productAndQuantity | phone | wilaya |",
    "|---|---|---|---|---|---|",
    ...Object.entries(report.byLanguage).map(([l, t]) => {
      const cell = (f: string) => (t[f] ? `${t[f].correct}/${t[f].total} (${pct(t[f])})` : "-");
      return `| ${l} | ${cell("isOrder")} | ${cell("product")} | ${cell("productAndQuantity")} | ${cell("phone")} | ${cell("wilaya")} |`;
    }),
    "",
    ...(aggregateOnly
      ? []
      : [
          "## Top failure shapes",
          "",
          "| shape (field:kind) | count | top tags | example |",
          "|---|---|---|---|",
          ...shapes.slice(0, 12).map((s) => `| ${s.shape} | ${s.count} | ${s.topTags.join(", ")} | ${s.exampleIds.join(", ")} |`),
          "",
        ]),
  ];
  writeFileSync(join(OUT_DIR, `${FILE_PREFIX}-${label}.md`), `${lines.join("\n")}\n`);

  // The only assertion: every entry was scored. The numbers are the finding.
  expect((overall.isOrder?.total ?? 0) + liveErrors.length).toBe(entries.length);
}

async function runGroqLive(): Promise<void> {
  const dir = process.env.GOLDEN_LIVE_DIR;
  if (!dir) throw new Error("GOLDEN_READER=groq needs GOLDEN_LIVE_DIR (the evidence folder)");
  if (process.env.GOLDEN_REPORT_ONLY !== "1") {
    const ids = process.env.GOLDEN_ONLY ? parseIdsFile(readFileSync(process.env.GOLDEN_ONLY, "utf8")) : undefined;
    const entries = orderEntries(ids ? onlyIds(GOLDEN_SET, ids) : GOLDEN_SET, parseOrder(process.env.GOLDEN_ORDER));
    const budget = Number(process.env.GOLDEN_TOKEN_BUDGET ?? DEFAULT_TOKEN_BUDGET);
    const limit = process.env.GOLDEN_LIMIT ? Number(process.env.GOLDEN_LIMIT) : undefined;
    if (!Number.isFinite(budget) || (limit !== undefined && !Number.isFinite(limit))) throw new Error("GOLDEN_TOKEN_BUDGET and GOLDEN_LIMIT must be numbers");
    const summary = await runGroqSlice({ entries, apiKey: readApiKeyFile(process.env.GROQ_TEST_API_KEY_FILE), dir, tokenBudget: budget, limit });
    writeFileSync(join(dir, "last-run.txt"), `${JSON.stringify({ ...summary, finishedAt: new Date().toISOString() })}\n`);
  }
  const report = buildLiveReportFromDir(dir);
  writeLiveReport(report, dir);
  writeFileSync(join(dir, "aggregates.txt"), `${formatAggregates(report)}\n`);
}

describe.skipIf(!RUN)("golden set baseline (manual)", () => {
  it("scores the chosen reader on the chosen half and writes the evidence", async () => {
    if (GROQ_READER) {
      await runGroqLive();
      return;
    }
    const dev = GOLDEN_SET.filter((entry) => !isHoldout(entry));
    const holdout = GOLDEN_SET.filter(isHoldout);
    if (LIVE_READER) {
      await fetchLive([...(SPLIT === "dev" || SPLIT === "both" ? dev : []), ...(SPLIT === "holdout" || SPLIT === "both" ? holdout : [])]);
    }
    if (SPLIT === "dev" || SPLIT === "both") {
      liveErrors.length = 0;
      for (const model of Object.keys(liveModels)) delete liveModels[model];
      runSplit("dev", dev);
    }
    if (SPLIT === "holdout" || SPLIT === "both") {
      liveErrors.length = 0;
      for (const model of Object.keys(liveModels)) delete liveModels[model];
      runSplit("holdout", holdout);
    }
  }, 3_600_000);
});
