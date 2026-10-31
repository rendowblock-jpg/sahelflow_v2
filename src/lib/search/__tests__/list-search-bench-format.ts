/**
 * Pure helpers of the list-search bench (list-search-bench.manual.test.ts):
 * the statistics and the table it prints. No database, no clock, so a normal
 * vitest run can test them (list-search-bench-format.test.ts).
 */

export const BENCH_SUITES = [
  "customers",
  "orders.search",
  "orders.page",
  "products.search",
  "products.page",
  "canned",
] as const;

/** Label -> the text typed in the search box. */
export const BENCH_QUERIES: ReadonlyArray<readonly [label: string, text: string]> = [
  ["name", "أحمد بن علي"],
  ["part", "احمد"],
  ["+213", "+213 655 12 34 56"],
  ["sp", "0655 12 34 56"],
  ["ord", "ORD-2026-0012"],
  ["none", "خخخطط"],
];

export interface BenchLine {
  suite: string;
  query: string;
  customers: number;
  orders: number;
  median: number;
  p95: number;
  /** Prisma operations of the first timed run (raw queries included). */
  queries: number;
  /** Rows the call returned (a page counts its own rows). */
  hits: number;
  runs: number;
}

/** Median of the samples; the mean of the two middle ones when the count is even. */
export function medianOf(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Nearest rank: the smallest sample that at least 95 % of the samples do not exceed. */
export function p95Of(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0;
}

/** 31.4 -> "31", 4.46 -> "4.5": whole milliseconds from 10 up, one decimal below. */
export function formatMs(value: number): string {
  return value >= 10 ? String(Math.round(value)) : (Math.round(value * 10) / 10).toFixed(1);
}

function cell(line: BenchLine | undefined): string {
  if (!line) return "-";
  return `${formatMs(line.median)}/${formatMs(line.p95)} q${line.queries} h${line.hits}`;
}

/**
 * One block per shop size, one row per suite, one column per query:
 * "median/p95 ms qQUERIES hHITS". Suites and queries keep the fixed order above.
 */
export function formatBenchTable(lines: readonly BenchLine[]): string {
  const sizes = [...new Set(lines.map((l) => `${l.customers}|${l.orders}`))];
  const out: string[] = [];
  for (const size of sizes) {
    const [customers, orders] = size.split("|");
    const block = lines.filter((l) => `${l.customers}|${l.orders}` === size);
    out.push(`N=${customers} customers / ${orders} orders (median/p95 ms, q = Prisma queries, h = rows returned)`);
    const labels = BENCH_QUERIES.map(([label]) => label);
    const rows: string[][] = [["suite", ...labels]];
    for (const suite of BENCH_SUITES) {
      const ofSuite = block.filter((l) => l.suite === suite);
      if (ofSuite.length === 0) continue;
      rows.push([suite, ...labels.map((label) => cell(ofSuite.find((l) => l.query === label)))]);
    }
    const widths = (rows[0] ?? []).map((_, col) => Math.max(...rows.map((row) => (row[col] ?? "").length)));
    for (const row of rows) {
      out.push(row.map((text, col) => text.padEnd(widths[col] ?? 0)).join("  ").trimEnd());
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}
