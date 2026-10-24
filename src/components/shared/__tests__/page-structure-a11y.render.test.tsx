/**
 * @vitest-environment happy-dom
 */
/**
 * PB-A11Y-STRUCTURE: page structure defects the browser sweep found.
 *
 * The dashboard layout owns the one <main>; a page must not add another, must
 * have exactly one <h1>, must not skip a heading level, and every link must
 * have an accessible name. These render the real client components and assert
 * the structure, not the source text.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { getAutomationWorkspaceCopy } from "@/lib/i18n/automation-workspace";
import { AutomationBuilder } from "@/components/automations/automation-builder";
import { AutomationCard, type AutomationCardData } from "@/components/automations/automation-card";
import { AutomationTemplatesGallery } from "@/components/automations/automation-templates-gallery";
import { NotificationFeedList } from "@/components/notifications/notification-feed-list";
import { StorefrontCard } from "@/components/storefront/storefront-card";
import { StorefrontStudioBootstrap } from "@/components/storefront/studio/storefront-studio-bootstrap";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}|${JSON.stringify(params)}` : key,
    locale: "en",
    dir: "ltr",
  }),
}));

// The live miniature and the studio canvas render the whole store; they are
// not what these tests are about.
vi.mock("@/components/storefront/storefront-mini-preview", () => ({
  StorefrontMiniPreview: () => <div data-testid="mini-preview" />,
}));
vi.mock("@/components/storefront/studio/studio-canvas", () => ({
  StudioCanvas: () => <div data-testid="studio-canvas" />,
}));

/** Heading levels in document order (h1-h6 and role=heading). */
function headingLevels(root: ParentNode): number[] {
  return Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6,[role=heading]")).map((el) =>
    el.hasAttribute("aria-level") ? Number(el.getAttribute("aria-level")) : Number(el.tagName.slice(1)),
  );
}

/** The first heading must be an h1 and no later heading may skip a level down. */
function expectNoSkippedLevel(levels: number[]) {
  let previous = 0;
  for (const level of levels) {
    expect(level, `heading levels ${levels.join(",")}`).toBeLessThanOrEqual(previous + 1);
    previous = level;
  }
}

function expectNoNestedMain(root: ParentNode) {
  expect(root.querySelectorAll("main,[role=main]")).toHaveLength(0);
}

/** A page is the layout's <main> (a div here) with the page's own <h1> above. */
function Page({ children }: { children: React.ReactNode }) {
  return (
    <div data-testid="layout-main">
      <h1>Page title</h1>
      {children}
    </div>
  );
}

describe("/storefronts", () => {
  const config = {
    id: "sf1",
    name: "My shop",
    slug: "my-shop",
    isActive: true,
    productIds: [],
  } as never;

  function renderCard() {
    return render(
      <Page>
        <StorefrontCard
          config={config}
          products={[]}
          performance={undefined}
          canMutate
          canDelete
          onCopyLink={() => {}}
          onDelete={() => {}}
        />
      </Page>,
    );
  }

  it("gives every link an accessible name", () => {
    const { container } = renderCard();
    const links = Array.from(container.querySelectorAll("a[href]"));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      const name = (link.getAttribute("aria-label") ?? link.textContent ?? "").trim();
      expect(name, link.outerHTML).not.toBe("");
    }
  });

  it("does not skip a heading level under the page h1", () => {
    const { container } = renderCard();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expectNoSkippedLevel(headingLevels(container));
  });
});

describe("/storefronts/new", () => {
  it("renders no <main> of its own inside the layout's main", () => {
    const { container } = render(
      <Page>
        <StorefrontStudioBootstrap products={[]} />
      </Page>,
    );
    expectNoNestedMain(container);
  });
});

describe("/automations", () => {
  const data: AutomationCardData = {
    id: "a1",
    name: "Confirm orders",
    isActive: true,
    dryRun: false,
    repairRequired: false,
    trigger: "order.created",
    triggerLabel: "New order",
    conditionCount: 0,
    actions: [{ action: "send_whatsapp", label: "Send WhatsApp" }],
    lastRunAt: null,
    whatsappBlocked: false,
    statusStepGoverned: false,
    stats: { runs: 0, successRate: null, attention: 0, trend: [] },
    raw: {} as never,
  };

  it("does not skip a heading level under the page h1", () => {
    const { container } = render(
      <Page>
        <AutomationCard data={data} canManage />
      </Page>,
    );
    expectNoSkippedLevel(headingLevels(container));
  });

  it("does not skip a heading level in the templates tab either", () => {
    const { container } = render(
      <Page>
        <AutomationTemplatesGallery canManage />
      </Page>,
    );
    expectNoSkippedLevel(headingLevels(container));
  });

  it("gives the card's title link a 24px target (WCAG 2.5.8)", () => {
    const { container } = render(<AutomationCard data={data} canManage />);
    const link = container.querySelector("a[data-automation-edit]");
    expect(link).not.toBeNull();
    // An inline link is as tall as its font box (~18px): it must be a block
    // with a 24px floor to count as a target.
    expect(link?.className).toMatch(/\bblock\b/);
    expect(link?.className).toMatch(/\bmin-h-6\b/);
  });
});

describe("/notifications", () => {
  it("does not skip a heading level under the page h1", () => {
    const { container } = render(
      <Page>
        <NotificationFeedList
          groups={[{ key: "today", label: "Today", items: [] }]}
          busy={false}
          onAction={() => {}}
        />
      </Page>,
    );
    expectNoSkippedLevel(headingLevels(container));
  });
});

describe("/automations/new and /automations/[id]", () => {
  it("new: exactly one h1 (the existing title copy) and no nested <main>", () => {
    const { container } = render(
      <div data-testid="layout-main">
        <AutomationBuilder whatsappConnected />
      </div>,
    );
    const h1s = container.querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe(getAutomationWorkspaceCopy("en", "flow.newTitle"));
    expectNoNestedMain(container);
    expectNoSkippedLevel(headingLevels(container));
  });

  it("edit: exactly one h1 and no nested <main>", () => {
    const { container } = render(
      <div data-testid="layout-main">
        <AutomationBuilder
          whatsappConnected
          runs={[]}
          automation={{
            id: "a1",
            name: "Confirm orders",
            trigger: "order.created",
            action: "tag_customer",
            isActive: true,
            conditions: null,
            config: JSON.stringify({ noteText: "x" }),
            steps: JSON.stringify([{ action: "tag_customer", onFailure: "stop", config: { noteText: "x" } }]),
            dryRun: false,
            maxRetries: 0,
            retryDelayMs: 0,
          }}
        />
      </div>,
    );
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expectNoNestedMain(container);
    expectNoSkippedLevel(headingLevels(container));
    expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).not.toBe("");
  });
});
