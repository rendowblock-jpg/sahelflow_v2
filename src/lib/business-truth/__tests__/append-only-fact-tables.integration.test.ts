process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * S01a-01: the docs call the business-truth fact tables append-only, but the database did not
 * enforce it: any later `update`, a maintenance script or a raw UPDATE succeeded silently and the
 * money / stock / event history could be rewritten. These five tables are pure facts: the command
 * kernel only INSERTs into them, and a search of every non-test file found no UPDATE of any of them.
 *
 * What is pinned here, on a real SQLite database with every migration applied:
 *  - an UPDATE is refused by the database, whichever way it is written (ORM update, updateMany,
 *    raw SQL), and whichever column it touches, even when it would set a column to its own value;
 *  - a refused UPDATE leaves the row exactly as it was;
 *  - appending still works, and so does DELETE: blocking DELETE needs a controlled bypass for the
 *    shop erase and the demo loader and is S01a-02, a separate item. This file says so on purpose,
 *    so that whoever adds that block changes this test knowingly;
 *  - the guard is unconditional: no column list, no WHEN clause, nothing a caller could switch off;
 *  - the triggers are still there at the end of the full migration set (a later migration that
 *    rebuilds one of these tables silently drops its triggers: S01a-03).
 */

const db = new PrismaClient();
let counter = 0;

const TABLES = [
  "InventoryMovement",
  "FinancialMovement",
  "DomainEvent",
  "CompensationFact",
  "ProjectionInvalidation",
] as const;
type Table = (typeof TABLES)[number];

async function seedCommand(): Promise<string> {
  counter += 1;
  const id = `aof_cmd_${process.pid}_${counter}`;
  await db.businessCommand.create({
    data: {
      id,
      idempotencyKey: `aof-key-${process.pid}-${counter}`,
      commandType: "test.append-only",
      aggregateType: "test",
      aggregateId: `aof-${counter}`,
      requestHash: "a".repeat(64),
      status: "committed",
      actor: "test",
      correlationId: `aof-corr-${counter}`,
      expectedVersion: 0,
      committedVersion: 1,
    },
  });
  return id;
}

async function seedRow(table: Table): Promise<string> {
  const commandId = await seedCommand();
  const id = `aof_${table}_${process.pid}_${counter}`;
  switch (table) {
    case "InventoryMovement":
      await db.inventoryMovement.create({
        data: {
          id,
          movementKey: `${id}:key`,
          commandId,
          productId: "aof-product",
          movementType: "reserve",
          quantity: 2,
          fromPosition: "available",
          toPosition: "reserved",
          reason: "append-only test",
        },
      });
      break;
    case "FinancialMovement":
      await db.financialMovement.create({
        data: {
          id,
          movementKey: `${id}:key`,
          commandId,
          movementType: "cod_expected",
          amount: 5000,
          reason: "append-only test",
        },
      });
      break;
    case "DomainEvent":
      await db.domainEvent.create({
        data: {
          id,
          eventKey: `${id}:key`,
          commandId,
          eventType: "test.event",
          aggregateType: "test",
          aggregateId: "aof",
          aggregateVersion: 1,
          payloadJson: "{}",
        },
      });
      break;
    case "CompensationFact":
      await db.compensationFact.create({
        data: { id, factKey: `${id}:key`, commandId, factType: "test.fact", payloadJson: "{}" },
      });
      break;
    case "ProjectionInvalidation":
      await db.projectionInvalidation.create({
        data: { id, commandId, projectionKey: "orders:list" },
      });
      break;
  }
  return id;
}

async function snapshot(table: Table, id: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<unknown[]>(
    `SELECT * FROM "${table}" WHERE "id" = ?`,
    id,
  );
  return JSON.stringify(rows, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

async function columns(table: Table): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${table}")`,
  );
  return rows.map((row) => row.name);
}

async function rowCount(table: Table): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ total: number | bigint }>>(
    `SELECT COUNT(*) AS total FROM "${table}" WHERE "id" LIKE 'aof_%'`,
  );
  return Number(rows[0]?.total ?? 0);
}

/** An ORM update that changes one real column of the table. */
function ormUpdate(table: Table, id: string): Promise<unknown> {
  switch (table) {
    case "InventoryMovement":
      return db.inventoryMovement.update({ where: { id }, data: { quantity: 99 } });
    case "FinancialMovement":
      return db.financialMovement.update({ where: { id }, data: { amount: 1 } });
    case "DomainEvent":
      return db.domainEvent.update({ where: { id }, data: { payloadJson: '{"edited":true}' } });
    case "CompensationFact":
      return db.compensationFact.update({ where: { id }, data: { payloadJson: '{"edited":true}' } });
    case "ProjectionInvalidation":
      return db.projectionInvalidation.update({ where: { id }, data: { projectionKey: "edited" } });
  }
}

function ormUpdateMany(table: Table, id: string): Promise<unknown> {
  switch (table) {
    case "InventoryMovement":
      return db.inventoryMovement.updateMany({ where: { id }, data: { quantity: 99 } });
    case "FinancialMovement":
      return db.financialMovement.updateMany({ where: { id }, data: { amount: 1 } });
    case "DomainEvent":
      return db.domainEvent.updateMany({ where: { id }, data: { payloadJson: '{"edited":true}' } });
    case "CompensationFact":
      return db.compensationFact.updateMany({ where: { id }, data: { payloadJson: '{"edited":true}' } });
    case "ProjectionInvalidation":
      return db.projectionInvalidation.updateMany({ where: { id }, data: { projectionKey: "edited" } });
  }
}

async function clean(): Promise<void> {
  for (const table of TABLES) {
    await db.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "id" LIKE 'aof_%'`);
  }
  await db.$executeRawUnsafe(`DELETE FROM "BusinessCommand" WHERE "id" LIKE 'aof_cmd_%'`);
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await db.$disconnect();
});

describe.each(TABLES)("%s is append-only", (table) => {
  it("refuses an ORM update and leaves the row as it was", async () => {
    const id = await seedRow(table);
    const before = await snapshot(table, id);

    await expect(ormUpdate(table, id)).rejects.toThrow(/append-only/i);

    expect(await snapshot(table, id)).toBe(before);
  });

  it("refuses an ORM updateMany and leaves the row as it was", async () => {
    const id = await seedRow(table);
    const before = await snapshot(table, id);

    await expect(ormUpdateMany(table, id)).rejects.toThrow(/append-only/i);

    expect(await snapshot(table, id)).toBe(before);
  });

  it("refuses raw SQL that touches any single column, even setting it to its own value", async () => {
    const id = await seedRow(table);
    const before = await snapshot(table, id);
    const names = await columns(table);
    expect(names.length).toBeGreaterThanOrEqual(4);

    for (const column of names) {
      await expect(
        db.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = "${column}" WHERE "id" = ?`, id),
      ).rejects.toThrow(/append-only/i);
    }

    expect(await snapshot(table, id)).toBe(before);
  });

  it("refuses an UPDATE that matches every row, not only one", async () => {
    const first = await seedRow(table);
    const second = await seedRow(table);
    const before = [await snapshot(table, first), await snapshot(table, second)];

    await expect(
      db.$executeRawUnsafe(`UPDATE "${table}" SET "id" = "id" WHERE "id" LIKE 'aof_%'`),
    ).rejects.toThrow(/append-only/i);

    expect([await snapshot(table, first), await snapshot(table, second)]).toEqual(before);
  });

  it("still accepts new rows, so the kernel can keep appending", async () => {
    await seedRow(table);
    await seedRow(table);
    await seedRow(table);

    expect(await rowCount(table)).toBe(3);
  });

  it("still allows DELETE: blocking it is S01a-02, which needs a bypass for the shop erase", async () => {
    const id = await seedRow(table);

    const removed = await db.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "id" = ?`, id);

    expect(removed).toBe(1);
    expect(await rowCount(table)).toBe(0);
  });

  it("is guarded by one unconditional BEFORE UPDATE trigger on the whole row", async () => {
    // Other triggers may exist on the table (FinancialMovement has an AFTER INSERT one for the
    // profitability snapshot); only the append-only guard is under test here.
    const triggers = await db.$queryRawUnsafe<Array<{ name: string; sql: string }>>(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'trigger' AND tbl_name = ? AND name LIKE '%append_only%'`,
      table,
    );

    expect(triggers.map((trigger) => trigger.name)).toEqual([`${table}_append_only_update`]);
    const sql = triggers[0]!.sql.replace(/\s+/g, " ");
    expect(sql).toMatch(new RegExp(`BEFORE UPDATE ON "${table}"`, "i"));
    expect(sql).toMatch(/RAISE\s*\(\s*ABORT/i);
    // No column list (a narrowed trigger would let the other columns change) and no WHEN
    // condition (nothing a caller could switch the guard off with).
    expect(sql).not.toMatch(/UPDATE OF/i);
    expect(sql).not.toMatch(/\bWHEN\b/i);
  });
});

describe("the other business-truth tables are not caught by this guard", () => {
  it("leaves BusinessCommand, OutboxIntent and InventoryReservation mutable, because their state moves", async () => {
    const triggers = await db.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger'
         AND tbl_name IN ('BusinessCommand', 'OutboxIntent', 'InventoryReservation')
         AND name LIKE '%append_only%'`,
    );

    expect(triggers).toEqual([]);
    const id = await seedCommand();
    // The kernel itself moves a command from 'processing' to 'committed' with an UPDATE.
    await db.businessCommand.update({ where: { id }, data: { committedVersion: 2 } });
    expect((await db.businessCommand.findUniqueOrThrow({ where: { id } })).committedVersion).toBe(2);
  });
});
