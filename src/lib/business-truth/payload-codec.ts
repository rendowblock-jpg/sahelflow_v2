import "server-only";

import { SahelFlowError } from "@/types/errors";
import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
  type BusinessCommandResultBinding,
} from "./result-codec";

export type BusinessPayloadKind =
  | "domain-event"
  | "outbox-intent"
  | "compensation-fact"
  | "financial-movement-detail"
  | "inventory-movement-detail"
  | "order-change-detail"
  | "collaboration-comment"
  | "collaboration-handover-reason"
  | "ai-action-arguments"
  | "ai-action-summary"
  | "ai-action-license-binding"
  | "ai-action-target-binding"
  | "ai-action-execution-result";

export type FinancialMovementDetailField =
  | "counterparty"
  | "reference"
  | "reason";

export interface BusinessPayloadBinding {
  kind: BusinessPayloadKind;
  recordKey: string;
  recordType: string;
  commandId: string;
}

function resultBinding(binding: BusinessPayloadBinding): BusinessCommandResultBinding {
  return {
    commandId: binding.commandId,
    idempotencyKey: `${binding.kind}:${binding.recordKey}`,
    requestHash: `${binding.kind}:${binding.recordType}`,
  };
}

function isAiActionPayload(kind: BusinessPayloadKind): boolean {
  return kind.startsWith("ai-action-");
}

function aiActionPayloadError(
  kind: BusinessPayloadKind,
  cause: unknown,
): SahelFlowError {
  const executionResult = kind === "ai-action-execution-result";
  return new SahelFlowError(
    executionResult
      ? "AI action execution result authentication failed"
      : "AI action proposal payload authentication failed",
    executionResult
      ? "AI_ACTION_EXECUTION_RESULT_TAMPERED"
      : "AI_ACTION_ARGUMENT_TAMPERED",
    409,
    cause,
  );
}

export function financialMovementDetailBinding(
  commandId: string,
  movementKey: string,
  movementType: string,
  field: FinancialMovementDetailField,
): BusinessPayloadBinding {
  return {
    kind: "financial-movement-detail",
    recordKey: `${movementKey}:${field}`,
    recordType: `${movementType}:${field}`,
    commandId,
  };
}

export function inventoryMovementReasonBinding(
  commandId: string,
  movementKey: string,
  movementType: string,
): BusinessPayloadBinding {
  return {
    kind: "inventory-movement-detail",
    recordKey: `${movementKey}:reason`,
    recordType: `${movementType}:reason`,
    commandId,
  };
}

export function collaborationCommentBinding(
  commandId: string,
  commentId: string,
  entityType: string,
): BusinessPayloadBinding {
  return {
    kind: "collaboration-comment",
    recordKey: commentId,
    recordType: entityType,
    commandId,
  };
}

export function collaborationHandoverReasonBinding(
  commandId: string,
  handoverId: string,
  entityType: string,
): BusinessPayloadBinding {
  return {
    kind: "collaboration-handover-reason",
    recordKey: handoverId,
    recordType: entityType,
    commandId,
  };
}

export function sealBusinessPayloadWithKey<TPayload>(
  payload: TPayload,
  binding: BusinessPayloadBinding,
  envelopeKey: Buffer,
): string {
  return sealBusinessCommandResultWithKey(
    payload,
    resultBinding(binding),
    envelopeKey,
  ).resultJson;
}

export function openBusinessPayloadWithKey<TPayload>(
  payloadJson: string,
  binding: BusinessPayloadBinding,
  envelopeKey: Buffer,
): TPayload {
  try {
    return openBusinessCommandResultWithKey<TPayload>(
      payloadJson,
      resultBinding(binding),
      envelopeKey,
    );
  } catch (error) {
    if (isAiActionPayload(binding.kind)) {
      throw aiActionPayloadError(binding.kind, error);
    }
    throw error;
  }
}
