import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Founder Storefront V2 acceptance repair", () => {
  it("keeps creation private while seeding the first draft for a real publish", () => {
    const bootstrap = read(
      "src/components/storefront/studio/storefront-studio-bootstrap.tsx",
    );
    const service = read("src/lib/storefront/service.ts");
    expect(bootstrap).toContain("isActive: false");
    expect(bootstrap).toContain("initialDraftIsActive: true");
    expect(service).toContain("draftIsActive: input.initialDraftIsActive");
    expect(service).toContain("draftUpdatedAt");
  });

  it("authors contact inside the V2 draft and prefers it over the legacy live projection", () => {
    const bootstrap = read(
      "src/components/storefront/studio/storefront-studio-bootstrap.tsx",
    );
    const studio = read(
      "src/components/storefront/studio/storefront-studio.tsx",
    );
    const renderer = read(
      "src/components/storefront/storefront-renderer.tsx",
    );
    const projection = read("src/lib/storefront/public-projection.ts");
    expect(bootstrap).toContain("next.builder.contact = contact");
    expect(studio).toContain("ContactPanel");
    expect(studio).toContain("contact: { ...contact, ...patch }");
    expect(renderer).toContain("authoredSupport ?? renderSupport");
    expect(projection).toContain("...config.theme.builder");
    expect(projection).toContain("verificationValue: null");
  });

  it("makes rich Studio sections genuinely authorable and publish-renderable", () => {
    const studio = read(
      "src/components/storefront/studio/storefront-studio.tsx",
    );
    const renderer = read(
      "src/components/storefront/storefront-renderer.tsx",
    );
    const draft = read("src/lib/storefront/studio-draft.ts");
    const sections = read("src/lib/storefront/studio-sections.ts");

    expect(studio).toContain("patchStorefrontSectionSettings");
    expect(studio).toContain("addStorefrontBlock");
    expect(studio).toContain("patchStorefrontBlockSettings");
    expect(studio).toContain("deleteStorefrontBlock");
    expect(studio).toContain("addTestimonial");
    expect(studio).toContain("addFaq");
    expect(draft).toContain("reorderStorefrontSection");
    expect(draft).toContain("patchStorefrontSectionSettings");
    expect(sections).toContain('case "media"');
    expect(sections).toContain('case "testimonials"');
    expect(sections).toContain('case "faq"');
    expect(renderer).toContain('case "media"');
    expect(renderer).toContain('case "testimonials"');
    expect(renderer).toContain('case "faq"');
    expect(renderer).toContain("<details");
  });

  it("synchronizes or clears legacy contact inside the actual durable publish transaction", () => {
    const service = read("src/lib/storefront/service.ts");
    const delegation = read(
      "src/lib/connected-platform/storefront-delegation.ts",
    );
    expect(delegation).toContain("function publishedLegacyContact");
    expect(delegation).toContain(
      "return hasAny ? JSON.stringify(contact) : null",
    );
    expect(delegation).toContain(
      "contact: publishedLegacyContact(prepared.draft)",
    );
    expect(
      delegation.indexOf("contact: publishedLegacyContact(prepared.draft)"),
    ).toBeGreaterThan(delegation.indexOf("async function promotePreparedDraft"));
    expect(delegation).toContain("await promotePreparedDraft(tx, prepared)");
    const saveDraft = service.slice(
      service.indexOf("async saveStudioDraft"),
      service.indexOf("async publishStudioDraft"),
    );
    expect(saveDraft).not.toContain("publishedLegacyContact");
  });

  it("blocks active publish without a delivery rule and opens the actionable checkout panel", () => {
    const studio = read(
      "src/components/storefront/studio/storefront-studio.tsx",
    );
    expect(studio).toContain(
      "draft.isActive && draft.theme.builder.shippingRules.length === 0",
    );
    expect(studio).toContain('setPanel("checkout")');
    expect(studio).toContain(
      'setMessage(t("storefront.studio.shippingEmpty"))',
    );
  });

  it("exposes active/pause intent in Studio and never reports a pause as published", () => {
    const studio = read(
      "src/components/storefront/studio/storefront-studio.tsx",
    );
    expect(studio).toContain("checked={draft.isActive}");
    expect(studio).toContain('t("storefront.active")');
    expect(studio).toContain('t("storefront.inactive")');
    expect(studio).toContain('t("storefront.studio.published")');
    expect(studio.indexOf('t("storefront.studio.published")')).toBeLessThan(
      studio.lastIndexOf('t("storefront.inactive")'),
    );
  });
});
