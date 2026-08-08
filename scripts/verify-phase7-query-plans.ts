#!/usr/bin/env bun

import "server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { dbRaw } from "@/lib/db";

type SqliteInteger = number | bigint;

interface IndexListRow {
  seq: SqliteInteger;
  name: string;
  unique: SqliteInteger;
  origin: string;
  partial: SqliteInteger;
}

interface IndexInfoRow {
  seqno: SqliteInteger;
  cid: SqliteInteger;
  name: string;
}

interface RawQueryPlanRow {
  id: SqliteInteger;
  parent: SqliteInteger;
  notused: SqliteInteger;
  detail: string;
}

interface QueryPlanRow {
  id: number;
  parent: number;
  notused: number;
  detail: string;
}

interface RequiredIndex {
  table: string;
  columns: readonly string[];
  reason: string;
}

const requiredIndexes: readonly RequiredIndex[] = [
  {
    table: "Order",
    columns: ["status", "createdAt", "deletedAt"],
    reason: "status-filtered operational order pages",
  },
  {
    table: "Order",
    columns: ["customerId", "createdAt"],
    reason: "customer order history",
  },
  {
    table: "Order",
    columns: ["source", "status"],
    reason: "source-scoped order lists",
  },
  {
    table: "Customer",
    columns: ["createdAt", "deletedAt"],
    reason: "recent customer workbench paths",
  },
  {
    table: "Product",
    columns: ["isActive", "deletedAt"],
    reason: "active catalog workbench paths",
  },
  {
    table: "Delivery",
    columns: ["status", "createdAt"],
    reason: "status-filtered delivery pages",
  },
] as const;

const hotQueries = [
  {
    name: "orders-status-page",
    sql: `EXPLAIN QUERY PLAN
      SELECT id, orderNumber, status, createdAt
      FROM "Order"
      WHERE status = 'pending' AND deletedAt IS NULL
      ORDER BY createdAt DESC
      LIMIT 50`,
  },
  {
    name: "customer-order-history",
    sql: `EXPLAIN QUERY PLAN
      SELECT id, orderNumber, createdAt
      FROM "Order"
      WHERE customerId = 'phase7-customer'
      ORDER BY createdAt DESC
      LIMIT 50`,
  },
  {
    name: "active-products",
    sql: `EXPLAIN QUERY PLAN
      SELECT id, name, stock
      FROM "Product"
      WHERE isActive = 1 AND deletedAt IS NULL
      ORDER BY updatedAt DESC
      LIMIT 50`,
  },
  {
    name: "delivery-status-page",
    sql: `EXPLAIN QUERY PLAN
      SELECT id, orderId, status, createdAt
      FROM "Delivery"
      WHERE status = 'pending'
      ORDER BY createdAt DESC
      LIMIT 50`,
  },
] as const;

function sameColumns(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function normalizeSqliteInteger(value: SqliteInteger, field: string): number {
  const normalized = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(normalized)) {
    throw new Error(`SQLite evidence field '${field}' is outside the safe integer range: ${String(value)}`);
  }
  return normalized;
}

function normalizeSqliteEvidence(value: unknown): unknown {
  if (typeof value === "bigint") {
    const normalized = Number(value);
    return Number.isSafeInteger(normalized) ? normalized : value.toString();
  }
  if (Array.isArray(value)) return value.map(normalizeSqliteEvidence);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, normalizeSqliteEvidence(nested)]),
    );
  }
  return value;
}

async function indexesFor(table: string) {
  const list = await dbRaw.$queryRawUnsafe<IndexListRow[]>(
    `PRAGMA index_list('${table.replaceAll("'", "''")}')`,
  );
  const indexes: Array<{ name: string; columns: string[]; unique: boolean }> = [];
  for (const entry of list) {
    const info = await dbRaw.$queryRawUnsafe<IndexInfoRow[]>(
      `PRAGMA index_info('${entry.name.replaceAll("'", "''")}')`,
    );
    indexes.push({
      name: entry.name,
      columns: [...info]
        .sort(
          (a, b) =>
            normalizeSqliteInteger(a.seqno, `${entry.name}.seqno`) -
            normalizeSqliteInteger(b.seqno, `${entry.name}.seqno`),
        )
        .map((column) => column.name),
      unique: normalizeSqliteInteger(entry.unique, `${entry.name}.unique`) === 1,
    });
  }
  return indexes;
}

const errors: string[] = [];
const indexEvidence: Record<string, Array<{ name: string; columns: string[]; unique: boolean }>> = {};

for (const requirement of requiredIndexes) {
  const indexes = indexEvidence[requirement.table] ?? (await indexesFor(requirement.table));
  indexEvidence[requirement.table] = indexes;
  if (!indexes.some((index) => sameColumns(index.columns, requirement.columns))) {
    errors.push(
      `${requirement.table}: missing [${requirement.columns.join(", ")}] index required for ${requirement.reason}`,
    );
  }
}

// SQLite recommends PRAGMA optimize rather than direct ANALYZE management. The
// 0x10002 form on a newly opened long-lived connection allows the optimizer to
// consider every table once; a normal optimize pass then remains bounded. Query
// form is used because SQLite may return advisory rows from the pragma.
const optimizeInitial = await dbRaw.$queryRawUnsafe<Array<Record<string, unknown>>>(
  "PRAGMA optimize=0x10002",
);
const optimizeBounded = await dbRaw.$queryRawUnsafe<Array<Record<string, unknown>>>(
  "PRAGMA optimize",
);

const plans: Record<string, QueryPlanRow[]> = {};
for (const query of hotQueries) {
  const rows = await dbRaw.$queryRawUnsafe<RawQueryPlanRow[]>(query.sql);
  plans[query.name] = rows.map((row) => ({
    id: normalizeSqliteInteger(row.id, `${query.name}.id`),
    parent: normalizeSqliteInteger(row.parent, `${query.name}.parent`),
    notused: normalizeSqliteInteger(row.notused, `${query.name}.notused`),
    detail: row.detail,
  }));
}

const outDir = resolve(process.cwd(), ".sf-inventory/phase7-performance");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, "query-plan-evidence.json"),
  `${JSON.stringify(
    {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      indexEvidence,
      queryPlans: plans,
      optimize: {
        initialConnectionPass: normalizeSqliteEvidence(optimizeInitial),
        boundedPass: normalizeSqliteEvidence(optimizeBounded),
      },
      blockingFindings: errors,
      note: "Planner choices on the small CI fixture are retained as trend evidence; required index shape is the blocking contract. T470/floor latency remains installed hardware evidence.",
    },
    null,
    2,
  )}\n`,
);

await dbRaw.$disconnect();

if (errors.length > 0) {
  console.error("Phase 7 query/index contract failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Phase 7 hot-query index contract and SQLite planner evidence passed");
