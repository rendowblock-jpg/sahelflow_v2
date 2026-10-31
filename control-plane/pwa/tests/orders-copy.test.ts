// W3-F4 step 5: the words. Reason labels equal the desktop wording; every key is in all three languages.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REJECT_REASON_KEYS } from "../../../src/lib/connected-platform/contracts";
import { LOCALES, catalogs } from "../src/i18n";

// The desktop wording of the four reasons lives in the runtime catalog (en, fr, ar blocks in this order).
const runtime = readFileSync(new URL("../../../src/lib/i18n/confirmation-runtime.ts", import.meta.url), "utf8");
const desktop = (l: "en" | "fr" | "ar", k: string): string | undefined => {
  const at = runtime.search(new RegExp(`^\\s*${l}:\\s*\\{`, "m")); if (at < 0) return undefined;
  return runtime.slice(at).match(new RegExp(`"confirmationQueue\\.reject\\.reason\\.${k}":\\s*"([^"]+)"`))?.[1];
};

describe("reject reasons", () => {
  it("the phone has one label per REJECT_REASON_KEYS key, nothing more", () => {
    for (const l of LOCALES) {
      const keys = Object.keys(catalogs[l]).filter((k) => k.startsWith("cmd.reason.")).map((k) => k.slice("cmd.reason.".length)).sort();
      expect(keys, l).toEqual([...REJECT_REASON_KEYS].sort());
    }
  });
  it("each label equals the desktop wording (confirmationQueue.reject.reason.*) per language", () => {
    for (const l of LOCALES) for (const k of REJECT_REASON_KEYS) { expect(desktop(l, k), `desktop ${l}:${k}`).toBeTruthy(); expect(catalogs[l][`cmd.reason.${k}`], `${l}:${k}`).toBe(desktop(l, k)); }
  });
});

describe("orders and notes keys", () => {
  const MUST = ["orders.title", "orders.filter.confirm", "orders.filter.today", "orders.filter.all", "orders.empty.confirm", "orders.empty.today", "orders.empty.all", "orders.error.read", "orders.window", "orders.window.all",
    "orders.state.expired", "orders.status.pending", "orders.status.confirmed", "orders.detail.gone", "orders.detail.error", "orders.detail.hidden", "orders.detail.changed", "orders.outcome.done", "orders.outcome.changed",
    "orders.outcome.expired", "orders.outcome.denied", "orders.outcome.notfound", "orders.outcome.notconfirmable", "orders.busy", "notes.empty", "notes.error.send", "notes.offline", "notes.error.busy", "notes.error.empty"];
  it("exist in ar, fr and en with real text", () => { for (const l of LOCALES) for (const k of MUST) expect((catalogs[l][k] ?? "").trim().length, `${l}:${k}`).toBeGreaterThan(2); });
  it("the brief's English sentences are verbatim", () => {
    const en = catalogs.en;
    expect(en["orders.empty.confirm"]).toBe("Nothing to confirm. Well done.");
    expect(en["orders.window"]).toBe("Showing the latest {{shown}} of {{total}}");
    expect(en["orders.detail.hidden"]).toBe("Hidden for your role");
    expect(en["notes.empty"]).toBe("No notes yet");
    expect(en["orders.detail.gone"]).toBe("This order is not in the latest list. Open it on your PC");
  });
});
