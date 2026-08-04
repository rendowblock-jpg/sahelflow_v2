import "server-only";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import {
  openBusinessPayloadWithKey,
  sealBusinessPayloadWithKey,
  type BusinessPayloadKind,
} from "@/lib/business-truth/payload-codec";
import type { ServiceContext } from "@/lib/data/service-base";

function binding(
  kind: Extract<
    BusinessPayloadKind,
    | "ai-action-arguments"
    | "ai-action-summary"
    | "ai-action-license-binding"
    | "ai-action-target-binding"
    | "ai-action-execution-result"
  >,
  proposalId: string,
  toolName: string,
) {
  return {
    kind,
    recordKey: proposalId,
    recordType: toolName,
    commandId: proposalId,
  } as const;
}

async function seal<T>(
  context: ServiceContext,
  kind: Parameters<typeof binding>[0],
  proposalId: string,
  toolName: string,
  value: T,
): Promise<string> {
  const key = await getBusinessEnvelopeKey(context);
  try {
    return sealBusinessPayloadWithKey(
      value,
      binding(kind, proposalId, toolName),
      key,
    );
  } finally {
    key.fill(0);
  }
}

async function open<T>(
  context: ServiceContext,
  kind: Parameters<typeof binding>[0],
  proposalId: string,
  toolName: string,
  value: string,
): Promise<T> {
  const key = await getBusinessEnvelopeKey(context);
  try {
    return openBusinessPayloadWithKey<T>(
      value,
      binding(kind, proposalId, toolName),
      key,
    );
  } finally {
    key.fill(0);
  }
}

export const aiActionPayload = {
  sealArguments: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: T,
  ) => seal(context, "ai-action-arguments", proposalId, toolName, value),
  openArguments: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: string,
  ) => open<T>(context, "ai-action-arguments", proposalId, toolName, value),
  sealSummary: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: T,
  ) => seal(context, "ai-action-summary", proposalId, toolName, value),
  openSummary: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: string,
  ) => open<T>(context, "ai-action-summary", proposalId, toolName, value),
  sealLicenseBinding: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: T,
  ) => seal(context, "ai-action-license-binding", proposalId, toolName, value),
  openLicenseBinding: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: string,
  ) => open<T>(context, "ai-action-license-binding", proposalId, toolName, value),
  sealTargetBinding: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: T,
  ) => seal(context, "ai-action-target-binding", proposalId, toolName, value),
  openTargetBinding: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: string,
  ) => open<T>(context, "ai-action-target-binding", proposalId, toolName, value),
  sealExecutionResult: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: T,
  ) => seal(context, "ai-action-execution-result", proposalId, toolName, value),
  openExecutionResult: <T>(
    context: ServiceContext,
    proposalId: string,
    toolName: string,
    value: string,
  ) => open<T>(context, "ai-action-execution-result", proposalId, toolName, value),
};
