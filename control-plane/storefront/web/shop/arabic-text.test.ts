import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { STYLE_IDS } from "./styles";
import { arabicAttrs, autoDir } from "./ui";
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


describe("arabicAttrs: the same tag for the places that carry no dir=auto today, and nothing at all where an Arabic page must stay as it was", () => {
  const fr = { locale: "fr" as const };
  const ar = { locale: "ar" as const };

  it("gives dir=auto and lang=ar to Arabic text on a page that is not Arabic", () => {
    expect(arabicAttrs(fr, "اكتشف المجموعة")).toBe(' dir="auto" lang="ar"');
    expect(arabicAttrs({ locale: "en" }, "2 ساعات")).toBe(' dir="auto" lang="ar"');
  });

  it("gives nothing on an Arabic page, for Latin text, for empty text, and when a Latin letter comes first", () => {
    expect(arabicAttrs(ar, "اكتشف المجموعة")).toBe("");
    expect(arabicAttrs(fr, "Découvrir")).toBe("");
    expect(arabicAttrs(fr, "")).toBe("");
    expect(arabicAttrs(fr, "iPhone 15 حافظة")).toBe("");
  });

  it("autoDir is dir=auto plus whatever arabicAttrs adds", () => {
    for (const text of ["اكتشف المجموعة", "Découvrir", ""]) {
      for (const page of [fr, ar]) expect(autoDir(page, text)).toBe(arabicAttrs(page, text) || ' dir="auto"');
    }
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

/**
 * Every piece of text on the page that starts with an Arabic letter, whose nearest lang attribute is not "ar".
 * This is the rule itself, so it also catches a seller text nobody thought to tag (a button label, an option name):
 * the reader above only sees elements that already carry dir="auto".
 */
function arabicTextOutsideLangAr(html: string): string[] {
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
  try {
    const document = new window.DOMParser().parseFromString(html, "text/html");
    const found: string[] = [];
    const nearestLang = (element: Element | null): string => {
      for (let current = element; current; current = current.parentElement) {
        const lang = current.getAttribute("lang");
        if (lang) return lang;
      }
      return "";
    };
    const walk = (node: Node): void => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3) {
          const text = (child.textContent ?? "").trim();
          if (ARABIC_FIRST.test(text) && nearestLang(child.parentElement) !== "ar") found.push(`<${child.parentElement?.tagName.toLowerCase() ?? "?"}${child.parentElement?.getAttribute("class") ? `.${child.parentElement.getAttribute("class")?.split(" ").join(".")}` : ""}> ${text.slice(0, 40)}`);
        } else if (child.nodeType === 1) {
          const name = (child as Element).tagName.toLowerCase();
          if (name !== "script" && name !== "style" && name !== "noscript" && name !== "template") walk(child);
        }
      }
    };
    walk(document.body as unknown as Node);
    return found;
  } finally {
    void window.happyDOM.close();
  }
}

/** How many Arabic texts the page has in all (a page with none would pass the rule for nothing). */
function arabicTextCount(html: string): number {
  return (unescape(html.replace(/<(script|style)[\s\S]*?<\/\1>/g, "").replace(/<[^>]*>/g, "\n")).match(/^[^\S\n]*[^\p{L}\n]*\p{Script=Arabic}/gmu) ?? []).length;
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
  cta: "اكتشف المجموعة",
  cod: "الدفع عند الاستلام مضمون",
  small: "صغير",
  large: "كبير",
  description: "ساعة حائط أنيقة بتصميم عصري.\n\nمصنوعة من الخشب الطبيعي، تعمل بمحرك صامت، وتصلح للصالون وغرفة النوم.",
} as const;

/** A sample product by position; fails loudly instead of returning undefined. */
function sample(index: number): (typeof SAMPLE_PRODUCTS)[number] {
  const product = SAMPLE_PRODUCTS[index];
  if (!product) throw new Error(`no sample product ${index}`);
  return product;
}

const PRODUCTS = [
  { ...sample(0), id: "product_00000001", name: ARABIC.product, description: ARABIC.description, productVariants: [{ id: "variant_small", name: ARABIC.small, price: 2_400, stock: 4, isActive: true }, { id: "variant_large", name: ARABIC.large, price: 2_900, stock: 3, isActive: true }], images: JSON.stringify(["https://images.example.test/a-1.jpg"]) },
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
      theme.hero = { ...theme.hero, eyebrow: ARABIC.eyebrow, headline: ARABIC.headline, body: ARABIC.body, ctaLabel: ARABIC.cta };
      theme.checkout = { ...theme.checkout, showCodPromise: true, codPromiseText: ARABIC.cod };
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
        let arabicSeen = 0;
        for (const locale of ["fr", "en"] as const) {
          for (const productId of PAGES) {
            const html = render(store, locale, productId);
            expect(arabicTextOutsideLangAr(html), `${style} ${mode} ${locale} ${productId ?? "home"}: Arabic text outside a lang=ar element`).toEqual([]);
            arabicSeen += arabicTextCount(html);
            for (const element of autoElements(html)) {
              const arabic = ARABIC_FIRST.test(element.text);
              expect(element.tagged, `${style} ${mode} ${locale} ${productId ?? "home"}: <${element.tag}> "${element.text.slice(0, 40)}"`).toBe(arabic);
              if (element.tagged) tagged += 1;
            }
          }
        }
        // the scenario really exercised the sites (a page with nothing tagged would pass the loop above)
        expect(tagged).toBeGreaterThan(25);
        expect(arabicSeen).toBeGreaterThan(40);
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
      const html = render(store, "fr", productId);
      expect(arabicTextOutsideLangAr(html), `${template} ${productId ?? "home"}: Arabic text outside a lang=ar element`).toEqual([]);
      for (const element of autoElements(html)) {
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


describe("a tag that covers only the seller's words, never the words of the page next to them", () => {
  async function french(mode: "landing" | "store") {
    const [first, second] = PRODUCTS;
    if (!first || !second) throw new Error("the Arabic sample products are missing");
    const soldOutSmall = { ...first, productVariants: [{ id: "variant_small", name: ARABIC.small, price: 2_400, stock: 0, isActive: true }, { id: "variant_large", name: ARABIC.large, price: 2_900, stock: 3, isActive: true }] };
    return publishTestStore({
      template: "lumen",
      locale: "fr",
      storeName: ARABIC.storeName,
      products: [soldOutSmall, second] as unknown as typeof SAMPLE_PRODUCTS,
      shapeTheme: (theme) => {
        (theme as unknown as { mode: string }).mode = mode;
      },
    });
  }
  /** Runs a check on the parsed page, then closes the window. */
  function inPage(html: string, check: (body: HTMLElement) => void): void {
    const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
    try {
      check(new window.DOMParser().parseFromString(html, "text/html").body as unknown as HTMLElement);
    } finally {
      void window.happyDOM.close();
    }
  }

  it("a sold-out option: its name is Arabic, the word 'sold out' next to it stays French", async () => {
    const store = await french("landing");
    inPage(render(store, "fr", null), (root) => {
      const pill = root.querySelector("label.sf-pill.is-out");
      expect(pill, "the sold-out option is drawn").not.toBeNull();
      expect(pill?.querySelector('[lang="ar"]')?.textContent).toBe(ARABIC.small);
      const soldOut = pill?.querySelector("small");
      expect(soldOut, "the sold-out note is drawn").not.toBeNull();
      expect(soldOut?.closest('[lang="ar"]')).toBeNull();
    });
    store.database.close();
  });

  it("the footer line 'store name · SahelFlow': the name is Arabic, the rest of the line is not", async () => {
    const store = await french("store");
    inPage(render(store, "fr", null), (root) => {
      const line = root.querySelector(".sf-foot small");
      expect(line, "the footer line is drawn").not.toBeNull();
      expect(line?.closest('[lang="ar"]')).toBeNull();
      const name = line?.querySelector('[lang="ar"]');
      expect(name?.textContent).toBe(ARABIC.storeName);
      expect(name?.getAttribute("dir")).toBe("auto");
      expect(line?.textContent).toContain("SahelFlow");
    });
    store.database.close();
  });

  it("on an Arabic page the same two places are drawn with no extra element", async () => {
    for (const mode of ["landing", "store"] as const) {
      const store = await french(mode);
      inPage(render(store, "ar", "product_00000001"), (root) => {
        // the option name sits straight in the option's span, the footer line holds only text
        expect(root.querySelectorAll("label.sf-pill").length, `${mode}: the options are drawn`).toBeGreaterThan(0);
        expect(root.querySelectorAll("label.sf-pill > span > span").length, `${mode}: a span inside an option`).toBe(0);
        expect(root.querySelectorAll(".sf-foot small > *").length, `${mode}: an element inside the footer line`).toBe(0);
        expect(root.querySelectorAll('[lang="ar"]:not(.sf-lang-i)').length, `${mode}: lang=ar on an Arabic page`).toBe(0);
      });
      store.database.close();
    }
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

/**
 * The footer's store name is drawn at 24-40 px with `font: 700 ... / 1.1`, which is tight for Arabic: the marks above and
 * below the letters of a joined line reach into the neighbouring lines. The Arabic page, and a store name tagged lang=ar
 * on a French or English page, get a normal line height; Latin names keep 1.1.
 */
describe("the footer store name has room for Arabic", () => {
  const lineHeight = (line: string | undefined): number => {
    const match = /\{(?:[^}]*;)?line-height:([0-9.]+)(?:;[^}]*)?\}$/.exec(line ?? "");
    return match ? Number(match[1]) : Number.NaN;
  };
  const lines = sheet("shop.css").split("\n");

  it("keeps 1.1 for Latin names (the shared rule is unchanged)", () => {
    const base = lines.find((line) => line.startsWith(".sf-foot strong{"));
    expect(base, "the shared footer name rule").toBeDefined();
    expect(base).toContain("/1.1 var(--sf-display)");
  });

  it("gives the Arabic page a line height of at least 1.3, and tagged Arabic text on other pages the same", () => {
    const arabic = lines.find((line) => line.startsWith("html[lang=ar] .sf-foot strong{"));
    expect(arabic, "html[lang=ar] .sf-foot strong rule").toBeDefined();
    expect(lineHeight(arabic)).toBeGreaterThanOrEqual(1.3);
    const tagged = lines.find((line) => line.startsWith("html:not([lang=ar]) .sf-foot strong:lang(ar){"));
    expect(tagged, "twin for Arabic text on a French or English page").toBeDefined();
    expect(lineHeight(tagged)).toBe(lineHeight(arabic));
  });

  it("is not tightened again by a style sheet", () => {
    for (const file of sheets.filter((name) => name !== "shop.css")) {
      for (const line of sheet(file).split("\n")) {
        if (!line.includes(".sf-foot strong")) continue;
        expect(/line-height|font:/.test(line), `${file}: ${line.slice(0, 90)}`).toBe(false);
      }
    }
  });
});
