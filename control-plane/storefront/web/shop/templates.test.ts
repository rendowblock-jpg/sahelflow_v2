import { describe, expect, it } from "vitest";

import { renderStorePage } from "./index";
import { publishTestStore, renderInputFor } from "../test-support";

type Template = "prime" | "souk" | "reel";
const NEW: readonly Template[] = ["prime", "souk", "reel"];

type Store = Awaited<ReturnType<typeof publishTestStore>>;

function page(store: Store, overrides: Parameters<typeof renderInputFor>[1] = {}): string {
  const html = renderStorePage(renderInputFor(store, overrides));
  if (html === null) throw new Error("page not found");
  return html;
}

const links = (html: string) => [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const scripts = (html: string) => [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const preloads = (html: string) => [...html.matchAll(/<link rel="preload" as="font"[^>]*href="([^"]+)"/g)].map((m) => m[1]);

describe("the three newer templates are drawn as themselves", () => {
  it.each(NEW)("%s: its own voice, its own stylesheet after the shared one, and the home runs only the tiny photo script", async (template) => {
    const store = await publishTestStore({ template });
    const html = page(store);
    expect(html).toContain(`data-voice="${template}"`);
    expect(links(html)).toEqual(["/_sf/shop.test.css", `/_sf/${template}.test.css`]);
    expect(scripts(html)).toEqual(["/_sf/photos.test.js"]); // exactly one script: the photo fallback, no order script, no skin script
    store.database.close();
  });

  it.each(["sahara", "atlas", "oasis"] as const)("%s: still loads one stylesheet and no skin (the published three are unchanged)", async (template) => {
    const store = await publishTestStore({ template });
    expect(links(page(store))).toEqual(["/_sf/shop.test.css"]);
    store.database.close();
  });

  it("a product page loads the order script, and only Reel adds its motion script after it", async () => {
    for (const template of ["sahara", "prime", "souk"] as const) {
      const store = await publishTestStore({ template });
      expect(scripts(page(store, { productId: "product_00000001" }))).toEqual(["/_sf/shop.test.js"]);
      store.database.close();
    }
    const reel = await publishTestStore({ template: "reel" });
    expect(scripts(page(reel, { productId: "product_00000001" }))).toEqual(["/_sf/shop.test.js", "/_sf/reel.test.js"]);
    reel.database.close();
  });

  it.each([
    ["prime", "ar", "/_sf/f.test.alexandria-300-arabic.woff2"],
    ["prime", "fr", "/_sf/f.test.jost-var-latin.woff2"],
    ["souk", "ar", "/_sf/f.test.readexpro-var-arabic.woff2"],
    ["souk", "en", "/_sf/f.test.readexpro-var-latin.woff2"],
    ["reel", "fr", "/_sf/f.test.archivo-cond-800-latin.woff2"],
  ] as const)("%s preloads exactly one font, the heading face of the page language (%s)", async (template, locale, file) => {
    const store = await publishTestStore({ template, locale });
    expect(preloads(page(store))).toEqual([file]);
    store.database.close();
  });

  it("Reel preloads no Arabic file: its heavy display face swaps in instead of competing with the first photo", async () => {
    const store = await publishTestStore({ template: "reel", locale: "ar" });
    expect(preloads(page(store))).toEqual([]);
    store.database.close();
  });

  it("Souk's home has a bottom tab bar whose every link leads somewhere that exists", async () => {
    const store = await publishTestStore({
      template: "souk",
      shapeTheme: (theme) => { theme.builder.contact = { phone: "0550123456", whatsapp: "0550123456", email: "", address: "" }; },
    });
    const html = page(store);
    expect(html).toContain("data-tabs");
    const nav = /<nav class="sf-tabs"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(nav).not.toBe("");
    const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1] as string);
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    for (const href of hrefs) {
      if (href.startsWith("#")) expect(html, href).toContain(`id="${href.slice(1)}"`);
      else expect(href.startsWith("/sahel-store") || href.startsWith("https://wa.me/213550123456")).toBe(true);
    }
    expect(nav.match(/aria-current="page"/g)?.length).toBe(1);
    expect(nav).toContain('target="_blank" rel="noopener noreferrer"');
    store.database.close();
  });

  it("only Souk draws the tab bar, and a product page keeps its own order bar instead", async () => {
    for (const template of ["prime", "reel", "atlas"] as const) {
      const store = await publishTestStore({ template });
      expect(page(store)).not.toContain("sf-tabs");
      store.database.close();
    }
    const souk = await publishTestStore({ template: "souk" });
    const product = page(souk, { productId: "product_00000001" });
    expect(product).not.toContain("sf-tabs");
    expect(product).toContain('id="sf-sticky"');
    souk.database.close();
  });

  it.each(NEW)("%s: a hostile store name is escaped on the home and on a product page", async (template) => {
    const hostile = `"><img src=x onerror=alert(1)>`;
    const store = await publishTestStore({ template, storeName: hostile });
    for (const html of [page(store), page(store, { productId: "product_00000001" })]) {
      expect(html).not.toContain("<img src=x onerror=alert(1)>");
      expect(html).toContain("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
    }
    store.database.close();
  });

  it.each(NEW)("%s: language switch keeps the template and the page language flips", async (template) => {
    const store = await publishTestStore({ template, locale: "fr" });
    const html = page(store);
    expect(html).toContain('<html lang="fr" dir="ltr">');
    expect(html).toContain(`data-voice="${template}"`);
    store.database.close();
  });
});

describe("the renderer is safe against a template id or a manifest it does not expect", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "vitrine", ""])(
    "a stored template id %j draws the shared look: no skin, no preload, no tab bar, no exception",
    async (template) => {
      const store = await publishTestStore({ template: "atlas" });
      const base = renderInputFor(store);
      const artifact = { ...base.artifact, theme: { ...base.artifact.theme, template } } as typeof base.artifact;
      const html = renderStorePage({ ...base, artifact });
      expect(html).not.toBeNull();
      expect(links(html as string)).toEqual(["/_sf/shop.test.css"]);
      expect(preloads(html as string)).toEqual([]);
      expect(html).not.toContain("sf-tabs");
      store.database.close();
    },
  );

  it("a template id is never printed raw into the data-voice attribute", async () => {
    const store = await publishTestStore({ template: "atlas" });
    const base = renderInputFor(store);
    const hostile = `x"><script>alert(1)</script>`;
    const artifact = { ...base.artifact, theme: { ...base.artifact.theme, template: hostile } } as typeof base.artifact;
    const html = renderStorePage({ ...base, artifact }) as string;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain('data-voice="x&quot;&gt;&lt;script&gt;');
    store.database.close();
  });

  it.each(["sahara", "prime", "souk", "reel"] as const)("%s: a manifest without a skins table (an old deploy) still renders a page", async (template) => {
    const store = await publishTestStore({ template });
    const base = renderInputFor(store);
    const html = renderStorePage({ ...base, assets: { ...base.assets, skins: undefined as never } }) as string;
    expect(html).toContain(`data-voice="${template}"`);
    expect(links(html)).toEqual(["/_sf/shop.test.css"]);
    store.database.close();
  });

  it("a WhatsApp number with no digits makes no WhatsApp tab (and never a link to the wa.me root)", async () => {
    const store = await publishTestStore({
      template: "souk",
      shapeTheme: (theme) => { theme.builder.contact = { phone: "0550123456", whatsapp: "---", email: "", address: "" }; },
    });
    const html = page(store);
    const nav = /<nav class="sf-tabs"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    expect(nav).not.toBe(""); // the other tabs are still drawn
    expect(nav).not.toContain("wa.me");
    expect(nav).not.toContain("WhatsApp");
    store.database.close();
  });

  it.each(["sahara", "atlas", "oasis"] as const)("%s: the page has no tab bar and no skin script; the order bar ends <main>, then the footer and the one script", async (template) => {
    const store = await publishTestStore({ template });
    const html = page(store, { productId: "product_00000001" });
    expect(html).not.toContain("sf-tabs");
    expect(html).not.toContain("data-tabs");
    expect(scripts(html)).toEqual(["/_sf/shop.test.js"]);
    expect(html).toMatch(/<div id="sf-sticky"[\s\S]*?<\/div>\n<\/main>\n<footer[\s\S]*?<\/footer>\n\n?<script src="\/_sf\/shop\.test\.js" defer><\/script>\n<\/body>/);
    store.database.close();
  });
});

