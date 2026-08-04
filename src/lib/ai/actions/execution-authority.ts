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
  testOnly: boolean;
  readonly [AI_ACTION_EXECUTION_AUTHORITY_BRAND]: true;
}>;

function createAuthority(input: {
  proposalId: string;
  proposalDigest: string;
  toolName: string;
  argsHash: string;
  executionKey: string;
  testOnly: boolean;
}): AiActionExecutionAuthority {
  const authority = Object.freeze({ ...input });
  authorities.add(authority);
  return authority as AiActionExecutionAuthority;
}

export function mintAiActionExecutionAuthority(input: {
  proposalId: string;
  proposalDigest: string;
  toolName: string;
  argsHash: string;
  executionKey: string;
}): AiActionExecutionAuthority {
  return createAuthority({ ...input, testOnly: false });
}

export function testAiActionExecutionAuthority(): AiActionExecutionAuthority {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new SahelFlowError(
      "AI action test authority is unavailable outside tests",
      "AI_ACTION_TEST_AUTHORITY_FORBIDDEN",
      500,
    );
  }
  return createAuthority({
    proposalId: "test-proposal",
    proposalDigest: "0".repeat(64),
    toolName: "*",
    argsHash: "*",
    executionKey: "test-execution",
    testOnly: true,
  });
}

export function assertAiActionExecutionAuthority(
  value: AiActionExecutionAuthority | undefined,
  expected: {
    toolName: string;
    argsHash: string;
  },
): asserts value is AiActionExecutionAuthority {
  const validTestAuthority = Boolean(
    value?.testOnly &&
      (process.env.NODE_ENV === "test" || process.env.VITEST === "true") &&
      value.toolName === "*" &&
      value.argsHash === "*",
  );
  if (
    !value ||
    !authorities.has(value) ||
    (!validTestAuthority &&
      (value.toolName !== expected.toolName ||
        value.argsHash !== expected.argsHash))
  ) {
    throw new SahelFlowError(
      "Sensitive AI action execution requires the exact sealed proposal authority",
      "AI_ACTION_EXECUTION_AUTHORITY_REQUIRED",
      403,
    );
  }
}
