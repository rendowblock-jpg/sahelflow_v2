import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PERMANENT_PACKAGE } from "@/lib/license/packages";

// sahelflow.com is plain ESM; its modules are imported as data.
const model = await import("../marketing/src/model.mjs");
const { COPY } = (await import("../marketing/src/i18n/index.mjs")) as { COPY: Record<string, unknown> };
const { SITE } = await import("../marketing/src/config.mjs");
const { build } = await import("../marketing/build.mjs");
const claims = await import("../marketing/src/claims.mjs");

describe("sahelflow.com package facts", () => {
  it("promise exactly what the signed permanent licence grants", () => {
    expect(SITE.licencePrice).toBe(PERMANENT_PACKAGE.priceDzd);
    expect(model.PACKAGE.extraShopPriceDzd).toBe(PERMANENT_PACKAGE.extraShopPriceDzd);
    expect(model.PACKAGE.includedShops).toBe(PERMANENT_PACKAGE.includedShops);
    expect(model.PACKAGE.maximumShops).toBe(PERMANENT_PACKAGE.maximumShops);
    // memberLimit counts the owner plus the team.
    expect(model.PACKAGE.teamMembers).toBe(PERMANENT_PACKAGE.memberLimit - 1);
    expect(model.PACKAGE.updateYears * 12).toBe(PERMANENT_PACKAGE.supportMonths);
  });
});

/** Shape of a copy tree: keys, array lengths and value kinds, not the words. */
function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape((value as Record<string, unknown>)[key])]));
  }
  return typeof value;
}

describe("sahelflow.com copy", () => {
  it("has the same structure in Arabic, French and English", () => {
    const reference = shape(COPY.en);
    for (const locale of SITE.locales) expect(shape(COPY[locale]), locale).toEqual(reference);
  });

  it("keeps digit groups together so Arabic never reorders a number", () => {
    for (const locale of SITE.locales) {
      const text = JSON.stringify(COPY[locale]);
      expect(text, locale).not.toMatch(/\d \d/);
    }
  });
});

describe("sahelflow.com build", () => {
  let out = "";
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(out, path));
    }
  };

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "sahelflow-site-"));
    build(out);
    walk(out);
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("renders every page in every language", () => {
    for (const locale of SITE.locales) {
      for (const [, path] of model.sitePages()) {
        expect(existsSync(join(out, locale, path ?? "", "index.html")), `${locale}/${path}`).toBe(true);
      }
    }
    expect(existsSync(join(out, "404.html"))).toBe(true);
    expect(existsSync(join(out, "sitemap.xml"))).toBe(true);
  });

  it("ships every screenshot a module page shows", () => {
    for (const locale of SITE.locales) {
      for (const entry of model.MODULES) {
        for (const shot of [entry.shot, ...entry.gallery].filter((value): value is string => Boolean(value))) {
          expect(existsSync(join(out, "img", "screens", `${shot}-${locale}-800.webp`)), `${shot}-${locale}`).toBe(true);
        }
      }
    }
  });

  it("produces pages with no unrendered values, valid JSON-LD and working internal links", () => {
    const pages = files.filter((file) => file.endsWith(".html"));
    expect(pages.length).toBeGreaterThan(60);
    for (const page of pages) {
      const html = readFileSync(join(out, page), "utf8");
      expect(html, page).not.toMatch(/undefined|\[object |NaN/);
      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        expect(() => JSON.parse(match[1] ?? ""), page).not.toThrow();
      }
      for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
        const href = match[1] ?? "";
        if (href.startsWith("/get/")) continue;
        const target = href.endsWith("/") ? join(out, href, "index.html") : join(out, href);
        expect(existsSync(target), `${page} → ${href}`).toBe(true);
      }
    }
  });

  it("keeps every script same-origin for the site's CSP", () => {
    const headers = readFileSync(join(out, "_headers"), "utf8");
    expect(headers).toContain("script-src 'self'");
    for (const page of files.filter((file) => file.endsWith(".html"))) {
      const html = readFileSync(join(out, page), "utf8");
      for (const match of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) expect(match[1]?.startsWith("/"), `${page} → ${match[1]}`).toBe(true);
    }
  });

  it("allows only the page's own inline script by hash, never every inline script", () => {
    const headers = readFileSync(join(out, "_headers"), "utf8");
    const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? "";
    const scriptSrc = /(?:^|;\s*)script-src ([^;]*)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // The inline speculation rules are data the browser reads; Chromium needs this keyword for them.
    expect(scriptSrc).toContain("'inline-speculation-rules'");

    const inlineHashes = new Set<string>();
    for (const page of files.filter((file) => file.endsWith(".html"))) {
      const html = readFileSync(join(out, page), "utf8");
      // No inline event handler or javascript: link, which a hash cannot allow.
      expect(html, page).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
      expect(html, page).not.toMatch(/href\s*=\s*["']\s*javascript:/i);
      for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        const attributes = match[1] ?? "";
        if (/\ssrc=/.test(attributes)) continue;
        const type = /\stype="([^"]*)"/.exec(attributes)?.[1] ?? "";
        // Only classic and module scripts run; JSON-LD and speculation rules are data.
        if (type !== "" && type !== "module" && type !== "text/javascript") continue;
        inlineHashes.add(`'sha256-${createHash("sha256").update(match[2] ?? "").digest("base64")}'`);
      }
    }
    expect(inlineHashes.size).toBeGreaterThan(0);
    for (const hash of inlineHashes) expect(scriptSrc, hash).toContain(hash);
  });
});

// ───────────────────────── claims: what the site may say ─────────────────────────

type Claim = {
  id: string;
  kind: string;
  status: string;
  label: Record<string, string>;
  evidence: string;
  certifiedOn: string | null;
  allow: Record<string, string[]>;
};
const CLAIM_LIST = claims.CLAIMS as unknown as Claim[];

describe("sahelflow.com claims registry", () => {
  it("gives every claim a unique id, a status, a three-language label and evidence", () => {
    const ids = new Set<string>();
    for (const claim of CLAIM_LIST) {
      expect(ids.has(claim.id), `duplicate ${claim.id}`).toBe(false);
      ids.add(claim.id);
      expect(claims.STATUSES, claim.id).toContain(claim.status);
      for (const locale of SITE.locales) {
        expect(claim.label[locale], `${claim.id} ${locale}`).toBe(claims.STATUS_LABEL[claim.status as "live"][locale as "ar"]);
        expect((claim.label[locale] ?? "").length, `${claim.id} ${locale}`).toBeGreaterThan(1);
      }
      expect(claim.evidence.length, claim.id).toBeGreaterThan(30);
    }
    expect(claims.STATUSES).toEqual(["live", "testing", "planned"]);
  });

  it("dates a live claim and lets only a live claim allow a phrase", () => {
    for (const claim of CLAIM_LIST) {
      if (claim.status === "live") expect(claim.certifiedOn, claim.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      else {
        expect(claim.certifiedOn, claim.id).toBeNull();
        expect(Object.values(claim.allow).flat(), `${claim.id} must not allow phrases`).toEqual([]);
      }
    }
    for (const locale of SITE.locales) {
      const live = CLAIM_LIST.filter((claim) => claim.status === "live").flatMap((claim) => claim.allow[locale] ?? []);
      expect(claims.allowedPhrases(locale), locale).toEqual(live);
    }
  });

  it("has exactly one integration entry per brand the site shows, and none of them is live yet", () => {
    const brands = Object.keys(model.BRAND_NAMES).sort();
    const entries = CLAIM_LIST.filter((claim) => claim.kind === "integration").map((claim) => claim.id).sort();
    expect(entries).toEqual(brands);
    const grouped = model.INTEGRATIONS.flatMap((group: { items: string[] }) => group.items).sort();
    expect(grouped).toEqual(brands);
    for (const key of brands) expect(claims.integrationStatus(key), key).not.toBe("live");
    expect(() => claims.integrationStatus("not-a-brand")).toThrow();
  });

  it("never calls the installer signed: the installer claim is planned", () => {
    expect(claims.claimById("installer-publisher-signature").status).toBe("planned");
    expect(claims.claimById("updates-verified").status).toBe("live");
    expect(claims.WILAYA_COUNT).toBe(69);
  });

  it("accepts a competitor statement only with an https source and a check inside 90 days", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const good = { text: "Price of plan X", sourceUrl: "https://example.com/pricing", checkedOn: "2026-10-24" };
    expect(claims.validCompetitorClaim(good, now)).toBe(true);
    expect(claims.validCompetitorClaim({ ...good, sourceUrl: "" }, now)).toBe(false);
    expect(claims.validCompetitorClaim({ ...good, sourceUrl: "http://example.com" }, now)).toBe(false);
    expect(claims.validCompetitorClaim({ ...good, checkedOn: "2026-07-01" }, now)).toBe(false);
    expect(claims.validCompetitorClaim({ ...good, checkedOn: "2026-12-01" }, now)).toBe(false);
    expect(claims.validCompetitorClaim({ ...good, text: "" }, now)).toBe(false);
    for (const item of claims.COMPETITOR_CLAIMS) expect(claims.validCompetitorClaim(item), JSON.stringify(item)).toBe(true);
  });
});

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " " };

/** What a visitor reads or a crawler indexes: text, alt/title/aria/meta attributes and JSON-LD; no CSS or scripts. */
function builtText(html: string): string {
  const cleaned = html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script\b(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, " ");
  const withAttributes = cleaned.replace(/<[^>]*>/g, (tag) => {
    const values = [...tag.matchAll(/\s(?:alt|aria-label|title|content|placeholder|data-[a-z-]+)="([^"]*)"/g)].map((match) => match[1] ?? "");
    return ` ${values.join(" ")} `;
  });
  return withAttributes.replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity] ?? entity).replace(/\s+/g, " ");
}

/** Phrases that must not appear on any page, per language, until the registry says the thing is live. */
const BANNED: Record<string, RegExp[]> = {
  en: [
    /\bsigned\b/i,
    /\bcertified\b/i,
    /live[- ]tested/i,
    /\bwork(?:s|ing)? with (?:the tools|yalidine|zr express|ecotrack|maystro|shopify|youcan|woocommerce|google sheets|meta|whatsapp)/i,
    /\bcompatible with\b/i,
    /\bbuilt[- ]in couriers?\b/i,
    /\bconnected in minutes\b/i,
    /\b58\b/,
    /\b(?:no|zero)[- ]ban\b|\bban[- ]proof\b|\bwon'?t (?:get you )?banned\b|\bwithout (?:any |a )?risk of (?:a |being )?ban/i,
    /\bguarantee/i,
    /free tier is enough/i,
    /\bmost cod tools\b/i,
    /\btypical online cod platform\b/i,
    /\b1,900\b|\b24,500\b/,
    /no (?:double sends|silent failures)/i,
    // Honesty pass: sentences that said more than the product has proved.
    /only after you approve it/i,
    /nothing is sent or written without your approval/i,
    /understand darja\?\s*yes/i,
    /read darja, french and arabic as they are written/i,
    /no per-order fees, ever/i,
    /proven today/i,
    /rates for all 69 wilayas|69 wilayas · home and desk|dinars, 69 wilayas/i,
    /questions sellers ask first/i,
    /your database lives on your pc, encrypted/i,
    /no sahelflow server holds your customers/i,
    /your team keeps confirming/i,
    /see my orders\?\s*no\./i,
  ],
  fr: [
    /\bsign(?:é|ée|és|ées)(?![a-zà-ÿ])/i,
    /\bcertifi(?:é|ée|és|ées)(?![a-zà-ÿ])/i,
    /test(?:é|ée|és|ées) en (?:conditions )?r(?:é|e)elles?/i,
    /\bfonctionne(?:nt)? avec (?:les outils|yalidine|zr express|ecotrack|maystro|shopify|youcan|woocommerce|google sheets|meta|whatsapp)/i,
    /\bcompatibles? avec\b/i,
    /\b(?:livreurs|transporteurs) int(?:é|e)gr(?:é|e)s(?![a-zà-ÿ])/i,
    /\bconnect(?:é|e)s? en quelques minutes\b/i,
    /\b58\b/,
    /sans (?:aucun )?risque de (?:blocage|bannissement|ban)\b/i,
    /\bgaranti(?:e|es|s)?\b|\bgarantie\b/i,
    /l'offre gratuite suffit|le niveau gratuit suffit/i,
    /la plupart des outils cod/i,
    /plateforme cod en ligne typique/i,
    /\b1 900\b|\b24 500\b/,
    /sans double envoi|sans échec silencieux/i,
    // Honesty pass.
    /sahelflow n'envoie une réponse qu'après votre validation/i,
    /rien n'est envoyé ni écrit sans votre accord/i,
    /comprend-elle la darja \?\s*oui/i,
    /tels qu'ils s'écrivent/i,
    /jamais de frais par commande/i,
    /prouvé aujourd'hui/i,
    /tarifs des 69 wilayas|69 wilayas · domicile et bureau|dinars, 69 wilayas/i,
    /questions qu'on nous pose d'abord/i,
    /votre base vit sur votre pc, chiffrée/i,
    /aucun serveur sahelflow ne détient vos clients/i,
    /votre équipe continue de confirmer/i,
    /voir mes commandes \?\s*non\./i,
  ],
  ar: [
    // JS \b only sees ASCII letters, so no \b next to an Arabic or accented letter below.
    // A signed thing: the shadda on the qaf tells موقَّع (signed) from موقع (website).
    /موق[\u064B-\u0652]*\u0651[\u064B-\u0652]*ع/,
    /توقيع/,
    /(?:مثبت|المثبت|برنامج التثبيت|ملف التثبيت)\s+موقع/,
    /معتمد|مصادَق عليه|مصادق عليه/,
    /(?:يعمل|تعمل) مع (?:الأدوات|واتساب|WhatsApp|Yalidine|ZR Express|EcoTrack|Maystro|Shopify|YouCan|WooCommerce|Google Sheets|Meta)/,
    /متوافق/,
    /توصيل مدمج|شركات مدمجة|مدمجة/,
    /تُربط في دقائق|تربط في دقائق/,
    /(?:^|[^\d])58(?:[^\d]|$)|٥٨/,
    /(?:بدون|دون|لا) حظر|ضمان|مضمون/,
    /المجاني يكفي|مجانية تكفي/,
    /معظم أدوات/,
    /منصة دفع عند الاستلام معتادة/,
    /\b1 900\b|\b24 500\b/,
    /بلا إرسال مكرَّر|ولا فشل صامت|بلا إرسال مكرر|ولا فشل صامت/,
    // Honesty pass.
    /لا يرسل SahelFlow أي ردّ إلا بعد موافقتك/,
    /لا يُرسَل ولا يُكتب شيء إلا بموافقتك/,
    /يفهم الذكاء الاصطناعي الدارجة؟\s*نعم/,
    /كما تُكتب/,
    /ولا رسوم على كل طلبية، أبداً/,
    /ما ثبت اليوم/,
    /أسعار الـ 69 ولاية|69 ولاية · منزل ومكتب|الدينار، 69 ولاية/,
    /أول ما يسأله التجار/,
    /قاعدة بياناتك تعيش على حاسوبك، مشفّرة/,
    /لا يحتفظ أي خادم لـ SahelFlow بزبائنك/,
    /يواصل فريقك التأكيد/,
    /هل يرى SahelFlow طلبياتي؟\s*لا\./,
  ],
};

/** Sentences the site used to carry. The lists above must keep catching them, or a typo in a pattern would silently pass. */
const KNOWN_BAD: Record<string, string[]> = {
  en: [
    "A digitally signed installer that updates itself.",
    "Windows 10 · 11 · 64-bit · signed",
    "the installer is signed by SahelFlow",
    "Works with the tools you already use",
    "Rates for all 58 wilayas, to the door or to the desk.",
    "Use your own Gemini key — the free tier is enough",
    "Most COD tools in Algeria are online subscriptions",
    "Typical online COD platform",
    "no double sends, no silent failures",
    "Ban-proof WhatsApp for your shop",
    "SahelFlow sends a reply only after you approve it.",
    "Nothing is sent or written without your approval.",
    "Does the AI understand Darja? Yes. Order extraction is built",
    "No per-order fees, ever.",
    "Proven today",
    "Rates for all 69 wilayas, to the door or to the desk.",
  ],
  fr: [
    "Un installateur signé numériquement qui se met à jour seul.",
    "l'installateur est signé par SahelFlow",
    "Fonctionne avec les outils que vous utilisez déjà",
    "Les tarifs des 58 wilayas, à domicile ou au bureau.",
    "quatre livreurs intégrés",
    "Votre propre clé Gemini ; l'offre gratuite suffit",
    "La plupart des outils COD en Algérie sont des abonnements",
    "Sans risque de blocage",
    "Résultat garanti",
    "SahelFlow n'envoie une réponse qu'après votre validation.",
    "Rien n'est envoyé ni écrit sans votre accord.",
    "L'IA comprend-elle la darja ? Oui. L'extraction",
    "Jamais de frais par commande.",
    "Prouvé aujourd'hui",
    "Les tarifs des 69 wilayas, à domicile ou au bureau.",
  ],
  ar: [
    "مثبّت موقَّع رقمياً، يُحدِّث نفسه تلقائياً.",
    "المثبّت موقَّع من SahelFlow",
    "تحديثات موقّعة",
    "يعمل مع الأدوات التي تستعملها يومياً",
    "أسعار الـ 58 ولاية، للمنزل أو للمكتب.",
    "4 شركات توصيل مدمجة",
    "مفتاح Gemini الخاص بك؛ المجاني يكفي",
    "معظم أدوات الدفع عند الاستلام في الجزائر اشتراكات",
    "واتساب بدون حظر",
    "لا يرسل SahelFlow أي ردّ إلا بعد موافقتك.",
    "لا يُرسَل ولا يُكتب شيء إلا بموافقتك.",
    "هل يفهم الذكاء الاصطناعي الدارجة؟ نعم. الاستخراج",
    "ولا رسوم على كل طلبية، أبداً.",
    "ما ثبت اليوم",
    "أسعار الـ 69 ولاية، للمنزل أو للمكتب.",
  ],
};

describe("sahelflow.com banned-phrase lists", () => {
  it("still catch every sentence the site used to carry", () => {
    for (const locale of SITE.locales) {
      for (const sentence of KNOWN_BAD[locale] ?? []) {
        expect(BANNED[locale]?.some((pattern) => pattern.test(sentence)), `${locale}: ${sentence}`).toBe(true);
      }
    }
  });

  it("let a live registry phrase through, and nothing else", () => {
    expect(claims.allowedPhrases("en")).toContain("signing key");
    expect(claims.allowedPhrases("ar")).toContain("مفتاح التوقيع");
    const arSigned = BANNED.ar?.some((pattern) => pattern.test("مفتاح التوقيع"));
    expect(arSigned, "the bare Arabic word is banned until the registry allows the phrase").toBe(true);
    const stripped = "مفتاح التوقيع".split(claims.allowedPhrases("ar")[0] ?? "").join(" ");
    expect(BANNED.ar?.some((pattern) => pattern.test(stripped))).toBe(false);
  });
});

/** Every page, in every language, as built. */
describe("sahelflow.com claims on the built pages", () => {
  let out = "";
  const pages = new Map<string, string>();

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "sahelflow-claims-"));
    build(out);
    for (const locale of SITE.locales) {
      for (const [id, path] of model.sitePages() as Array<[string, string]>) {
        pages.set(`${locale}/${id}`, readFileSync(join(out, locale, path, "index.html"), "utf8"));
      }
    }
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("covers all 24 pages in all three languages", () => {
    expect(pages.size).toBe(24 * SITE.locales.length);
  });

  it("says nothing the registry cannot back: no signed installer, no certified, no 58 wilayas, no ban promise", () => {
    const hits: string[] = [];
    for (const [key, html] of pages) {
      const locale = key.split("/")[0] ?? "";
      let text = builtText(html);
      // The only way past a banned word is a phrase from a live registry entry.
      for (const phrase of claims.allowedPhrases(locale)) text = text.split(phrase).join(" ");
      for (const pattern of BANNED[locale] ?? []) {
        const match = pattern.exec(text);
        if (match) hits.push(`${key}: ${pattern} → "${text.slice(Math.max(0, match.index - 30), match.index + 50)}"`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("writes the wilaya count from the registry on the pages that state it", () => {
    for (const locale of SITE.locales) {
      // The delivery page states rates by wilaya; the count itself is only the address list, on the product page.
      const text = builtText(pages.get(`${locale}/product`) ?? "");
      expect(text, locale).toContain(String(claims.WILAYA_COUNT));
    }
  });

  it("shows all 13 integrations on the integrations page and the home marquee, each with its registry status and label", () => {
    const brands = Object.keys(model.BRAND_NAMES);
    for (const locale of SITE.locales) {
      const integrations = pages.get(`${locale}/integrations`) ?? "";
      const cards = [...integrations.matchAll(/<article class="int-card[^"]*"([^>]*)>([\s\S]*?)<\/article>/g)];
      expect(cards.length, `${locale} cards`).toBe(brands.length);
      for (const card of cards) {
        const id = /id="([^"]+)"/.exec(card[1] ?? "")?.[1] ?? "";
        const status = /data-status="([^"]*)"/.exec(card[1] ?? "")?.[1];
        expect(status, `${locale} ${id}`).toBe(claims.integrationStatus(id));
        expect(builtText(card[2] ?? ""), `${locale} ${id}`).toContain(claims.integrationLabel(id, locale));
      }
      // The integrations page is the list of cards above; the marquee of tiles is on the home page.
      for (const page of ["home"]) {
        const html = pages.get(`${locale}/${page}`) ?? "";
        const tiles = [...html.matchAll(/<li data-status="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)];
        expect(tiles.length, `${locale} ${page} marquee tiles`).toBe(brands.length);
        for (const tile of tiles) {
          expect(claims.STATUSES, `${locale} ${page}`).toContain(tile[1]);
          expect(builtText(tile[2] ?? ""), `${locale} ${page}`).toContain(claims.statusLabel(tile[1] ?? "", locale));
        }
      }
    }
  });

  it("never renders a brand tile without a status beside it, on any page", () => {
    for (const [key, html] of pages) {
      const tiles = (html.match(/class="brand-tile"/g) ?? []).length;
      const labelled = (html.match(/\sdata-status="(?:live|testing|planned)"/g) ?? []).length;
      expect(labelled, key).toBe(tiles);
    }
  });

  it("labels the Google Sheets tile on the home page with the Sheets status", () => {
    for (const locale of SITE.locales) {
      const label = claims.integrationLabel("sheets", locale);
      const home = pages.get(`${locale}/home`) ?? "";
      const tile = [...home.matchAll(/<li data-status="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].find((m) => /Sheets/i.test(m[2] ?? ""));
      expect(tile?.[1], `${locale} sheets tile`).toBe(claims.integrationStatus("sheets"));
      expect(builtText(tile?.[2] ?? ""), `${locale} sheets tile`).toContain(label);
    }
  });

  it("puts the WhatsApp number-safety sentence wherever the inbox is sold", () => {
    const sellers = ["home", "product", "module:inbox", "integrations", "solution:starting", "solution:teams", "help"];
    const required: Record<string, RegExp[]> = {
      en: [/WhatsApp Web/, /unofficial/i, /restrict/i, /dedicated/i, /approve/i],
      fr: [/WhatsApp Web/, /non officielle/i, /restreindre/i, /dédié/i, /validation|valid/i],
      ar: [/واتساب ويب/, /غير رسمي/, /يقيّد|يقيد/, /مخصّص|مخصص/, /موافقتك/],
    };
    for (const locale of SITE.locales) {
      const note = (COPY[locale] as { common: { whatsappNote: string } }).common.whatsappNote;
      for (const pattern of required[locale] ?? []) expect(note, `${locale} note ${pattern}`).toMatch(pattern);
      for (const id of sellers) {
        expect(builtText(pages.get(`${locale}/${id}`) ?? ""), `${locale}/${id}`).toContain(note);
      }
    }
  });

  it("states the licence price as the offer price and keeps the launch offer in the description", () => {
    const offers: Array<{ price?: string; description?: string }> = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        const node = value as Record<string, unknown>;
        if (node["@type"] === "Offer") offers.push(node as { price?: string; description?: string });
        Object.values(node).forEach(visit);
      }
    };
    for (const html of pages.values()) {
      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) visit(JSON.parse(match[1] ?? "null"));
    }
    const paid = offers.filter((offer) => offer.price !== "0");
    expect(paid.length).toBeGreaterThan(0);
    for (const offer of paid) {
      expect(offer.price).toBe(String(SITE.licencePrice));
      expect(offer.description ?? "").toMatch(/17[\s\u00a0\u202f,.]?000/);
    }
    expect(JSON.stringify(offers)).not.toContain(`"price":"${SITE.launchOfferPrice}"`);
  });
});

// ───────────────────────── Carnet look: tokens, CSS rules, budgets ─────────────────────────

const MK = join(process.cwd(), "marketing");
const STYLES = join(MK, "src", "styles");
const readCss = () => readdirSync(STYLES).filter((f) => f.endsWith(".css")).sort().map((f) => readFileSync(join(STYLES, f), "utf8")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
/** Text between the braces of the first block that starts with `head`. */
function blockAfter(css: string, head: string): string {
  const start = css.indexOf(head);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return "";
}
const props = (body: string) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)].map((m) => [m[1] as string, (m[2] as string).trim()]));

describe("sahelflow.com Carnet look", () => {
  let out = "";
  const htmlFiles: string[] = [];
  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "sahelflow-carnet-"));
    build(out);
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".html")) htmlFiles.push(path);
      }
    };
    walk(out);
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("builds all 24 pages in 3 languages, each with one h1, a skip link, alt on every image, canonical and hreflang", () => {
    const pages = htmlFiles.filter((f) => /\/(ar|fr|en)\//.test(f));
    expect(pages.length).toBe(72);
    for (const file of pages) {
      const html = readFileSync(file, "utf8");
      expect((html.match(/<h1[\s>]/g) ?? []).length, file).toBe(1);
      expect(html, file).toContain('class="skip-link" href="#main"');
      for (const img of html.matchAll(/<img\b[^>]*>/g)) expect(img[0], file).toMatch(/\salt="/);
      expect(html, file).toMatch(/<link rel="canonical"/);
      expect((html.match(/hreflang="/g) ?? []).length, file).toBeGreaterThanOrEqual(4);
      expect(html, file).toContain("data-theme-toggle");
    }
  });

  it("uses no physical left/right property and no left/right text-align in the marketing CSS", () => {
    const css = readCss();
    const physical = /(?:^|[;{\s])(?:left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right)\s*:/g;
    expect(css.match(physical) ?? []).toEqual([]);
    expect(css.match(/text-align\s*:\s*(?:left|right)/g) ?? []).toEqual([]);
    expect(css.match(/transform-origin\s*:[^;}]*\b(?:left|right)\b/g) ?? []).toEqual([]);
  });

  it("puts no letter-spacing on Arabic", () => {
    const css = readCss();
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*letter-spacing\s*:\s*([^;}]+)[^{}]*)\}/g)) {
      const selector = m[1] ?? "";
      if (/:lang\(ar\)|\[lang=["']?ar/.test(selector)) expect((m[3] ?? "").trim(), selector).toMatch(/^(0|normal)\b/);
    }
    expect(css).toContain("html[lang=ar] *{letter-spacing:0}");
  });

  it("references only fonts that exist, and no deleted file anywhere in source or output", () => {
    const css = readCss();
    const urls = [...css.matchAll(/url\("?(\/fonts\/[^")]+)"?\)/g)].map((m) => m[1] as string);
    expect(urls.length).toBeGreaterThanOrEqual(5);
    for (const url of urls) expect(existsSync(join(MK, "static", url)), url).toBe(true);
    const hits: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) scan(path);
        else if (/\.(css|js|mjs|html)$/.test(name) && /gl\.js|readex/i.test(readFileSync(path, "utf8"))) hits.push(path);
      }
    };
    [join(MK, "src"), join(MK, "static"), out].forEach(scan);
    expect(hits).toEqual([]);
    expect(existsSync(join(MK, "src", "gl.js"))).toBe(false);
  });

  it("stays inside the size budgets", () => {
    const css = readFileSync(join(out, "assets", "site.css"));
    const js = readFileSync(join(out, "assets", "site.js"));
    expect(gzipSync(css).length, "css gz").toBeLessThanOrEqual(40 * 1024);
    expect(gzipSync(js).length, "first-load js gz").toBeLessThanOrEqual(25 * 1024);
    const fonts = readdirSync(join(out, "fonts")).filter((f) => f.endsWith(".woff2")).reduce((sum, f) => sum + statSync(join(out, "fonts", f)).size, 0);
    expect(fonts, "fonts").toBeLessThanOrEqual(250 * 1024);
    for (const locale of SITE.locales) {
      const home = statSync(join(out, locale, "index.html")).size;
      expect(home + css.length + js.length + fonts, `${locale} home html+css+js+fonts`).toBeLessThanOrEqual(350 * 1024);
    }
  });

  it("has a prefers-reduced-motion block that stops every animation the CSS starts", () => {
    const css = readCss();
    const reduced = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)/g)].map((m) => blockAfter(css.slice(m.index), "@media")).join("\n");
    expect(reduced).not.toBe("");
    const keyframes = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1] as string));
    const started = [...css.matchAll(/animation(?:-name)?\s*:\s*([\w-]+)/g)].filter((m) => m[1] !== "none");
    expect(started.length).toBeGreaterThan(0);
    for (const m of started) {
      expect(keyframes.has(m[1] as string), `keyframes ${m[1]}`).toBe(true);
      const before = css.slice(0, m.index);
      const open = before.lastIndexOf("{");
      const selector = before.slice(Math.max(before.lastIndexOf("}"), before.lastIndexOf("{", open - 1)) + 1, open).trim();
      for (const part of selector.split(",")) expect(reduced, `reduced motion covers ${part.trim()}`).toContain(part.trim());
    }
  });

  it("defines the same custom properties in both themes, and the media query and [data-theme] agree on dark", () => {
    const css = readCss();
    const light = props(blockAfter(css, ":root{color-scheme:light"));
    const media = props(blockAfter(blockAfter(css, "@media (prefers-color-scheme:dark)"), ":root:not([data-theme=light])"));
    const explicit = props(blockAfter(css, ":root[data-theme=dark]"));
    expect(Object.keys(light).length).toBeGreaterThan(15);
    expect(Object.keys(media).sort()).toEqual(Object.keys(light).sort());
    expect(Object.keys(explicit).sort()).toEqual(Object.keys(light).sort());
    expect(media).toEqual(explicit);
    expect(explicit["--ink"]).not.toBe(light["--ink"]);
  });

  it("keeps the Carnet home copy the same shape in Arabic, French and English", async () => {
    const { HOME } = (await import("../marketing/src/i18n/home.mjs")) as { HOME: Record<string, unknown> };
    expect(shape(HOME.fr)).toEqual(shape(HOME.ar));
    expect(shape(HOME.en)).toEqual(shape(HOME.ar));
  });
});

type Words = { en: string; fr: string; ar: string };
/** What each honesty rule now says, per language, and the page that must carry it ("*" = every page). */
const TRUTHFUL: Array<{ rule: string; page: string } & Words> = [
  { rule: "approval: footer names the automations", page: "*",
    en: "Replies the AI drafts go out only after you approve them. Automations you switch on send their own messages.",
    fr: "Les réponses rédigées par l'IA ne partent qu'après votre validation. Les automatisations que vous activez envoient leurs propres messages.",
    ar: "الردود التي يصوغها الذكاء الاصطناعي لا تُرسَل إلا بعد موافقتك. والأتمتة التي تُفعّلها ترسل رسائلها بنفسها." },
  { rule: "approval: home step 3", page: "home",
    en: "The AI drafts the reply and the order; you approve each draft.",
    fr: "L'IA prépare la réponse et la commande ; vous validez chaque brouillon.",
    ar: "الذكاء الاصطناعي يُعدّ مسودة الرد والطلب، وأنت تعتمد كل مسودة." },
  { rule: "darja: FAQ says built, not measured", page: "help",
    en: "It is built to read Darja, French, Arabic or a mix. We have not measured its accuracy on real orders yet, so check each draft.",
    fr: "Elle est conçue pour lire la darja, le français, l'arabe ou un mélange. Nous n'avons pas encore mesuré sa précision sur de vraies commandes : vérifiez chaque brouillon.",
    ar: "صُمّم ليقرأ الدارجة والفرنسية والعربية أو خليطاً منها. لم نقِس دقته على طلبيات حقيقية بعد، فراجع كل مسودة." },
  { rule: "darja: home FAQ says built, not measured", page: "home",
    en: "It is built to read Darja, French, Arabic or a mix.",
    fr: "Elle est conçue pour lire la darja, le français, l'arabe ou un mélange.",
    ar: "صُمّم ليقرأ الدارجة والفرنسية والعربية أو خليطاً منها." },
  { rule: "darja: inbox module says built, not measured", page: "module:inbox",
    en: "We have not measured its accuracy on real orders yet, so check each draft.",
    fr: "Nous n'avons pas encore mesuré sa précision sur de vraies commandes : vérifiez chaque brouillon.",
    ar: "لم نقِس دقته على طلبيات حقيقية بعد، فراجع كل مسودة." },
  { rule: "wilayas: delivery page names the 11 new wilayas", page: "module:delivery",
    en: "the 11 new wilayas use their old wilaya's rate for now",
    fr: "les 11 nouvelles wilayas prennent pour l'instant le tarif de leur ancienne wilaya",
    ar: "الولايات الـ 11 الجديدة تأخذ حالياً سعر ولايتها القديمة" },
  { rule: "wilayas: the 69 is the address list", page: "product",
    en: "addresses for 69 wilayas", fr: "adresses des 69 wilayas", ar: "عناوين 69 ولاية" },
  { rule: "offline: the team needs internet", page: "why",
    en: "Team members on phones or other PCs, WhatsApp and couriers need the internet.",
    fr: "Les membres sur téléphone ou sur un autre PC, WhatsApp et les livreurs ont besoin d'internet.",
    ar: "أعضاء الفريق على الهواتف أو حواسيب أخرى، وواتساب وشركات التوصيل، تحتاج كلها إلى الإنترنت." },
  { rule: "offline: the table cell is about the PC", page: "why",
    en: "Yes, on your PC", fr: "Oui, sur votre PC", ar: "نعم، على حاسوبك" },
  { rule: "offline: the FAQ lists team members", page: "help",
    en: "team members connecting from phones or other PCs",
    fr: "membres de l'équipe qui se connectent depuis un téléphone ou un autre PC",
    ar: "أعضاء الفريق الذين يتصلون من هاتف أو حاسوب آخر" },
  { rule: "encryption: the database claim is about fields", page: "product",
    en: "Your database lives on your PC; customer names, phones, addresses and keys are encrypted.",
    fr: "Votre base vit sur votre PC ; noms, téléphones, adresses et clés des clients sont chiffrés.",
    ar: "قاعدة بياناتك تعيش على حاسوبك؛ أسماء الزبائن وهواتفهم وعناوينهم والمفاتيح مشفّرة." },
  { rule: "encryption: the help answer is about fields", page: "help",
    en: "Customer names, phones, addresses, chats and keys are encrypted there.",
    fr: "Les noms, téléphones, adresses, conversations et clés des clients y sont chiffrés.",
    ar: "أسماء الزبائن وهواتفهم وعناوينهم ومحادثاتهم والمفاتيح مشفّرة فيه." },
  { rule: "relay: SahelFlow says what passes through Cloudflare", page: "security",
    en: "pass through our Cloudflare servers encrypted",
    fr: "transitent chiffrées par nos serveurs Cloudflare",
    ar: "فتمرّ مشفّرة عبر خوادم Cloudflare لدينا" },
  { rule: "fees: per-order fee is tied to this licence", page: "why",
    en: "No per-order fee with this licence.",
    fr: "Aucun frais par commande avec cette licence.",
    ar: "ولا رسوم على كل طلبية مع هذا الترخيص." },
  { rule: "no customers yet: the questions are not 'asked by sellers'", page: "home",
    en: "Questions to ask first", fr: "Les questions à poser d'abord", ar: "أسئلة عليك طرحها أولاً" },
  { rule: "security heading", page: "security",
    en: "Built and tested", fr: "Construit et testé", ar: "ما بنيناه واختبرناه" },
];

describe("sahelflow.com honesty: no sentence says more than the product has proved", () => {
  let out = "";
  const text = new Map<string, string>();

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "sahelflow-honesty-"));
    build(out);
    for (const locale of SITE.locales) {
      for (const [id, path] of model.sitePages() as Array<[string, string]>) {
        text.set(`${locale}/${id}`, builtText(readFileSync(join(out, locale, path, "index.html"), "utf8")));
      }
    }
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  const pagesOf = (locale: string) => [...text].filter(([key]) => key.startsWith(`${locale}/`));

  it("carries every corrected sentence in Arabic, French and English", () => {
    const missing: string[] = [];
    for (const locale of SITE.locales) {
      for (const item of TRUTHFUL) {
        const wanted = item[locale as keyof Words];
        const where = item.page === "*" ? pagesOf(locale) : pagesOf(locale).filter(([key]) => key === `${locale}/${item.page}`);
        if (where.length === 0) missing.push(`${locale}: no page ${item.page}`);
        for (const [key, body] of where) if (!body.includes(wanted)) missing.push(`${key}: ${item.rule}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("never states the unmeasured, partial or future thing as a fact on any page", () => {
    const hits: string[] = [];
    for (const [key, body] of text) {
      const locale = key.split("/")[0] ?? "";
      // A live registry phrase (for example "signing key") may carry a banned word.
      let rest = body;
      for (const phrase of claims.allowedPhrases(locale)) rest = rest.split(phrase).join(" ");
      for (const pattern of BANNED[locale] ?? []) if (pattern.test(rest)) hits.push(`${key}: ${pattern}`);
    }
    expect(hits).toEqual([]);
  });

  it("starts the five years of updates and support at the official stable launch, wherever the site names them", () => {
    const unanchored: string[] = [];
    const phrase = /updates (?:and|&) support|mises à jour et (?:de )?support|التحديثات والدعم/g;
    const anchor = /stable launch|sortie stable|الإطلاق المستقر/;
    for (const [key, body] of text) {
      if (!/\/(?:pricing|help|home|why)$/.test(key)) continue;
      for (const match of body.matchAll(phrase)) {
        if (!anchor.test(body.slice(match.index, (match.index ?? 0) + 110))) unanchored.push(`${key}: …${body.slice(match.index, (match.index ?? 0) + 60)}`);
      }
    }
    expect(unanchored).toEqual([]);
  });

  it("says 'chats' are encrypted only while the code encrypts message bodies", () => {
    const source = readFileSync(new URL("../src/lib/crypto/protected-pii.ts", import.meta.url), "utf8");
    expect(source).toMatch(/MESSAGE_PROTECTED_FIELDS = \["body"\]/);
    expect(source).toMatch(/Message: MESSAGE_PROTECTED_FIELDS/);
    for (const [key, body] of text) {
      if (key === "en/security") expect(body).toContain("Phones, addresses, chats and keys are encrypted");
    }
  });
});
