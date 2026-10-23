process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

/**
 * S01a-03: SQLite cannot ALTER a table, so a migration that changes a column rebuilds the table
 * (create new, copy, drop old, rename) and DROPS every trigger on it. Nothing noticed: the guards
 * simply stopped existing and no test failed. This pins the complete trigger set of a database built
 * from every migration, on real SQLite, so that:
 *  - a migration that rebuilds a table and forgets to recreate its triggers fails here, by name;
 *  - a new trigger is a deliberate edit of the list below, visible in review, not an accident;
 *  - every "<Table>_append_only_update" guard keeps its strict shape (BEFORE UPDATE on the whole
 *    row, RAISE(ABORT), no column list, no WHEN), because a narrowed guard lets other columns change.
 *
 * It does not prove what a trigger does (the behaviour tests next to each migration do that); it
 * proves the set did not change by accident. The list is a snapshot taken on 23 Oct 2026 from the
 * migration set at that date.
 */

const db = new PrismaClient();

const EXPECTED_TRIGGERS = [
  "AiActionExecution|AiActionExecution_succeeded_terminal",
  "AiActionExecution|AiActionExecution_valid_state_insert",
  "AiActionExecution|AiActionExecution_valid_state_update",
  "AiActionProposal|AiActionProposal_succeeded_terminal",
  "AiActionProposal|AiActionProposal_valid_status_insert",
  "AiActionProposal|AiActionProposal_valid_status_update",
  "CanonicalDeliveryEvent|CanonicalDeliveryEvent_append_only_update",
  "CanonicalExchangeOrder|CanonicalExchangeOrder_append_only_update",
  "CanonicalExchangeRequest|CanonicalExchangeRequest_append_only_update",
  "CanonicalExchangeRequestItem|CanonicalExchangeRequestItem_append_only_update",
  "CanonicalRefund|CanonicalRefund_append_only_update",
  "CanonicalRefundReversal|CanonicalRefundReversal_append_only_update",
  "CanonicalReturnEvent|CanonicalReturnEvent_append_only_update",
  "CanonicalReturnInspection|CanonicalReturnInspection_append_only_update",
  "CanonicalReturnItem|CanonicalReturnItem_append_only_update",
  "CodCollection|CodCollection_append_only_update",
  "CodCollectionCorrection|CodCollectionCorrection_append_only_update",
  "CodSettlement|CodSettlement_append_only_update",
  "CodSettlementCorrection|CodSettlementCorrection_append_only_update",
  "CodSettlementLine|CodSettlementLine_append_only_update",
  "CodSettlementLineMatch|CodSettlementLineMatch_append_only_update",
  "CollaborationComment|CollaborationComment_no_update",
  "CollaborationHandover|CollaborationHandover_no_update",
  "CollaborationMention|CollaborationMention_no_update",
  "CompensationFact|CompensationFact_append_only_update",
  "Conversation|search_projection_conversation_delete",
  "Conversation|search_projection_conversation_insert",
  "Conversation|search_projection_conversation_update",
  "Customer|search_projection_customer_delete",
  "Customer|search_projection_customer_insert",
  "Customer|search_projection_customer_update",
  "Delivery|search_projection_delivery_delete",
  "Delivery|search_projection_delivery_insert",
  "Delivery|search_projection_delivery_update",
  "DomainEvent|DomainEvent_append_only_update",
  "FinancialMovement|FinancialMovement_append_only_update",
  "FinancialMovement|ProfitabilityCostSnapshot_after_cod_receivable",
  "InventoryMovement|InventoryMovement_append_only_update",
  "Order|Order_canonical_lifecycle_insert_check",
  "Order|Order_canonical_lifecycle_update_check",
  "Order|search_projection_order_delete",
  "Order|search_projection_order_insert",
  "Order|search_projection_order_number_update",
  "Order|search_projection_order_update",
  "Product|product_storefront_delegation_stock_guard",
  "Product|search_projection_product_delete",
  "Product|search_projection_product_insert",
  "Product|search_projection_product_update",
  "ProductVariant|product_variant_storefront_delegation_stock_guard",
  "ProfitabilityCostSnapshot|ProfitabilityCostSnapshot_append_only_update",
  "ProjectionInvalidation|ProjectionInvalidation_append_only_update",
  "Return|search_projection_return_delete",
  "Return|search_projection_return_insert",
  "Return|search_projection_return_update",
];

afterAll(async () => {
  await db.$disconnect();
});

async function triggers() {
  return db.$queryRawUnsafe<Array<{ tbl_name: string; name: string; sql: string }>>(
    `SELECT tbl_name, name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY tbl_name, name`,
  );
}

describe("database trigger inventory (S01a-03)", () => {
  it("has exactly the reviewed set of triggers, none missing and none new", async () => {
    const actual = (await triggers()).map((row) => `${row.tbl_name}|${row.name}`).sort();

    const missing = EXPECTED_TRIGGERS.filter((entry) => !actual.includes(entry));
    const unexpected = actual.filter((entry) => !EXPECTED_TRIGGERS.includes(entry));

    expect({ missing, unexpected }).toEqual({ missing: [], unexpected: [] });
    expect(actual).toHaveLength(EXPECTED_TRIGGERS.length);
  });

  it("lists every trigger once, under the table it guards", () => {
    expect(new Set(EXPECTED_TRIGGERS).size).toBe(EXPECTED_TRIGGERS.length);
    for (const entry of EXPECTED_TRIGGERS) {
      const [table, name] = entry.split("|");
      expect(table).toBeTruthy();
      expect(name).toBeTruthy();
      if (name!.endsWith("_append_only_update")) {
        expect(name).toBe(`${table}_append_only_update`);
      }
    }
  });

  it("keeps every append-only guard strict: BEFORE UPDATE, whole row, no condition, always aborts", async () => {
    const guards = (await triggers()).filter((row) => row.name.endsWith("_append_only_update"));

    expect(guards.length).toBeGreaterThanOrEqual(21);
    const loose = guards
      .filter((row) => {
        const sql = row.sql.replace(/\s+/g, " ");
        return (
          !/BEFORE UPDATE ON/i.test(sql) ||
          /UPDATE OF/i.test(sql) ||
          /\bWHEN\b/i.test(sql) ||
          !/RAISE\s*\(\s*ABORT/i.test(sql)
        );
      })
      .map((row) => row.name);

    expect(loose).toEqual([]);
  });

  it("has an append-only guard on each of the business-truth fact tables (S01a-01)", async () => {
    const names = new Set((await triggers()).map((row) => row.name));
    for (const table of [
      "InventoryMovement",
      "FinancialMovement",
      "DomainEvent",
      "CompensationFact",
      "ProjectionInvalidation",
    ]) {
      expect(names.has(`${table}_append_only_update`)).toBe(true);
    }
  });
});
