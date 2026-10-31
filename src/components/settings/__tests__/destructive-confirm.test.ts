import { describe, expect, it } from "vitest";

import { LOCALES } from "@/lib/i18n";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

import {
  DESTRUCTIVE_ACTIONS,
  canConfirmDestructive,
  destructiveKey,
  matchesConfirmWord,
} from "../destructive-confirm";

describe("matchesConfirmWord", () => {
  it("accepts the word typed exactly, with stray spaces or another letter case", () => {
    expect(matchesConfirmWord("RESET", "RESET")).toBe(true);
    expect(matchesConfirmWord("  reset ", "RESET")).toBe(true);
    expect(matchesConfirmWord("Boutique Amel", "boutique amel")).toBe(true);
  });
  it("refuses a partial word, an empty field and an empty word", () => {
    expect(matchesConfirmWord("RESE", "RESET")).toBe(false);
    expect(matchesConfirmWord("", "RESET")).toBe(false);
    expect(matchesConfirmWord("RESET", "")).toBe(false);
    expect(matchesConfirmWord("RESET", "  ")).toBe(false);
  });
});

describe("canConfirmDestructive", () => {
  it("needs no typing when no word is required", () => {
    expect(canConfirmDestructive({ word: undefined, typed: "", busy: false })).toBe(true);
  });
  it("needs the word when one is required", () => {
    expect(canConfirmDestructive({ word: "RESET", typed: "", busy: false })).toBe(false);
    expect(canConfirmDestructive({ word: "RESET", typed: "reset", busy: false })).toBe(true);
  });
  it("is never possible while a request is running (no double submit)", () => {
    expect(canConfirmDestructive({ word: undefined, typed: "", busy: true })).toBe(false);
    expect(canConfirmDestructive({ word: "RESET", typed: "RESET", busy: true })).toBe(false);
  });
});

describe("the destructive action registry (one contract for every destructive action)", () => {
  const ids = Object.keys(DESTRUCTIVE_ACTIONS);

  it("lists the actions the settings screens expose", () => {
    expect(ids.sort()).toEqual(
      [
        "deleteShop",
        "disconnectGoogleSheets",
        "removeMember",
        "resetShopData",
        "revokeAiKey",
      ].sort(),
    );
  });

  it("asks for a typed word wherever seller data is lost", () => {
    for (const spec of Object.values(DESTRUCTIVE_ACTIONS)) {
      if (spec.losesData) expect(spec.requiresWord, spec.id).toBe(true);
    }
  });

  for (const locale of LOCALES) {
    it(`names what is lost and what is NOT affected, in ${locale}`, () => {
      for (const id of ids) {
        const title = getRuntimeTranslation(locale, destructiveKey(id, "title"));
        const lost = getRuntimeTranslation(locale, destructiveKey(id, "lost"));
        const safe = getRuntimeTranslation(locale, destructiveKey(id, "notAffected"));
        const confirm = getRuntimeTranslation(locale, destructiveKey(id, "confirm"));
        for (const [part, text] of [
          ["title", title],
          ["lost", lost],
          ["notAffected", safe],
          ["confirm", confirm],
        ] as const) {
          expect(text, `${locale} ${id} ${part}`).toBeTruthy();
          expect(String(text).includes("settings.destructive"), `${locale} ${id} ${part}`).toBe(false);
        }
        expect(lost, `${locale} ${id}`).not.toBe(safe);
        if (locale === "ar") expect(String(lost), id).toMatch(/[\u0600-\u06FF]/);
      }
    });
  }

  it("generic dialog labels exist in all three languages", () => {
    for (const locale of LOCALES) {
      for (const key of [
        "settings.destructive.cancel",
        "settings.destructive.lostLabel",
        "settings.destructive.notAffectedLabel",
        "settings.destructive.typePrompt",
        "settings.destructive.working",
      ]) {
        expect(getRuntimeTranslation(locale, key), `${locale} ${key}`).toBeTruthy();
      }
    }
  });

  it("does not promise what the code does not do: the AI key text says nothing about where the key is stored", () => {
    for (const locale of LOCALES) {
      const lost = String(getRuntimeTranslation(locale, destructiveKey("revokeAiKey", "lost")));
      expect(lost, locale).not.toMatch(/this computer|cet ordinateur|هذا الحاسوب/);
    }
    expect(getRuntimeTranslation("en", destructiveKey("revokeAiKey", "lost"))).toMatch(/plain rules/);
  });
});
