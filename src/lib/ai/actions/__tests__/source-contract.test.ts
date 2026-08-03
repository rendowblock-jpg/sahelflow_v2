import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

function walk(directory: string): string[] {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];
  const output: string[] = [];
  for (const name of readdirSync(absolute)) {
    const path = resolve(absolute, name);
    const metadata = statSync(path);
    if (metadata.isDirectory()) {
      if (name === "__tests__") continue;
      output.push(...walk(path.slice(root.length + 1)));
    } else if (/\.(?:ts|tsx)$/.test(name)) {
      output.push(path.slice(root.length + 1).replaceAll("\\", "/"));
    }
  }
  return output;
}

describe("proposal-bound AI production source contract", () => {
  it("keeps generic confirmation words out of the production authority path", () => {
    const paths = [
      "src/lib/ai/chat/agent.ts",
      "src/lib/ai/chat/tools/registry.ts",
      "src/components/ai/ai-chat.tsx",
      "src/app/api/ai/sessions/[id]/messages/route.ts",
      "src/app/api/ai/sessions/[id]/messages/stream/route.ts",
    ];
    const forbidden = [
      "CONFIRMATION_WORDS",
      "userIsConfirming",
      "pending_confirmation",
      'handleSend("oui")',
      "Répondez « oui » pour confirmer",
    ];
    for (const path of paths) {
      const content = source(path);
      for (const marker of forbidden) {
        expect(content, `${path} contains ${marker}`).not.toContain(marker);
      }
    }
  });

  it("binds proposal creation to the exact persisted request and trusted actor", () => {
    for (const path of [
      "src/app/api/ai/sessions/[id]/messages/route.ts",
      "src/app/api/ai/sessions/[id]/messages/stream/route.ts",
    ]) {
      const content = source(path);
      expect(content).toContain("const requester = await requireTrustedActor()");
      expect(content).toContain("requestMessageId: userMessage.id");
      expect(content).toContain("runWithAiActionProposalRuntime");
    }
  });

  it("requires proposal ID plus exact digest at approval", () => {
    const route = source(
      "src/app/api/ai/actions/[proposalId]/approve/route.ts",
    );
    expect(route).toContain("proposalDigest");
    expect(route).toContain("regex(/^[0-9a-f]{64}$/i)");
    expect(route).toContain('await requireAuth("approvals.approve")');
    expect(route).toContain("requireTrustedActor()");
  });

  it("keeps registered tool resolution confined to the central agent path", () => {
    const matches = walk("src")
      .filter((path) => !path.endsWith("src/lib/ai/chat/tools/registry.ts"))
      .filter((path) => source(path).includes("getTool("));
    expect(matches).toEqual(["src/lib/ai/chat/agent.ts"]);
  });

  it("keeps provider assignment blocked and hidden from Gemini", () => {
    const contracts = source("src/lib/ai/actions/contracts.ts");
    const registry = source("src/lib/ai/chat/tools/registry.ts");
    expect(contracts).toContain('assign_order_to_delivery: blocked(');
    expect(contracts).toContain("AI_PROVIDER_ACTION_NOT_CONVERGED");
    expect(registry).toContain('policy.executionClass === "blocked"');
    expect(registry).toContain("return []");
  });
});
