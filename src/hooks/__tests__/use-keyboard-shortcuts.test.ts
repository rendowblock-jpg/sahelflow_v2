import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EMPTY_SHORTCUT_SEQUENCE,
  matchPhysicalLetter,
  normalizeShortcutLetter,
  resolveShortcut,
  type ShortcutEvent,
  type ShortcutSequenceState,
} from "@/hooks/use-keyboard-shortcuts";

/**
 * Arabic 101 layout reference for the physical keys used by the shortcuts
 * (e.code stays Latin; e.key carries the produced Arabic character):
 *   KeyG → ل   KeyO → ه   KeyC → ؤ   KeyP → خ   KeyD → ي   KeyK → ن
 *   KeyI → ع   KeyA → ش   KeyS → س   KeyL → م   KeyR → ق
 */
const ARABIC = {
  g: { key: "ل", code: "KeyG" },
  o: { key: "ه", code: "KeyO" },
  c: { key: "ؤ", code: "KeyC" },
  p: { key: "خ", code: "KeyP" },
  d: { key: "ي", code: "KeyD" },
  k: { key: "ن", code: "KeyK" },
  i: { key: "ع", code: "KeyI" },
  a: { key: "ش", code: "KeyA" },
  s: { key: "س", code: "KeyS" },
  l: { key: "م", code: "KeyL" },
  r: { key: "ق", code: "KeyR" },
} as const satisfies Record<string, ShortcutEvent>;

const LATIN = (letter: string): ShortcutEvent => ({
  key: letter,
  code: `Key${letter.toUpperCase()}`,
});

const armed = (time: number): ShortcutSequenceState => ({
  lastKey: "g",
  lastKeyTime: time,
});

describe("matchPhysicalLetter — layout independence", () => {
  it("matches the physical key on an Arabic layout (K produces ن)", () => {
    expect(matchPhysicalLetter(ARABIC.k, "k")).toBe(true);
    expect(matchPhysicalLetter(ARABIC.g, "g")).toBe(true);
  });

  it("still matches on a Latin layout", () => {
    expect(matchPhysicalLetter(LATIN("k"), "k")).toBe(true);
    expect(matchPhysicalLetter(LATIN("g"), "G")).toBe(true);
  });

  it("falls back to e.key for code-less synthetic events", () => {
    expect(matchPhysicalLetter({ key: "k" }, "k")).toBe(true);
    // An Arabic character without a code cannot be matched physically.
    expect(matchPhysicalLetter({ key: "ن" }, "k")).toBe(false);
  });

  it("rejects other physical keys", () => {
    expect(matchPhysicalLetter(ARABIC.o, "k")).toBe(false);
    expect(matchPhysicalLetter(LATIN("x"), "k")).toBe(false);
  });
});

describe("normalizeShortcutLetter — physical letter resolution", () => {
  it("returns the Latin letter behind Arabic-produced characters", () => {
    expect(normalizeShortcutLetter(ARABIC.g)).toBe("g");
    expect(normalizeShortcutLetter(ARABIC.o)).toBe("o");
    expect(normalizeShortcutLetter(ARABIC.d)).toBe("d");
  });

  it("is identical on Latin layouts (code and key agree)", () => {
    expect(normalizeShortcutLetter(LATIN("g"))).toBe("g");
    expect(normalizeShortcutLetter(LATIN("o"))).toBe("o");
  });

  it("keeps non-letter keys on the produced character (layout-safe)", () => {
    expect(normalizeShortcutLetter({ key: "/", code: "Slash" })).toBe("/");
    expect(normalizeShortcutLetter({ key: "?", code: "Slash" })).toBe("?");
    expect(normalizeShortcutLetter({ key: "Escape" })).toBe("escape");
  });

  it("falls back to e.key when no code is reported", () => {
    expect(normalizeShortcutLetter({ key: "G" })).toBe("g");
  });
});

describe("resolveShortcut — single-key navigation", () => {
  it("navigates with Latin keys", () => {
    const result = resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, LATIN("o"), 1_000);
    expect(result.outcome).toEqual({ kind: "navigate", route: "/orders" });
    expect(result.state).toEqual(EMPTY_SHORTCUT_SEQUENCE);
  });

  it("navigates with Arabic-layout keys (o produces ه, c produces ؤ, p produces خ)", () => {
    expect(resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, ARABIC.o, 1_000).outcome).toEqual(
      { kind: "navigate", route: "/orders" },
    );
    expect(resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, ARABIC.c, 1_000).outcome).toEqual(
      { kind: "navigate", route: "/customers" },
    );
    expect(resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, ARABIC.p, 1_000).outcome).toEqual(
      { kind: "navigate", route: "/products" },
    );
  });

  it("keeps / and ? working through the produced character", () => {
    expect(
      resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, { key: "/", code: "Slash" }, 1_000).outcome,
    ).toEqual({ kind: "focus-search" });
    expect(
      resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, { key: "?", code: "Slash" }, 1_000).outcome,
    ).toEqual({ kind: "open-cheatsheet" });
  });
});

describe("resolveShortcut — g sequences", () => {
  it("arms on g and navigates on the follow-up letter (Latin)", () => {
    const armedState = resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, LATIN("g"), 1_000);
    expect(armedState.state).toEqual(armed(1_000));

    const result = resolveShortcut(armedState.state, LATIN("d"), 1_200);
    expect(result.outcome).toEqual({ kind: "navigate", route: "/dashboard" });
  });

  it("survives an Arabic layout end-to-end: ل then ي (physical g d)", () => {
    const armedState = resolveShortcut(EMPTY_SHORTCUT_SEQUENCE, ARABIC.g, 1_000);
    expect(armedState.outcome).toEqual({ kind: "none" });

    const result = resolveShortcut(armedState.state, ARABIC.d, 1_200);
    expect(result.outcome).toEqual({ kind: "navigate", route: "/dashboard" });
  });

  it.each([
    ["o", "/orders"],
    ["c", "/customers"],
    ["p", "/products"],
    ["i", "/inbox"],
    ["a", "/analytics"],
    ["s", "/settings"],
    ["l", "/deliveries"],
    ["r", "/returns"],
  ] as const)("maps Arabic-layout g + %s to %s", (letter, route) => {
    const result = resolveShortcut(armed(1_000), ARABIC[letter], 1_200);
    expect(result.outcome).toEqual({ kind: "navigate", route });
  });

  it("expires the sequence after the double-key delay", () => {
    const result = resolveShortcut(armed(1_000), LATIN("o"), 1_000 + 501);
    expect(result.outcome).toEqual({ kind: "none" });
    expect(result.state).toEqual(EMPTY_SHORTCUT_SEQUENCE);
  });

  it("resets when the follow-up key is not a route", () => {
    const result = resolveShortcut(armed(1_000), LATIN("x"), 1_200);
    expect(result.outcome).toEqual({ kind: "none" });
    expect(result.state).toEqual(EMPTY_SHORTCUT_SEQUENCE);
  });

  it("treats g g as a reset, not a re-arm", () => {
    const result = resolveShortcut(armed(1_000), ARABIC.g, 1_200);
    expect(result.outcome).toEqual({ kind: "none" });
    expect(result.state).toEqual(EMPTY_SHORTCUT_SEQUENCE);
  });
});

describe("resolveShortcut — Cmd/Ctrl+K hand-off", () => {
  it("ignores Ctrl+K on a Latin layout (DashboardLayout owns the palette)", () => {
    const result = resolveShortcut(
      EMPTY_SHORTCUT_SEQUENCE,
      { ...LATIN("k"), ctrlKey: true },
      1_000,
    );
    expect(result.outcome).toEqual({ kind: "none" });
  });

  it("ignores Ctrl+K on an Arabic layout (physical K produces ن)", () => {
    const result = resolveShortcut(
      EMPTY_SHORTCUT_SEQUENCE,
      { ...ARABIC.k, ctrlKey: true },
      1_000,
    );
    expect(result.outcome).toEqual({ kind: "none" });
  });

  it("keeps an armed g-sequence intact across a Ctrl+K palette toggle", () => {
    const result = resolveShortcut(armed(1_000), { ...ARABIC.k, metaKey: true }, 1_100);
    expect(result.outcome).toEqual({ kind: "none" });
    expect(result.state).toEqual(armed(1_000));
  });
});

describe("keyboard layout wiring — source contract", () => {
  const root = process.cwd();
  const read = (path: string) =>
    readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

  it("matches the command-palette chord on the physical key in dashboard-layout", () => {
    const layout = read("src/components/layout/dashboard-layout.tsx");
    expect(layout).toContain('matchPhysicalLetter(event, "k")');
    expect(layout).not.toContain('event.key.toLowerCase() === "k"');
    expect(layout).not.toContain('event.key === "k"');
  });

  it("keeps the cheatsheet key descriptors layout-agnostic and unchanged", () => {
    const cheatsheet = read("src/components/shared/cheatsheet-modal.tsx");
    // The cheatsheet documents physical-key chords ("g d", "⌘K", "o", …) which
    // remain accurate now that matching is physical — no per-layout variants.
    for (const keys of ["g d", "g o", "g c", "g p", "g l", "g r", "g i", "g a", "g s", "⌘K", "o", "c", "p", "/", "?"]) {
      expect(cheatsheet).toContain(`keys: "${keys}"`);
    }
  });
});
