import "server-only";

import { SahelFlowError } from "@/types/errors";

const authorities = new WeakSet<object>();

declare const AI_ACTION_EXECUTION_AUTHORITY_BRAND: unique symbol;

export type AiActionExecutionAuthority = Readonly<{
  proposalId: string;
  proposalDigest: string;
  toolName: string;
  argsHash: string;
  executionKey: string;
  readonly [AI_ACTION_EXECUTION_AUTHORITY_BRAND]: true;
}>;

export function mintAiActionExecutionAuthority(input: {
  proposalId: string;
  proposalDigest: string;
  toolName: string;
  argsHash: string;
  executionKey: string;
}): AiActionExecutionAuthority {
  const authority = Object.freeze({ ...input });
  authorities.add(authority);
  return authority as AiActionExecutionAuthority;
}

export function assertAiActionExecutionAuthority(
  value: AiActionExecutionAuthority | undefined,
  expected: {
    toolName: string;
    argsHash: string;
  },
): asserts value is AiActionExecutionAuthority {
  if (
    !value ||
    !authorities.has(value) ||
    value.toolName !== expected.toolName ||
    value.argsHash !== expected.argsHash
  ) {
    throw new SahelFlowError(
      "Sensitive AI action execution requires the exact sealed proposal authority",
      "AI_ACTION_EXECUTION_AUTHORITY_REQUIRED",
      403,
    );
  }
}
