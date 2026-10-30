import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getInboxCarnetRuntimeTranslation } from "@/lib/i18n/inbox-carnet-runtime";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const css = () => read("src/components/inbox/inbox-v3-workspace.module.css");
const queue = () => read("src/components/inbox/inbox-v3-queue.tsx");
const header = () => read("src/components/inbox/inbox-v3-header.tsx");
const LOCALES = ["ar", "fr", "en"] as const;

/** Body of the first rule whose selector text contains `selector`. */
function rule(source: string, selector: string): string {
  const at = source.indexOf(selector);
  expect(at, `css selector ${selector}`).toBeGreaterThan(-1);
  const open = source.indexOf("{", at);
  return source.slice(open + 1, source.indexOf("}", open));
}

describe("selected row is more than a faint tint (luminance 1.4:1 is lead-measured, NOT asserted here)", () => {
  it("5px primary bar on the inline-start edge, logical properties", () => {
    const bar = rule(css(), '.row[aria-current="true"]::before');
    expect(bar).toMatch(/inline-size:\s*5px/);
    expect(bar).toMatch(/inset-inline-start:\s*0/);
    expect(bar).toContain("var(--primary)");
  });
  it("1px inline-start outline in primary at 40%", () => {
    const sel = rule(css(), '.row[aria-current="true"] {');
    expect(sel).toMatch(/border-inline-start:\s*1px solid color-mix\(in oklab, var\(--primary\) 40%, transparent\)/);
  });
  it("row steps one surface up (background on the muted list) and the name goes to weight 600", () => {
    expect(rule(css(), ".list {")).toContain("var(--muted)");
    expect(rule(css(), '.row[aria-current="true"] {')).toContain("background: var(--background)");
    expect(rule(css(), '.row[aria-current="true"] .rowName')).toMatch(/font-weight:\s*600/);
  });
  it("the row element carries aria-current and the module row class", () => {
    const q = queue();
    expect(q).toContain("aria-current={!selectMode && active ? \"true\" : undefined}");
    expect(q).toContain("styles.row");
    expect(q).toContain("styles.rowName");
  });
});

describe("row geometry, touch targets, phone, RTL, motion", () => {
  it("72px row, 44px tabs on touch, flat skeleton at the same height", () => {
    expect(rule(css(), ".row {")).toMatch(/block-size:\s*72px/);
    expect(rule(css(), ".skeletonRow {")).toMatch(/block-size:\s*72px/);
    expect(css()).toMatch(/@media \(pointer: coarse\)[\s\S]*\.tab[\s\S]*min-block-size:\s*44px/);
  });
  it("no physical left/right and no animation in the module css", () => {
    expect(css()).not.toMatch(/(margin|padding|border)-(left|right)|[\s{;]left:|[\s{;]right:|text-align:\s*(left|right)/);
    expect(css()).not.toMatch(/@keyframes|animation:|transition:/);
  });
  it("carnet decoration is scoped to the preset and defines none of the shared primitives", () => {
    const c = css();
    expect(c).toContain('html[data-theme-preset="carnet"]');
    expect(c).toMatch(/Amiri/);
    expect(c).not.toMatch(/\.carnet-(ruled|margin|stamp)\s*[{,]/);
    const outside = c.split('html[data-theme-preset="carnet"]')[0]!;
    expect(outside).not.toMatch(/Amiri|--carnet-/);
  });
  it("row markup uses logical classes only and no shimmer", () => {
    const q = queue();
    const rowSrc = q.slice(q.indexOf("const ConversationRow"), q.indexOf("export function InboxV3Queue"));
    expect(rowSrc).not.toMatch(/(?<![\w-])(ml|mr|pl|pr)-[\w\[]|(?<![\w-])(left|right)-[\w\[]|text-(left|right)/);
    expect(q).not.toContain("animate-pulse");
    expect(read("src/components/inbox/inbox-queue-states.tsx")).not.toContain("animate-");
  });
  it("row has a chip with data-inbox-row-chip, the preview glyph and the ink unread badge", () => {
    const q = queue();
    expect(q).toContain("data-inbox-row-chip");
    expect(q).toContain("<PreviewGlyph");
    expect(q).toContain("styles.unreadBadge");
  });
});

describe("one connection surface", () => {
  it("header no longer owns a second status chip, the degraded strip or the dock", () => {
    const h = header();
    expect(h).not.toContain("transportUnavailable");
    expect(h).not.toContain('copy("dataDegraded")');
    expect(h).not.toContain("<WhatsAppIngressRecoveryDock");
    expect(h).toContain("<InboxLinkSurface");
  });
  it("the surface embeds the dock and the unofficial line instead of stacking them", () => {
    const s = read("src/components/inbox/inbox-link-surface.tsx");
    expect(s).toContain("<WhatsAppIngressRecoveryDock");
    expect(s).toContain("embedded");
    expect(s).toContain("<WhatsAppUnofficialNotice");
    expect(s).toContain("data-inbox-link-tag");
    expect(s).toContain("data-inbox-link-banner");
    expect(s).toContain("deriveInboxLinkState(");
  });
  it("the unofficial notice keeps its default (pairing dialog, onboarding) and gains a compact variant", () => {
    const n = read("src/components/inbox/whatsapp-unofficial-notice.tsx");
    expect(n).toContain("inbox.unofficialNoticeBody");
    expect(n).toMatch(/variant\??:\s*"alert"\s*\|\s*"detail"/);
  });
});

describe("list footer and tabs are honest", () => {
  it("footer comes from deriveListFooter with total null, tabs from tabCounts", () => {
    const q = queue();
    expect(q).toContain("deriveListFooter(");
    expect(q).toContain("total: null");
    expect(q).toContain("tabCounts(");
    expect(q).not.toMatch(/queueCounts\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{\s*\/\/ Ledger INB-12: archive-aware/);
  });
  it("states are components", () => {
    const q = queue();
    for (const c of ["<InboxQueueLoading", "<InboxQueueEmpty", "<InboxQueueError"]) expect(q).toContain(c);
  });
});

describe("runtime catalog", () => {
  const src = read("src/lib/i18n/inbox-carnet-runtime.ts");
  const keys = [...new Set([...src.matchAll(/"(inbox\.carnet\.[A-Za-z.]+)":/g)].map((m) => m[1]!))];
  it("has keys and the same keys in ar, fr and en, all non-empty, same placeholders", () => {
    expect(keys.length).toBeGreaterThan(30);
    for (const k of keys) {
      const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
      const en = getInboxCarnetRuntimeTranslation("en", k);
      for (const l of LOCALES) {
        const v = getInboxCarnetRuntimeTranslation(l, k);
        expect(v, `${l}:${k}`).toBeTruthy();
        expect(ph(v!), `${l}:${k} placeholders`).toBe(ph(en!));
      }
    }
  });
  it("is registered in runtime-translations with one import and one line", () => {
    const rt = read("src/lib/i18n/runtime-translations.ts");
    expect(rt).toContain('import { getInboxCarnetRuntimeTranslation } from "@/lib/i18n/inbox-carnet-runtime";');
    expect(rt).toContain("getInboxCarnetRuntimeTranslation(locale, key) ??");
  });
});
