#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR=/tmp/task5-source-artifact
rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"

bun install --frozen-lockfile

python3 <<'PY'
from pathlib import Path


def replace_exact(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one exact match, found {count}")
    file.write_text(text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, expected: int) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} matches, found {count}")
    file.write_text(text.replace(old, new))


def insert_before(path: str, marker: str, content: str) -> None:
    file = Path(path)
    text = file.read_text()
    if content in text:
        return
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f"{path}: insertion marker count {count}")
    file.write_text(text.replace(marker, content + marker, 1))


def insert_after(path: str, marker: str, content: str) -> None:
    file = Path(path)
    text = file.read_text()
    if content in text:
        return
    count = text.count(marker)
    if count != 1:
        raise SystemExit(f"{path}: insertion marker count {count}")
    file.write_text(text.replace(marker, marker + content, 1))


def write_new(path: str, content: str) -> None:
    file = Path(path)
    if file.exists():
        if file.read_text() == content:
            return
        raise SystemExit(f"{path}: existing content differs")
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(content)


contracts = "src/lib/ai/actions/contracts.ts"
replace_exact(
    contracts,
    "    commune: z.string().trim().max(120),\n"
    "    address: z.string().trim().max(500),\n"
    "    phone: algerianPhoneSchema,",
    "    commune: z.string().trim().min(1).max(120),\n"
    "    address: z.string().trim().min(1).max(500),\n"
    "    phone: algerianPhoneSchema,",
)
replace_exact(
    contracts,
    "    wilaya: z.string().trim().max(120).optional(),\n"
    "    commune: z.string().trim().max(120).optional(),",
    "    wilaya: z.string().trim().min(1).max(120).optional(),\n"
    "    commune: z.string().trim().min(1).max(120).optional(),",
)

core = "src/lib/ai/chat/tools/core-tools.ts"
replace_exact(
    core,
    '      "Update the status of a legacy-compatible order. Canonical orders require their governed seller actions. Valid statuses: draft, pending, confirmed, shipped, delivered, cancelled, returned.",',
    '      "Update the status of a legacy-compatible order. Canonical confirmation remains a governed seller action. Valid statuses: draft, pending, shipped, delivered, cancelled, returned.",',
)
replace_exact(
    core,
    '            "draft|pending|confirmed|shipped|delivered|cancelled|returned",',
    '            "draft|pending|shipped|delivered|cancelled|returned",',
)

agent = "src/lib/ai/chat/agent.ts"
history_helper = """
function historySafeToolResult(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    (value as Record<string, unknown>).pending_action_proposal === true
  ) {
    const safe = { ...(value as Record<string, unknown>) };
    delete safe.proposalDigest;
    return redactToolResult(safe);
  }
  return redactToolResult(value);
}

"""
insert_before(agent, "function proposalMessage(", history_helper)
replace_exact(
    agent,
    "            response: { result: call.result },",
    "            response: { result: historySafeToolResult(call.result) },",
)
replace_exact(
    agent,
    """  return {
    result,
    ...(isAiActionProposalToolResult(result)
      ? { actionProposal: result }
      : {}),
  };""",
    """  if (isAiActionProposalToolResult(result)) {
    return {
      result: historySafeToolResult(result),
      actionProposal: result,
    };
  }
  return { result };""",
)
replace_all(
    agent,
    "      const redacted = redactToolResult(executed.result);",
    "      const redacted = historySafeToolResult(executed.result);",
    2,
)

write_new(
    "prisma/migrations/20260803194500_phase3_ai_action_state_guards/migration.sql",
    """-- Phase 3 Task 5 adversarial state guards.

CREATE TRIGGER "AiActionExecution_valid_state_insert"
BEFORE INSERT ON "AiActionExecution"
WHEN NEW."state" NOT IN ('claimed', 'running', 'succeeded', 'failed', 'conflict')
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionExecution state');
END;

CREATE TRIGGER "AiActionExecution_valid_state_update"
BEFORE UPDATE OF "state" ON "AiActionExecution"
WHEN NEW."state" NOT IN ('claimed', 'running', 'succeeded', 'failed', 'conflict')
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionExecution state');
END;

CREATE TRIGGER "AiActionExecution_succeeded_terminal"
BEFORE UPDATE OF "state" ON "AiActionExecution"
WHEN OLD."state" = 'succeeded' AND NEW."state" <> 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'succeeded AI execution is terminal');
END;

CREATE TRIGGER "AiActionProposal_valid_status_insert"
BEFORE INSERT ON "AiActionProposal"
WHEN NEW."status" NOT IN (
  'pending', 'approved', 'executing', 'succeeded',
  'failed', 'conflict', 'expired', 'rejected'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionProposal status');
END;

CREATE TRIGGER "AiActionProposal_valid_status_update"
BEFORE UPDATE OF "status" ON "AiActionProposal"
WHEN NEW."status" NOT IN (
  'pending', 'approved', 'executing', 'succeeded',
  'failed', 'conflict', 'expired', 'rejected'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid AiActionProposal status');
END;

CREATE TRIGGER "AiActionProposal_succeeded_terminal"
BEFORE UPDATE OF "status" ON "AiActionProposal"
WHEN OLD."status" = 'succeeded' AND NEW."status" <> 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'succeeded AI proposal is terminal');
END;
""",
)

write_new(
    "src/lib/ai/actions/__tests__/adversarial-boundaries.test.ts",
    """import { describe, expect, it } from "vitest";

import { parseSensitiveAiToolArgs } from "../contracts";

describe("Task 5 adversarial argument boundaries", () => {
  it("rejects governed confirmation before proposal creation", () => {
    expect(() =>
      parseSensitiveAiToolArgs("update_order_status", {
        orderId: "order-1",
        status: "confirmed",
      }),
    ).toThrow();
  });

  it("normalizes valid Algerian phones and rejects invalid customer phones", () => {
    expect(
      parseSensitiveAiToolArgs("create_customer", {
        name: "Amina",
        phone: "+213 555 12 34 56",
      }),
    ).toMatchObject({ phone: "0555123456" });
    expect(() =>
      parseSensitiveAiToolArgs("create_customer", {
        name: "Amina",
        phone: "123",
      }),
    ).toThrow();
  });

  it("rejects blank canonical order location fields", () => {
    expect(() =>
      parseSensitiveAiToolArgs("create_order", {
        customerId: "customer-1",
        items: [{ productId: "product-1", quantity: 1 }],
        wilaya: "Alger",
        commune: "",
        address: "",
        phone: "0555123456",
      }),
    ).toThrow();
  });
});
""",
)

service_test = "src/lib/ai/actions/__tests__/service.test.ts"
insert_after(
    service_test,
    "    expect(Number(counts[0]?.executions)).toBe(1);\n",
    """
    await expect(
      db.$executeRaw`
        UPDATE "AiActionExecution"
        SET "state" = 'failed'
        WHERE "proposalId" = ${created.proposal.id}
      `,
    ).rejects.toThrow(/terminal/i);
""",
)

proposal_test = "src/lib/ai/chat/__tests__/agent-proposal.test.ts"
insert_after(
    proposal_test,
    "    expect(result.toolCalls).toHaveLength(1);\n",
    '    expect(JSON.stringify(result.toolCalls)).not.toContain("1".repeat(64));\n',
)
insert_after(
    proposal_test,
    "    expect(proposal?.proposal).toEqual(proposalResult());\n",
    "    const toolResult = events.find((event) => event.type === \"tool_result\");\n"
    '    expect(JSON.stringify(toolResult)).not.toContain("1".repeat(64));\n',
)

source_test = "src/lib/ai/actions/__tests__/source-contract.test.ts"
insert_before(
    source_test,
    '  it("keeps provider assignment blocked and hidden from Gemini", () => {',
    """  it("keeps approval digests out of persisted and Gemini tool history", () => {
    const agent = source("src/lib/ai/chat/agent.ts");
    expect(agent).toContain("historySafeToolResult");
    expect(agent).toContain("delete safe.proposalDigest");
    expect(agent).toContain("historySafeToolResult(call.result)");
  });

""",
)

phase1_test = "src/lib/orders/__tests__/phase1-adopted-source-bypass.test.ts"
replace_exact(
    phase1_test,
    "    expect(files.ai).toContain('sourceBusinessPrincipal(\\n            \"ai_chat\",');",
    '    expect(files.ai).toMatch(/sourceBusinessPrincipal\\(\\s*"ai_chat",/);',
)
PY

bunx prettier@3.6.2 --write \
  src/lib/ai/actions/contracts.ts \
  src/lib/ai/chat/agent.ts \
  src/lib/ai/chat/tools/core-tools.ts \
  src/lib/ai/actions/__tests__/adversarial-boundaries.test.ts \
  src/lib/ai/actions/__tests__/service.test.ts \
  src/lib/ai/actions/__tests__/source-contract.test.ts \
  src/lib/ai/chat/__tests__/agent-proposal.test.ts \
  src/lib/orders/__tests__/phase1-adopted-source-bypass.test.ts
for path in bun.lock bun.lockb package.json; do
  if git ls-files --error-unmatch "$path" >/dev/null 2>&1; then
    git checkout -- "$path"
  fi
done

bunx prisma generate
bun run test:sandbox -- "$SF_TEST_ROOT"
bun run sf-version
bun run sf-audit
bun run sf-verify
bunx prisma migrate status

{
  git diff --name-only --diff-filter=ACM
  git ls-files --others --exclude-standard
} | sort -u > "$ARTIFACT_DIR/changed-files.txt"

git add -N -- $(git ls-files --others --exclude-standard) 2>/dev/null || true
git diff --binary > "$ARTIFACT_DIR/task5-source.patch"
tar -czf "$ARTIFACT_DIR/task5-source-files.tar.gz" -T "$ARTIFACT_DIR/changed-files.txt"
printf '%s\n' "03c616f0885fdad5054e27fe1ca6378704d92683" > "$ARTIFACT_DIR/base-head.txt"
sha256sum "$ARTIFACT_DIR/task5-source-files.tar.gz" > "$ARTIFACT_DIR/task5-source-files.sha256"
printf '%s\n' "full source gate passed before artifact creation" > "$ARTIFACT_DIR/verification.txt"
