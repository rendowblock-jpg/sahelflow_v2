import type { D1Database, D1Statement } from "./types";

export type DelegatedAllocationSnapshot = Readonly<{
  itemKey: string;
  quantity: number;
}>;

export type RetiredAllocationSnapshot = Readonly<{
  itemKey: string;
  quantity: number;
}>;

type DelegatedRow = {
  item_key: string;
  delegated_quantity: number;
};

type RetiredRow = {
  item_key: string;
  retired_quantity: number;
};

export function appendAllocationRetirementSnapshot(
  database: D1Database,
  statements: D1Statement[],
  input: Readonly<{
    operationId: string;
    storefrontId: string;
    sourceReleaseId: string | null;
    reason: "publish" | "rollback" | "pause";
  }>,
): void {
  if (!input.sourceReleaseId) return;
  statements.push(
    database.prepare(
      `INSERT INTO storefront_allocation_retirement
        (operation_id, storefront_id, source_release_id, item_key, retired_quantity, reason)
       SELECT ?1, ?2, ?3, item_key, remaining_quantity, ?4
         FROM storefront_allocation
        WHERE release_id = ?3 AND remaining_quantity > 0`,
    ).bind(
      input.operationId,
      input.storefrontId,
      input.sourceReleaseId,
      input.reason,
    ),
  );
}

export async function loadAllocationTransferSnapshot(
  database: D1Database,
  operationId: string,
  releaseId: string | null,
): Promise<Readonly<{
  allocations: readonly DelegatedAllocationSnapshot[];
  retiredAllocations: readonly RetiredAllocationSnapshot[];
}>> {
  const delegated = releaseId
    ? await database.prepare(
        `SELECT item_key, delegated_quantity
           FROM storefront_allocation
          WHERE release_id = ?1
          ORDER BY item_key ASC`,
      ).bind(releaseId).all<DelegatedRow>()
    : { success: true, results: [] as DelegatedRow[] };
  const retired = await database.prepare(
    `SELECT item_key, retired_quantity
       FROM storefront_allocation_retirement
      WHERE operation_id = ?1
      ORDER BY item_key ASC`,
  ).bind(operationId).all<RetiredRow>();
  if (!delegated.success || !retired.success) {
    throw new Error("storefront_transfer_snapshot_unavailable");
  }
  return Object.freeze({
    allocations: Object.freeze((delegated.results ?? []).map((row) => Object.freeze({
      itemKey: row.item_key,
      quantity: row.delegated_quantity,
    }))),
    retiredAllocations: Object.freeze((retired.results ?? []).map((row) => Object.freeze({
      itemKey: row.item_key,
      quantity: row.retired_quantity,
    }))),
  });
}
