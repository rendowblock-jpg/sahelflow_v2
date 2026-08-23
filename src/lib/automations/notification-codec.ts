import "server-only";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  openBusinessCommandResultWithKey,
  sealBusinessCommandResultWithKey,
} from "@/lib/business-truth/result-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import { automationHash } from "./contracts";

interface AutomationNotificationBodyBinding {
  notificationId: string;
  notificationKey: string;
}

interface SealAutomationNotificationBodyInput
  extends AutomationNotificationBodyBinding {
  body: string;
}

interface OpenAutomationNotificationBodyInput
  extends AutomationNotificationBodyBinding {
  protectedBody: string;
}

function notificationBodyBinding(input: AutomationNotificationBodyBinding) {
  return {
    commandId: input.notificationId,
    idempotencyKey: `automation-notification-body:${input.notificationKey}`,
    requestHash: automationHash({
      notificationId: input.notificationId,
      notificationKey: input.notificationKey,
      field: "body",
    }),
  };
}

/**
 * Persist rendered Bell content as authenticated ciphertext under the same
 * shop-local business envelope that protects automation trigger payloads,
 * definitions and results. The binding prevents ciphertext from being moved
 * between notification rows without detection.
 */
export async function sealAutomationNotificationBody(
  context: ServiceContext,
  input: SealAutomationNotificationBodyInput,
): Promise<string> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  return sealBusinessCommandResultWithKey(
    input.body,
    notificationBodyBinding(input),
    envelopeKey,
  ).resultJson;
}

/**
 * Open a persisted Bell body only at an authorized projection/export boundary.
 * Malformed, swapped or tampered ciphertext fails closed.
 */
export async function openAutomationNotificationBody(
  context: ServiceContext,
  input: OpenAutomationNotificationBodyInput,
): Promise<string> {
  const envelopeKey = await getBusinessEnvelopeKey(context);
  const opened = openBusinessCommandResultWithKey<unknown>(
    input.protectedBody,
    notificationBodyBinding(input),
    envelopeKey,
  );
  if (typeof opened !== "string" || opened.length > 1_000) {
    throw new SahelFlowError(
      "Stored automation notification body is invalid",
      "AUTOMATION_NOTIFICATION_BODY_CODEC",
      500,
    );
  }
  return opened;
}
