/**
 * @vitest-environment happy-dom
 */
/**
 * PageHeader at large text sizes. The title block and the action group are sized in rem and grow with the text, while the
 * header is a single row from 640 px up. At 200% text the action group (which could not shrink and could not wrap, because
 * it was asked to keep its own width) took the whole row and the title and its description were squeezed to no width
 * (found by the 200% text run: both measured 0 px on Orders and Analytics). The header now wraps, the title block keeps a
 * floor, and the action group may never be wider than the header.
 *
 * This file pins the structure; the browser run (text200 over every route in ar, fr and en) proves the result.
 */
import { cleanup, render } from "@testing-library/react";
import { Plus } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";

import { PageHeader } from "@/components/shared/page-header";

afterEach(cleanup);

function renderHeader(variant: "document" | "workspace", withActions: boolean) {
  const { container } = render(
    <PageHeader
      title="Orders"
      description="Manage all your orders in one place"
      icon={Plus}
      variant={variant}
      actions={withActions ? <button type="button">New order</button> : undefined}
    />,
  );
  const header = container.querySelector<HTMLElement>('[data-slot="page-header"]');
  if (!header) throw new Error("no page header rendered");
  const heading = header.querySelector("h1");
  if (!heading) throw new Error("the header has no title");
  const titleBlock = heading.parentElement?.parentElement as HTMLElement | null;
  if (!titleBlock) throw new Error("the title has no block around it");
  const actions = header.querySelector<HTMLElement>('[data-slot="page-actions"]');
  return { header, titleBlock, actions };
}

const classesOf = (element: HTMLElement) => element.className.split(/\s+/);

describe.each(["document", "workspace"] as const)("PageHeader (%s) at large text sizes", (variant) => {
  it("wraps from the row layout instead of squeezing the title", () => {
    const { header } = renderHeader(variant, true);
    const classes = classesOf(header);
    expect(classes).toContain("sm:flex-row");
    expect(classes).toContain("sm:flex-wrap");
    expect(classes).toContain("sm:justify-between");
  });

  it("the title block keeps a floor and takes the free space", () => {
    const { titleBlock } = renderHeader(variant, true);
    const classes = classesOf(titleBlock);
    expect(classes).toContain("sm:min-w-[min(100%,12rem)]");
    expect(classes).toContain("sm:flex-1");
    expect(classes).toContain("sm:basis-0");
  });

  it("the actions never grow wider than the header, and sit at the end when they wrap", () => {
    const { actions } = renderHeader(variant, true);
    if (!actions) throw new Error("no actions group rendered");
    const classes = classesOf(actions);
    expect(classes).toContain("max-w-full");
    expect(classes).toContain("shrink-0");
    expect(classes).toContain("flex-wrap");
    expect(classes).toContain("sm:ms-auto");
  });

  it("without actions there is no actions group", () => {
    const { actions } = renderHeader(variant, false);
    expect(actions).toBeNull();
  });
});

describe("PageHeader content is unchanged", () => {
  it("still renders one h1 with the title and the description", () => {
    const { header } = renderHeader("document", true);
    expect(header.querySelectorAll("h1")).toHaveLength(1);
    expect(header.querySelector("h1")?.textContent).toBe("Orders");
    expect(header.textContent).toContain("Manage all your orders in one place");
    expect(header.textContent).toContain("New order");
  });
});
