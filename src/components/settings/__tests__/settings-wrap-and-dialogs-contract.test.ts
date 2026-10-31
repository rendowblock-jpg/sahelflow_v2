/**
 * Class and source contract for the settings panels (a built page was not measured; this pins the
 * causes of sideways overflow and native dialogs that a real run would show):
 *  - a monospace value (id, key, address, fingerprint) must be able to wrap, or one long token
 *    pushes a phone-width panel wider than the screen;
 *  - no native confirm / alert / prompt: they have no focus contract and look foreign.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src/components/settings");
// Owned by other tracks (licence, backup, theme, pairing).
const OTHER_TRACKS = new Set([
  "license-panel.tsx",
  "backup-restore-panel.tsx",
  "appearance-panel.tsx",
  "phone-pairing-card.tsx",
]);

function ownPanels(): string[] {
  return readdirSync(DIR).filter((name) => name.endsWith(".tsx") && !OTHER_TRACKS.has(name));
}

function lines(name: string): string[] {
  return readFileSync(join(DIR, name), "utf8").split("\n");
}

describe("settings panels: wrapping and native dialogs", () => {
  it("every monospace value can wrap", () => {
    const offenders: string[] = [];
    for (const name of ownPanels()) {
      lines(name).forEach((line, index) => {
        if (!line.includes("font-mono")) return;
        if (/<pre|<Input|<Textarea|<textarea/.test(line)) return;
        if (line.trim() === 'className="font-mono"') return;
        if (!/overflow-wrap:anywhere|break-all|break-words|truncate/.test(line)) {
          offenders.push(`${name}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("no panel opens a native confirm, alert or prompt", () => {
    const offenders: string[] = [];
    for (const name of ownPanels()) {
      lines(name).forEach((line, index) => {
        const code = line.replace(/\/\/.*$/, "");
        if (/(^|[^.\w])(window\.)?(confirm|alert|prompt)\s*\(/.test(code)) {
          offenders.push(`${name}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
