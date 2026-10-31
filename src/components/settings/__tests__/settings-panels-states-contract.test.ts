import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source-level rules for the settings panels that no render test can see cheaply:
 * a failed request is shown through the translator (never a raw developer message), and no panel
 * uses the browser's own confirm() for a destructive action (the shared dialog does that job).
 */
const DIR = path.resolve(__dirname, "..");
// Owned by other tracks: licence, backup, appearance, phone pairing.
const NOT_MINE = new Set([
  "license-panel.tsx",
  "backup-restore-panel.tsx",
  "appearance-panel.tsx",
  "phone-pairing-card.tsx",
]);
const panels = readdirSync(DIR)
  .filter((name) => name.endsWith(".tsx") && !NOT_MINE.has(name))
  .map((name) => ({ name, source: readFileSync(path.join(DIR, name), "utf8") }));

describe("settings panels: failures are translated, destructive actions use the shared dialog", () => {
  it("finds the panels", () => {
    expect(panels.length).toBeGreaterThan(20);
  });

  it("never shows error.message as it came from the server or the network", () => {
    const offenders: string[] = [];
    const raw = /instanceof Error\s*\?\s*(?:error|caught|err)\.message/g;
    for (const { name, source } of panels) {
      for (const match of source.matchAll(raw)) {
        const before = source.slice(Math.max(0, match.index - 140), match.index);
        if (!/(translateServerError|localizeServerMessage)\(/.test(before)) {
          const line = source.slice(0, match.index).split("\n").length;
          offenders.push(`${name}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never calls window.confirm for a destructive action", () => {
    const offenders = panels
      .filter(({ source }) => /\bwindow\.confirm\(|(?<![.\w])confirm\(/.test(source))
      .map(({ name }) => name);
    expect(offenders).toEqual([]);
  });
});
