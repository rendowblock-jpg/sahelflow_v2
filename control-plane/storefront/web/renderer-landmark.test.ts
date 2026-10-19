/**
 * The shared renderer's landmark contract, checked on the real code through the same
 * esbuild settings wrangler uses: a customer page has exactly one <main>, between the
 * banner (announcement bar and header) and the footer; an embedded preview (the Studio
 * canvas, the mini preview) adds none because its host page already has one.
 */
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WEB = join(ROOT, "control-plane/storefront/web");

type Render = (options: { embedded: boolean; order?: string[] }) => string;
let render: Render;

beforeAll(async () => {
  const contents = `
    import "./react-global";
    import { renderToString } from "react-dom/server";
    import { StorefrontRenderer } from "@/components/storefront/storefront-renderer";
    import { StorefrontLocaleProvider } from "@/components/storefront/storefront-locale-provider";
    import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";

    export function render({ embedded, order }) {
      const theme = createDefaultStorefrontTheme("atlas");
      theme.announcement = { enabled: true, text: "Livraison partout" };
      if (order) {
        const byType = new Map(theme.builder.composition.sections.map((s) => [s.type, s]));
        theme.builder.composition.sections = order.map((type) => byType.get(type)).filter(Boolean);
      }
      const draft = { name: "Boutique", slug: "boutique", description: "", theme, selectedProductIds: ["p1"], isActive: true };
      const products = [{ id: "p1", name: "Tapis", price: 100, sku: null, stock: 3, images: null }];
      return renderToString(
        <StorefrontLocaleProvider initialLocale="fr">
          <StorefrontRenderer draft={draft} products={products} {...(embedded ? { maxProducts: 8 } : {})} />
        </StorefrontLocaleProvider>,
      );
    }`;
  const result = await build({
    stdin: { contents, resolveDir: WEB, loader: "tsx", sourcefile: "landmark-entry.tsx" },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "browser"],
    target: "es2022",
    external: ["node:*"],
    tsconfig: join(ROOT, "tsconfig.json"),
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@/components/storefront/storefront-locale-provider": resolve(WEB, "shims/storefront-locale-provider.tsx"),
    },
    absWorkingDir: ROOT,
    logLevel: "silent",
  });
  const loaded = { exports: {} as { render?: Render } };
  new Function("module", "exports", result.outputFiles[0]?.text ?? "")(loaded, loaded.exports);
  render = loaded.exports.render as Render;
}, 60_000);

const count = (html: string, pattern: RegExp) => html.match(pattern)?.length ?? 0;

describe("storefront renderer landmarks", () => {
  it("puts exactly one main between the header and the footer on a customer page", () => {
    const html = render({ embedded: false });
    expect(count(html, /<main[\s>]/g)).toBe(1);
    expect(count(html, /<\/main>/g)).toBe(1);
    expect(html.indexOf("<header")).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
    expect(html.indexOf("Livraison partout")).toBeLessThan(html.indexOf("<main"));
    expect(html).toContain('<main id="storefront-main">');
    const inside = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    expect(inside).toContain("Tapis");
    expect(inside).not.toContain("<header");
    expect(inside).not.toContain("<footer");
  });

  it("adds no main to an embedded preview, so a host page keeps its own", () => {
    const html = render({ embedded: true });
    expect(count(html, /<main[\s>]/g)).toBe(0);
    expect(html).toContain("Tapis");
    expect(html).toContain("<header");
  });

  it("still has one main when the seller moves the header below the first section", () => {
    const html = render({ embedded: false, order: ["announcement", "hero", "navbar", "product-grid", "footer"] });
    expect(count(html, /<main[\s>]/g)).toBe(1);
    expect(html.indexOf("Livraison partout")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
  });

  it("keeps a page made only of banner sections valid", () => {
    const html = render({ embedded: false, order: ["announcement", "navbar", "footer"] });
    expect(count(html, /<main[\s>]/g)).toBe(1);
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
  });
});
