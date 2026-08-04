import "server-only";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
  type BusinessCommandResultBinding,
} from "@/lib/business-truth/result-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import type { EcommercePlatform, NormalizedOrder } from "./types";

interface CommercePayloadBinding {
  runId: string;
  itemId: string;
  platform: EcommercePlatform;
  sourceOrderId: string;
  sourceRevision: string;
  payloadHash: string;
}

function binding(input: CommercePayloadBinding): BusinessCommandResultBinding {
  return {
    commandId: input.runId,
    idempotencyKey: `commerce-sync-item:${input.itemId}`,
    requestHash: [
      input.platform,
      input.sourceOrderId,
      input.sourceRevision,
      input.payloadHash,
    ].join(":"),
  };
}

export async function sealCommerceSyncItem(
  context: ServiceContext,
  input: CommercePayloadBinding,
  order: NormalizedOrder,
): Promise<string> {
  const key = await getBusinessEnvelopeKey(context);
  try {
    return sealBusinessCommandResultWithKey(
      order,
      binding(input),
      key,
    ).resultJson;
  } finally {
    key.fill(0);
  }
}

export async function openCommerceSyncItem(
  context: ServiceContext,
  input: CommercePayloadBinding,
  payloadJson: string,
): Promise<NormalizedOrder> {
  const key = await getBusinessEnvelopeKey(context);
  try {
    return openBusinessCommandResultWithKey<NormalizedOrder>(
      payloadJson,
      binding(input),
      key,
    );
  } finally {
    key.fill(0);
  }
}
