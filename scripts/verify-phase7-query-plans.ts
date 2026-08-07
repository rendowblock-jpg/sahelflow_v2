#!/usr/bin/env bun

import "server-only";

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { dbRaw } from "@/lib/db";

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
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

async function indexesFor(table: string) {
  const list = await dbRaw.$queryRawUnsafe<IndexListRow[]>(`PRAGMA index_list('${table.replaceAll("'", "''")}')`);
  const indexes: Array<{ name: string; columns: string[]; unique: boolean }> = [];
  for (const entry of list) {
    const info = await dbRaw.$queryRawUnsafe<IndexInfoRow[]>(
      `PRAGMA index_info('${entry.name.replaceAll("'", "''")}')`,
    );
    indexes.push({
      name: entry.name,
      columns: [...info].sort((a, b) => a.seqno - b.seqno).map((column) => column.name),
      unique: entry.unique === 1,
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
// consider every table once; a normal optimize pass then remains bounded.
await dbRaw.$executeRawUnsafe("PRAGMA optimize=0x10002");
await dbRaw.$executeRawUnsafe("PRAGMA optimize");

const plans: Record<string, QueryPlanRow[]> = {};
for (const query of hotQueries) {
  plans[query.name] = await dbRaw.$queryRawUnsafe<QueryPlanRow[]>(query.sql);
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
