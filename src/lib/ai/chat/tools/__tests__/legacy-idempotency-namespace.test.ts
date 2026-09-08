import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * AI ledger F-3 pin — the legacy in-tool `create_order` body is unreachable in
 * production (the registry intercepts sensitive tools; fail-closed is pinned by
 * registry-policy.test.ts) and is deliberately retained ONLY for the Vitest
 * legacy harness ("Existing tool unit/integration suites intentionally exercise
 * the legacy tool bodies directly", registry.ts).
 *
 * Its idempotency key therefore lives in a dedicated legacy namespace that MUST
 * stay disjoint from the canonical proposal-bound `ai-action:` namespace
 * (executor.ts). A collision or unification would let one path's command
 * replay-consume the other's — a silent drop or duplicate of a canonical order.
 * This contract keeps the divergence intentional and observable: any drift of
 * either namespace prefix fails here instead of surfacing as a replay anomaly.
 */
const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const LEGACY_NAMESPACE = "ai-order:";
const CANONICAL_NAMESPACE = "ai-action:";

function idempotencyKeyTemplates(source: string): string[] {
  const keys: string[] = [];
  for (const match of source.matchAll(/idempotencyKey:\s*`([^`]+)`/g)) {
    // noUncheckedIndexedAccess: match[1] is `string | undefined` at the type
    // level; the capture group is always present when the pattern matches.
    const key = match[1];
    if (key !== undefined) keys.push(key);
  }
  return keys;
}

describe("legacy create_order idempotency namespace (F-3 pin)", () => {
  it("keeps the legacy body on the ai-order: namespace", () => {
    const coreTools = read("src/lib/ai/chat/tools/core-tools.ts");
    const legacyKeys = idempotencyKeyTemplates(coreTools);

    expect(legacyKeys).toContain("ai-order:${sourceOrderId}");
    expect(
      legacyKeys.every((key) => key.startsWith(LEGACY_NAMESPACE)),
    ).toBe(true);
  });

  it("keeps the canonical executor on the proposal-bound ai-action: namespace", () => {
    const executor = read("src/lib/ai/actions/executor.ts");
    const canonicalKeys = idempotencyKeyTemplates(executor);

    expect(canonicalKeys).toContain("ai-action:${input.proposalId}");
    expect(
      canonicalKeys.every((key) => key.startsWith(CANONICAL_NAMESPACE)),
    ).toBe(true);
  });

  it("never lets the two namespaces share a prefix", () => {
    const coreTools = read("src/lib/ai/chat/tools/core-tools.ts");
    const executor = read("src/lib/ai/actions/executor.ts");

    const legacyKeys = idempotencyKeyTemplates(coreTools);
    const canonicalKeys = idempotencyKeyTemplates(executor);

    expect(
      legacyKeys.every((key) => !key.startsWith(CANONICAL_NAMESPACE)),
    ).toBe(true);
    expect(
      canonicalKeys.every((key) => !key.startsWith(LEGACY_NAMESPACE)),
    ).toBe(true);
  });
});
