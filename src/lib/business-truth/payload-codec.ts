import "server-only";

import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
  type BusinessCommandResultBinding,
} from "./result-codec";

export type BusinessPayloadKind =
  | "domain-event"
  | "outbox-intent"
  | "compensation-fact"
  | "financial-movement-detail";

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
  return openBusinessCommandResultWithKey<TPayload>(
    payloadJson,
    resultBinding(binding),
    envelopeKey,
  );
}
