import {
  dispatchTrigger,
  type TriggerEvent,
} from "@/lib/automations/engine";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { orderService } from "@/lib/data/order-service";
import type { ServiceContext } from "@/lib/data/service-base";
import { assertTrustedAction } from "@/lib/identity/authorization";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";
import { fireCapiStageForOrder } from "@/lib/meta/capi-triggers";
import {
  isImportPendingOrderAuthority,
  isTrustedManualOrderAuthority,
} from "@/lib/orders/manual-order-authority";
import { executeManualOrderDecision } from "@/lib/orders/manual-confirmation";
import type { ShopContext } from "@/lib/shops/context";
import { ConflictError, NotFoundError, SahelFlowError } from "@/types/errors";

/**
 * ONE server function for "confirm or reject this pending order", used by the
 * desktop routes' side effects and by a command sent from the phone, so the
 * phone can never skip a rule the desktop enforces.
 */

type DecisionContext = ServiceContext & { shop: ShopContext };
type DecisionCommand = Awaited<ReturnType<typeof executeManualOrderDecision>>;

export type DecideOrderInput = Readonly<{
  orderId: string;
  decision: "confirm" | "reject";
  expectedVersion: number;
  idempotencyKey: string;
  correlationId?: string;
  /** A locale-stable key (rejection-reasons.ts). Required for a rejection. */
  reasonKey?: string;
}>;

export type DecideOrderOutcome = Readonly<{
  orderId: string;
  status: "confirmed" | "cancelled";
  version: number;
  replayed: boolean;
  path: "governed" | "legacy";
}>;

/**
 * What follows a governed decision that was just committed: the order trigger,
 * one stock.low trigger per product that fell under its threshold, and the
 * Meta CAPI "confirmed" stage. A replay fires nothing. Moved out of the
 * decision route so the route and the phone share it.
 */
export async function runManualDecisionEffects(
  context: DecisionContext,
  command: DecisionCommand,
): Promise<void> {
  if (command.replayed) return;
  const trigger = command.result.automation.trigger as TriggerEvent;
  await dispatchTrigger(
    context,
    trigger,
    command.result.automation.order,
    {
      triggerKey: `${trigger}:${command.result.orderId}:v${command.result.version}`,
    },
  );
  for (const product of command.result.automation.lowStock) {
    await dispatchTrigger(
      context,
      "stock.low" as TriggerEvent,
      {
        productId: product.id,
        productName: product.name,
        stockLevel: product.stock,
        lowStockThreshold: product.lowStockThreshold,
      },
      {
        triggerKey: `stock.low:${product.id}:order:${command.result.orderId}:v${command.result.version}`,
      },
    );
  }
  // FD-061 EX-3: CAPI confirmed-stage trigger. It only claims the durable
  // ledger (the drain does the network call) and swallows its own failures,
  // so it can never block the decision.
  if (command.result.status === "confirmed") {
    await fireCapiStageForOrder(command.result.orderId, "confirmed");
  }
}

/** The legacy status transition's one side effect (FD-061 EX-3). */
export async function runLegacyStatusEffects(orderId: string, status: string): Promise<void> {
  if (status === "confirmed" || status === "delivered") {
    await fireCapiStageForOrder(orderId, status);
  }
}

async function conflictFor(
  context: DecisionContext,
  input: DecideOrderInput,
  wanted: "confirmed" | "cancelled",
): Promise<SahelFlowError> {
  const now = await context.prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
    select: { status: true },
  });
  if (!now) return new NotFoundError("Order", input.orderId);
  if (now.status === wanted) {
    return new SahelFlowError(
      `Order is already ${wanted}`,
      wanted === "confirmed" ? "ORDER_ALREADY_CONFIRMED" : "ORDER_ALREADY_CANCELLED",
      409,
    );
  }
  return new SahelFlowError("Order changed on this computer", "ORDER_CHANGED", 409);
}

export async function decideOrderForActor(
  context: DecisionContext,
  actorContext: TrustedActorContext,
  input: DecideOrderInput,
): Promise<DecideOrderOutcome> {
  assertTrustedAction(actorContext, "orders.update", { shopId: context.shop.shopId });
  const reason = input.reasonKey?.trim();
  if (input.decision === "reject" && !reason) {
    throw new SahelFlowError("A rejection needs a reason", "INVALID_PAYLOAD", 400);
  }
  const order = await context.prisma.order.findFirst({
    where: { id: input.orderId, deletedAt: null },
    select: { id: true, status: true, version: true, source: true, sourceMetadata: true },
  });
  if (!order) throw new NotFoundError("Order", input.orderId);
  const wanted = input.decision === "confirm" ? "confirmed" : "cancelled";

  if (isTrustedManualOrderAuthority(order.source, order.sourceMetadata)) {
    let command: DecisionCommand;
    try {
      command = await executeManualOrderDecision(
        { ...context, businessPrincipal: businessPrincipalFromTrustedActor(actorContext) },
        {
          orderId: input.orderId,
          decision: input.decision,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
          ...(input.correlationId ? { correlationId: input.correlationId } : {}),
          ...(input.decision === "reject" && reason ? { reason } : {}),
        },
      );
    } catch (error) {
      if (error instanceof ConflictError) throw await conflictFor(context, input, wanted);
      throw error;
    }
    await runManualDecisionEffects(context, command);
    return Object.freeze({
      orderId: command.result.orderId,
      status: command.result.status,
      version: command.result.version,
      replayed: command.replayed,
      path: "governed" as const,
    });
  }

  if (isImportPendingOrderAuthority(order.source, order.sourceMetadata)) {
    throw new SahelFlowError(
      "This imported order needs its products mapped on the computer",
      "ORDER_NOT_CONFIRMABLE_HERE",
      422,
    );
  }

  // Legacy orders: the same state machine as PATCH /api/orders/[id]/status,
  // with the version and the pending check the phone's tap was made against.
  if (order.status !== "pending" || order.version !== input.expectedVersion) {
    throw await conflictFor(context, input, wanted);
  }
  const updated = await orderService.updateStatus(context, input.orderId, wanted);
  if (wanted === "confirmed") await runLegacyStatusEffects(input.orderId, wanted);
  return Object.freeze({
    orderId: input.orderId,
    status: wanted,
    version: updated.version,
    replayed: false,
    path: "legacy" as const,
  });
}
