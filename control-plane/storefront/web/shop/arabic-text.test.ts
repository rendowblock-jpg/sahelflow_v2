import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { STYLE_IDS } from "./styles";
import { autoDir } from "./ui";
import { publishTestStore, renderInputFor, SAMPLE_PRODUCTS } from "../test-support";

/**
 * A seller writes Arabic; the buyer opens the page in French or English. The page language is then "fr" or "en", so every
 * Arabic-only rule keyed on <html lang="ar"> (no letter spacing, taller lines) stayed off and the Arabic words were drawn
 * with the Latin design's spacing, which breaks the joined letters. The fix tags the seller's Arabic text itself with
 * lang="ar" and keys the same rules on that tag.
 */

const STYLES_DIR = join(process.cwd(), "control-plane/storefront/web/styles");
const sheets = readdirSync(STYLES_DIR).filter((name) => name.endsWith(".css")).sort();
const sheet = (name: string) => readFileSync(join(STYLES_DIR, name), "utf8");

describe("autoDir: dir=auto, plus lang=ar for Arabic text on a page that is not Arabic", () => {
  const fr = { locale: "fr" as const };
  const en = { locale: "en" as const };
  const ar = { locale: "ar" as const };

  it("tags Arabic text on a French and on an English page", () => {
    expect(autoDir(fr, "ساعة حائط")).toBe(' dir="auto" lang="ar"');
    expect(autoDir(en, "ساعة حائط")).toBe(' dir="auto" lang="ar"');
  });

  it("adds nothing on an Arabic page, so Arabic pages stay byte for byte what they were", () => {
    expect(autoDir(ar, "ساعة حائط")).toBe(' dir="auto"');
    expect(autoDir(ar, "Montre murale")).toBe(' dir="auto"');
  });

  it("adds nothing to Latin text, empty text, or text led by another script", () => {
    expect(autoDir(fr, "Montre murale")).toBe(' dir="auto"');
    expect(autoDir(fr, "")).toBe(' dir="auto"');
    expect(autoDir(fr, "   ")).toBe(' dir="auto"');
    expect(autoDir(en, "שלום")).toBe(' dir="auto"');
  });

  it("decides on the first letter, the way dir=auto does: digits, signs, quotes and emoji before it do not count", () => {
    expect(autoDir(fr, '«  "٣ ساعات"')).toBe(' dir="auto" lang="ar"');
    expect(autoDir(fr, "2 ساعات")).toBe(' dir="auto" lang="ar"');
    expect(autoDir(en, "😀 ساعة")).toBe(' dir="auto" lang="ar"');
    expect(autoDir(fr, "- 50% ساعة")).toBe(' dir="auto" lang="ar"');
  });

  it("a Latin letter first keeps the text Latin, even when Arabic words follow (the browser sets that line left to right too)", () => {
    expect(autoDir(fr, "iPhone 15 حافظة")).toBe(' dir="auto"');
    expect(autoDir(fr, "2 pièces ساعة")).toBe(' dir="auto"');
  });

  it("reads Persian and Urdu letters as Arabic script", () => {
    expect(autoDir(fr, "گل")).toBe(' dir="auto" lang="ar"');
    expect(autoDir(en, "ٹوپی")).toBe(' dir="auto" lang="ar"');
  });
});

/* ------------------------------------------------------------------ the rendered pages ---- */

type Locale = "ar" | "fr" | "en";
const ARABIC_FIRST = /^[^\p{L}]*\p{Script=Arabic}/u;
const unescape = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/** Every element that carries dir="auto", with the text it shows (inner tags removed, up to its closing tag). */
function autoElements(html: string): Array<{ tag: string; text: string; tagged: boolean }> {
  const found: Array<{ tag: string; text: string; tagged: boolean }> = [];
  for (const match of html.matchAll(/<([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)>/g)) {
    const attrs = match[2] ?? "";
    if (!/\sdir="auto"/.test(attrs)) continue;
    const tag = match[1] ?? "";
    const from = (match.index ?? 0) + match[0].length;
    const close = html.indexOf(`</${tag}>`, from);
    const inner = close === -1 ? "" : html.slice(from, close);
    found.push({ tag, text: unescape(inner.replace(/<[^>]*>/g, "")), tagged: /\slang="ar"/.test(attrs) });
  }
  return found;
}

const ARABIC = {
  storeName: "متجر الساحل",
  announcement: "شحن مجاني لكل الولايات",
  eyebrow: "مجموعة جديدة",
  headline: "أجمل الهدايا من الجزائر",
  body: "منتجات مصنوعة بعناية وتوصيل إلى باب البيت",
  title: "قصتنا",
  question: "كم يستغرق التوصيل؟",
  answer: "من يومين إلى خمسة أيام",
  quote: "خدمة ممتازة وتوصيل سريع",
  customer: "أمينة",
  address: "شارع ديدوش مراد، الجزائر",
  product: "ساعة حائط",
  second: "مرآة جدارية للصالون",
  description: "ساعة حائط أنيقة بتصميم عصري.\n\nمصنوعة من الخشب الطبيعي، تعمل بمحرك صامت، وتصلح للصالون وغرفة النوم.",
} as const;

/** A sample product by position; fails loudly instead of returning undefined. */
function sample(index: number): (typeof SAMPLE_PRODUCTS)[number] {
  const product = SAMPLE_PRODUCTS[index];
  if (!product) throw new Error(`no sample product ${index}`);
  return product;
}

const PRODUCTS = [
  { ...sample(0), id: "product_00000001", name: ARABIC.product, description: ARABIC.description, images: JSON.stringify(["https://images.example.test/a-1.jpg"]) },
  { ...sample(0), id: "product_00000002", name: ARABIC.second, sku: "AR-2", description: "", images: JSON.stringify(["https://images.example.test/a-2.jpg"]) },
  { ...sample(2), id: "product_00000003", name: "Tapis berbère" },
] as unknown as typeof SAMPLE_PRODUCTS;

async function arabicStore(template: (typeof STYLE_IDS)[number] | "sahara" | "atlas" | "oasis" | "prime" | "souk" | "reel", mode: "landing" | "store") {
  return publishTestStore({
    template,
    locale: "ar",
    storeName: ARABIC.storeName,
    products: PRODUCTS,
    shapeTheme: (theme) => {
      (theme as unknown as { mode: string }).mode = mode;
      theme.announcement = { enabled: true, text: ARABIC.announcement };
      theme.hero = { ...theme.hero, eyebrow: ARABIC.eyebrow, headline: ARABIC.headline, body: ARABIC.body };
      theme.builder.contact = { phone: "0550123456", whatsapp: "0550123456", email: "a@b.test", address: ARABIC.address };
      theme.builder.composition.sections = [
        ...theme.builder.composition.sections.filter((section) => section.type !== "faq" && section.type !== "testimonials"),
        { id: "media_arabic", type: "media" as const, enabled: true, settings: { eyebrow: ARABIC.eyebrow, title: ARABIC.title, body: ARABIC.body }, blocks: [] },
        { id: "faq_arabic", type: "faq" as const, enabled: true, settings: { title: ARABIC.title }, blocks: [{ id: "faq_item_1", type: "faq", settings: { question: ARABIC.question, answer: ARABIC.answer } }] },
        { id: "quotes_arabic", type: "testimonials" as const, enabled: true, settings: { title: ARABIC.title }, blocks: [{ id: "review_item_1", type: "testimonial", settings: { quote: ARABIC.quote, name: ARABIC.customer, role: ARABIC.title } }] },
      ] as never;
    },
  });
}

type Store = Awaited<ReturnType<typeof arabicStore>>;
function render(store: Store, locale: Locale, productId: string | null): string {
  const html = renderStorePage(renderInputFor(store, { locale, productId }));
  if (html === null) throw new Error(`page not found: ${productId}`);
  return html;
}

const PAGES: ReadonlyArray<string | null> = [null, "product_00000001", "product_00000002"];

describe("the pages tag the seller's Arabic text with lang=ar when the page is not Arabic", () => {
  for (const style of STYLE_IDS) {
    for (const mode of ["landing", "store"] as const) {
      it(`${style} ${mode}: French and English pages - every dir=auto text that starts with an Arabic letter carries lang=ar, no other does`, async () => {
        const store = await arabicStore(style, mode);
        let tagged = 0;
        for (const locale of ["fr", "en"] as const) {
          for (const productId of PAGES) {
            const html = render(store, locale, productId);
            for (const element of autoElements(html)) {
              const arabic = ARABIC_FIRST.test(element.text);
              expect(element.tagged, `${style} ${mode} ${locale} ${productId ?? "home"}: <${element.tag}> "${element.text.slice(0, 40)}"`).toBe(arabic);
              if (element.tagged) tagged += 1;
            }
          }
        }
        // the scenario really exercised the sites (a page with nothing tagged would pass the loop above)
        expect(tagged).toBeGreaterThan(25);
        store.database.close();
      });

      it(`${style} ${mode}: Arabic pages carry no lang=ar on any text, so their HTML is unchanged`, async () => {
        const store = await arabicStore(style, mode);
        for (const productId of PAGES) {
          const html = render(store, "ar", productId);
          expect(html).not.toContain(' dir="auto" lang="ar"');
          expect(html).not.toMatch(/lang="ar"[^>]*dir="auto"/);
        }
        store.database.close();
      });
    }
  }

  it.each(["sahara", "atlas", "oasis", "prime", "souk", "reel"] as const)("%s (older template): the same rule holds on a French page", async (template) => {
    const store = await arabicStore(template, "store");
    let tagged = 0;
    for (const productId of PAGES) {
      for (const element of autoElements(render(store, "fr", productId))) {
        expect(element.tagged, `${template} ${productId ?? "home"}: <${element.tag}> "${element.text.slice(0, 40)}"`).toBe(ARABIC_FIRST.test(element.text));
        if (element.tagged) tagged += 1;
      }
    }
    expect(tagged).toBeGreaterThan(10);
    store.database.close();
  });

  it("a French store with French text carries no lang=ar on its text (only the language switch names Arabic)", async () => {
    const store = await publishTestStore({
      template: "lumen",
      locale: "fr",
      storeName: "Boutique du Sahel",
      // the default sample products include one with an Arabic name, which is rightly tagged; this store sells Latin names only
      products: [sample(0), sample(2)],
      shapeTheme: (theme) => {
        (theme as unknown as { mode: string }).mode = "store";
        theme.hero = { ...theme.hero, eyebrow: "Nouveautés", headline: "Les plus beaux cadeaux", body: "Livraison partout en Algérie" };
      },
    });
    for (const productId of [null, "product_00000001"]) {
      const html = renderStorePage(renderInputFor(store, { productId }));
      expect(html).not.toBeNull();
      expect(html).not.toContain(' dir="auto" lang="ar"');
      // the only lang="ar" allowed on a French page with French text: the language switch that names Arabic (how many times it is drawn is not this test's business)
      const tags = html?.match(/<[^>]*\slang="ar"[^>]*>/g) ?? [];
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) expect(tag, tag).toContain('class="sf-lang-i"');
    }
    store.database.close();
  });
});

/* ------------------------------------------------------------------ the stylesheets ---- */

const METRICS = ["line-height", "letter-spacing", "text-transform"] as const;
type Rule = { file: string; selector: string; body: string; metrics: string[] };

/** Every one-line `html[lang=ar] <selector>{<declarations>}` rule in the shared stylesheet and in each template's. */
function arabicRules(): Rule[] {
  const rules: Rule[] = [];
  for (const file of sheets) {
    for (const line of sheet(file).split("\n")) {
      if (!line.startsWith("html[lang=ar]")) continue;
      const match = /^html\[lang=ar\](.*?)\{(.*)\}$/.exec(line);
      if (!match) throw new Error(`${file}: an html[lang=ar] rule that is not on one line, the pairing test cannot read it: ${line.slice(0, 80)}`);
      const declarations = (match[2] ?? "").split(";").filter(Boolean);
      const metrics = declarations.filter((declaration) => METRICS.some((name) => declaration.startsWith(`${name}:`)));
      rules.push({ file, selector: (match[1] ?? "").trim(), body: match[2] ?? "", metrics });
    }
  }
  return rules;
}

describe("the stylesheets give Arabic seller text on a French or English page the Arabic text metrics", () => {
  it("reads the rules it pairs: there are Arabic rules with text metrics in the shared sheet and in every one of the five styles", () => {
    const withMetrics = arabicRules().filter((rule) => rule.metrics.length > 0);
    for (const file of ["shop.css", "noir.css", "lumen.css", "atelier.css", "pulse.css", "bloom.css"]) {
      expect(withMetrics.some((rule) => rule.file === file), file).toBe(true);
    }
    expect(withMetrics.length).toBeGreaterThanOrEqual(14);
  });

  it("the shared sheet switches letter spacing and capitals off for tagged text, as it does for an Arabic page", () => {
    expect(sheet("shop.css")).toContain(
      "html:not([lang=ar]) [dir=auto]:lang(ar),html:not([lang=ar]) [dir=auto]:lang(ar) *{letter-spacing:normal!important;text-transform:none!important}",
    );
  });

  it("every other html[lang=ar] rule that sets line height, letter spacing or capitals has a twin for tagged text with the same values", () => {
    const missing: string[] = [];
    for (const rule of arabicRules()) {
      if (rule.metrics.length === 0 || rule.selector === "*") continue;
      const twin = `html:not([lang=ar]) ${rule.selector}:lang(ar){${rule.metrics.join(";")}}`;
      if (!sheet(rule.file).split("\n").includes(twin)) missing.push(`${rule.file}: ${twin}`);
    }
    expect(missing).toEqual([]);
  });

  it("no twin shares a selector list with a rule that is not a twin, and none sets anything but text metrics (an unsupported selector would drop its whole rule)", () => {
    for (const file of sheets) {
      for (const line of sheet(file).split("\n")) {
        if (!line.includes(":lang(ar)")) continue;
        expect(line.startsWith("html:not([lang=ar])"), `${file}: ${line.slice(0, 90)}`).toBe(true);
        const open = line.lastIndexOf("{");
        const selectors = line.slice(0, open).split(/,(?![^(]*\))/);
        for (const selector of selectors) expect(selector.includes(":lang(ar)"), `${file}: ${selector}`).toBe(true);
        for (const declaration of line.slice(open + 1, -1).split(";").filter(Boolean)) {
          expect(METRICS.some((name) => declaration.startsWith(`${name}:`)), `${file}: ${declaration}`).toBe(true);
        }
      }
    }
  });
});
