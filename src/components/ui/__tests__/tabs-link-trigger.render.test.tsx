/**
 * @vitest-environment happy-dom
 */
/**
 * Status tabs on /orders and /deliveries are links to a re-rendered page; no panel
 * with Radix's generated id exists. axe (aria-valid-attr-value, critical) fails the
 * selected tab when it still carries aria-controls.
 *
 * A server page cannot switch that attribute off with `aria-controls={undefined}`:
 * React drops undefined props when it sends them to a client component, so Radix
 * keeps its default (the sweep of 24 Oct still found it on both pages although the
 * page-level test, which skips that boundary, passed). The switch therefore has to be
 * a plain boolean prop that the client component turns into the override itself.
 * These tests give the trigger exactly the props it receives after that boundary.
 */
import { cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { render } from "@/test-utils/render";

afterEach(cleanup);

function linkTabs(extra: { linksToPage?: boolean }) {
  return (
    <Tabs defaultValue="all">
      <TabsList>
        <TabsTrigger value="all" asChild {...extra}>
          <a href="/orders">All</a>
        </TabsTrigger>
        <TabsTrigger value="pending" asChild {...extra}>
          <a href="/orders?status=pending">Pending</a>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

describe("TabsTrigger that is a link to another page", () => {
  it("writes no aria-controls when linksToPage is set (props as they arrive from a server page)", () => {
    render(linkTabs({ linksToPage: true }));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) expect(tab.getAttribute("aria-controls")).toBeNull();
  });

  it("keeps aria-controls on an ordinary tab that has a panel", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">panel a</TabsContent>
        <TabsContent value="b">panel b</TabsContent>
      </Tabs>,
    );
    const selected = screen.getByRole("tab", { name: "A" });
    const panelId = selected.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId ?? "")).not.toBeNull();
  });
});

describe("pages whose status tabs are links", () => {
  const root = process.cwd();
  for (const rel of ["src/app/(dashboard)/orders/page.tsx", "src/app/(dashboard)/deliveries/page.tsx"]) {
    it(`${rel} uses linksToPage, not aria-controls={undefined}`, () => {
      const source = readFileSync(join(root, rel), "utf8");
      expect(source).toContain("linksToPage");
      expect(source).not.toContain("aria-controls={undefined}");
    });
  }
});
