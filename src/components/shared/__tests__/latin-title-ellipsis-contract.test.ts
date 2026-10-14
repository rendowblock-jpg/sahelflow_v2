/**
 * A long Latin name keeps its own direction and ellipsizes at its end.
 * data-sf-seller-label forces physical text-align, which clips the start
 * when paired with truncate and dir=auto.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function beforeChild(source: string, child: string): string {
  const at = source.lastIndexOf(child);
  expect(at).toBeGreaterThan(-1);
  return source.slice(Math.max(0, at - 700), at);
}

describe("Latin title ellipsis", () => {
  it("does not pair seller-label alignment with truncate and dir=auto", () => {
    const queueName = beforeChild(
      read("src/components/inbox/inbox-v3-queue.tsx"),
      "{chat.name}",
    );
    const sessionTitle = beforeChild(
      read("src/components/ai/ai-session-row.tsx"),
      "{session.title}",
    );

    for (const opening of [queueName, sessionTitle]) {
      expect(opening).toContain("truncate");
      expect(opening).toContain('dir="auto"');
      expect(opening).not.toContain("data-sf-seller-label");
    }
  });
});
