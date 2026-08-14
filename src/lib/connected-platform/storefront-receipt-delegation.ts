import "server-only";

import { executeBusinessCommand } from "@/lib/business-truth/command-kernel";
import type { BusinessPrincipalContext } from "@/lib/business-truth/principal";
import { consumeStorefrontDelegation } from "./storefront-delegation";

export async function releaseRejectedStorefrontReceiptDelegation(
  context: BusinessPrincipalContext,
  input: Readonly<{
    receiptId: string;
    releaseId: string;
    items: readonly {
      productId: string;
      productVariantId: string | null;
      quantity: number;
    }[];
  }>,
): Promise<void> {
  await executeBusinessCommand(
    context,
    {
      idempotencyKey: `storefront-receipt-reject:${input.receiptId}`,
      commandType: "storefront.receipt.delegation.reject.v1",
      aggregate: {
        type: "storefront-receipt-delegation-reject",
        id: input.receiptId,
        expectedVersion: 0,
      },
      actor: "source",
      correlationId: `storefront-receipt:${input.receiptId}`,
      payload: input,
    },
    async ({ tx, commandId }) => {
      const movements = await consumeStorefrontDelegation(tx, commandId, {
        releaseId: input.releaseId,
        items: input.items,
        outcome: "rejected",
      });
      return {
        result: { released: true },
        audit: {
          action: "storefront.receipt.delegation.rejected.v1",
          entity: "storefront-receipt",
          entityId: input.receiptId,
          after: {
            releaseId: input.releaseId,
            releasedItemCount: input.items.length,
          },
        },
        events: [
          {
            key: `${commandId}:released`,
            type: "storefront.receipt.delegation.rejected.v1",
            payload: {
              receiptId: input.receiptId,
              releaseId: input.releaseId,
              releasedItemCount: input.items.length,
            },
          },
        ],
        inventoryMovements: movements,
        projectionInvalidations: ["products:list"],
      };
    },
  );
}
