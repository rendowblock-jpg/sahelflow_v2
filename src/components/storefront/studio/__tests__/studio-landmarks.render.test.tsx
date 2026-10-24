/**
 * @vitest-environment happy-dom
 */
/**
 * PB-A11Y-STUDIO-MAIN: the Studio editor route (/storefronts/<id>/studio).
 *
 * The dashboard shell owns the one <main id="main-content"> and, in storefront
 * focus mode, the one sr-only <h1> above the page (dashboard-layout.tsx). The
 * editor is rendered inside that main, so it must not add a second <main>
 * (axe: landmark-no-duplicate-main, landmark-main-is-top-level) and must not
 * skip a heading level under the shell's h1.
 */
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StorefrontStudio } from "@/components/storefront/studio/storefront-studio";
import type { StorefrontStudioConfig } from "@/lib/storefront/service";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/storefronts/sf1/studio",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

// The canvas renders the whole storefront; it is not what this test is about.
vi.mock("@/components/storefront/studio/studio-canvas", () => ({
  StudioCanvas: () => <div data-testid="studio-canvas" />,
}));

afterEach(() => cleanup());

const config: StorefrontStudioConfig = {
  id: "sf1",
  slug: "my-shop",
  name: "My shop",
  description: null,
  theme: createDefaultStorefrontTheme("atlas"),
  productIds: [],
  contact: null,
  isActive: true,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  draftUpdatedAt: null,
  liveUpdatedAt: new Date("2026-10-01T00:00:00Z"),
};

/** The dashboard shell in storefront focus mode: the one main and the one h1. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content">
      <h1 className="sr-only">Edit storefront</h1>
      {children}
    </main>
  );
}

function mount() {
  return render(
    <Shell>
      <div className="app-workspace-content flex flex-col">
        <StorefrontStudio config={config} products={[]} />
      </div>
    </Shell>,
  );
}

function headingLevels(root: ParentNode): number[] {
  return Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")).map((el) =>
    el.hasAttribute("aria-level") ? Number(el.getAttribute("aria-level")) : Number(el.tagName.slice(1)),
  );
}

describe("Storefront Studio editor page structure", () => {
  it("has exactly one main landmark: the dashboard shell's", () => {
    const { container } = mount();
    const mains = container.querySelectorAll("main,[role=main]");
    expect(mains).toHaveLength(1);
    expect(mains[0]?.id).toBe("main-content");
  });

  it("renders no main of its own", () => {
    const { container } = render(<StorefrontStudio config={config} products={[]} />);
    expect(container.querySelectorAll("main,[role=main]")).toHaveLength(0);
  });

  it("keeps the shell's single h1 and never skips a heading level under it", () => {
    const { container } = mount();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const levels = headingLevels(container);
    let previous = 0;
    for (const level of levels) {
      expect(level, `heading levels ${levels.join(",")}`).toBeLessThanOrEqual(previous + 1);
      previous = level;
    }
  });
});
