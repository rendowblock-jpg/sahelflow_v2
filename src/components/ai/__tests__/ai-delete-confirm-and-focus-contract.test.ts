import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// Founder report, installed Internal.43 (2026-10-17):
//  1. Arming a conversation delete showed a red pill whose text spilled over
//     the neighbouring button and out of the narrow rail.
//  2. The composer drew a square teal outline inside its rounded frame.
// Both were measured in headless Chromium with the real stylesheets in a
// 244 px rail: the confirm button was 114 px (Arabic) / 68 px (French) wide and
// its text overlapped and left the rail; the focused field had a solid 2 px
// outline. These pins keep the structural cause fixed.
describe("armed delete row in the Agents rail", () => {
  const row = read("src/components/ai/ai-session-row.tsx");
  const armed = row.slice(
    row.indexOf("{deleteArmed ? ("),
    row.indexOf("{!busy && !deleteArmed ? ("),
  );

  it("wraps the long confirmation sentence instead of letting it spill", () => {
    expect(armed).toContain("data-ai-session-delete-bar");
    expect(armed).toContain("data-ai-session-delete={session.id}");
    // The Button base class is whitespace-nowrap: the override must stay.
    const classes = armed.match(/variant="destructive"\s+className="([^"]*)"/);
    expect(classes, "confirm button className").not.toBeNull();
    expect(classes![1]).toContain("whitespace-normal");
    expect(classes![1]).toContain("min-w-0");
    expect(classes![1]).toContain("h-auto");
    expect(armed).toContain('t("ai.history.deleteConfirm")');
  });

  it("names the cancel action 'Cancel', not 'Cancel renaming'", () => {
    expect(armed).toContain('aria-label={t("common.cancel")}');
    expect(armed).toContain("data-ai-session-delete-cancel");
    expect(armed).not.toContain("renameCancel");
  });

  it("keeps cancel compact so the sentence gets the width", () => {
    const cancel = armed.slice(armed.indexOf("data-ai-session-delete-cancel"));
    expect(armed).toContain('size="icon-xs"');
    expect(cancel).not.toMatch(/>\s*\{t\(/);
  });
});

describe("composer focus indicator", () => {
  const deck = read("src/components/ai/ai-composer-deck.tsx");
  const globals = read("src/app/globals.css");
  const workspace = read("src/app/workspace-system.css");

  it("hands the field's focus indicator to the rounded frame", () => {
    expect(deck).toContain('data-focus-owner="frame"');
    const rule = globals.match(
      /\[data-focus-owner="frame"\]:focus-visible\s*\{([^}]*)\}/,
    );
    expect(rule, "opt-out rule").not.toBeNull();
    expect(rule![1]).toContain("outline: none");
  });

  it("never leaves the composer without any focus indicator", () => {
    // The field drops its own outline only because the frame draws one.
    expect(workspace).toMatch(
      /\[data-ai-composer="true"\]:focus-within\s*\{[^}]*box-shadow/,
    );
    expect(deck).toContain("focus-within:border-ring/60");
    // Windows high-contrast mode ignores shadows: the system outline returns.
    const forced = globals.slice(globals.indexOf("@media (forced-colors: active)"));
    expect(forced).toContain('[data-focus-owner="frame"]:focus-visible');
    expect(forced).toContain("Highlight");
  });

  it("outranks the universal ring without !important", () => {
    const rule = globals.slice(
      globals.indexOf('[data-focus-owner="frame"]:focus-visible'),
      globals.indexOf("@media (forced-colors: active)"),
    );
    expect(rule).toContain("outline: none");
    expect(rule).not.toContain("!important");
    // The generic rule stays in force for everything else.
    expect(globals).toContain("*:focus-visible {");
  });

  it("is used only by fields that sit inside a frame that shows :focus-within", () => {
    const users: string[] = [];
    for (const entry of readdirSync(resolve(process.cwd(), "src"), {
      recursive: true,
    })) {
      const path = String(entry).replaceAll("\\", "/");
      if (!/\.(ts|tsx)$/.test(path) || /__tests__|\.test\./.test(path)) continue;
      if (read(`src/${path}`).includes('data-focus-owner="frame"')) {
        users.push(path);
      }
    }
    expect(users).toEqual(["components/ai/ai-composer-deck.tsx"]);
  });
});
