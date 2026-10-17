/**
 * AIX-01: the registry gate can only judge the actor it is given. Both chat
 * routes must hand the server-minted actor of the current session to the tool
 * context, otherwise every read tool would run ungated again.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  "src/app/api/ai/sessions/[id]/messages/stream/route.ts",
  "src/app/api/ai/sessions/[id]/messages/route.ts",
];

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("chat routes pass the session actor to the tools", () => {
  it.each(ROUTES)("%s builds the tool context with the trusted actor", (path) => {
    const text = source(path);

    expect(text).toMatch(/const requester = await requireTrustedActor\(\)/);
    expect(text).toMatch(
      /\{\s*db,\s*shop: shopContext,\s*sourceIdentity: `ai-session:\$\{id\}`,\s*actor: requester,?\s*\}/,
    );
  });

  it.each(ROUTES)("%s still installs the proposal runtime for the same actor", (path) => {
    const text = source(path);

    expect(text).toMatch(/runWithAiActionProposalRuntime\(/);
    expect(text).toMatch(/requester,/);
  });
});
