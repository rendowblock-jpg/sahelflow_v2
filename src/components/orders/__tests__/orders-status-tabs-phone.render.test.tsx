/**
 * @vitest-environment happy-dom
 */
/**
 * 31 Oct 2026, NEW-LINK-TABS-BELOW-TOUCH-FLOOR: on a phone the Orders status tabs are one strip that
 * scrolls sideways (data-scroll), elsewhere they wrap as before (data-wrap). The page uses this list.
 */
import { cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tabs, TabsTrigger } from "@/components/ui/tabs";
import { render } from "@/test-utils/render";

const state = vi.hoisted(() => ({ phone: false }));
vi.mock("@/hooks/use-mobile", () => ({ useMobile: () => state.phone }));

import { OrdersStatusTabsList } from "../orders-status-tabs-list";

afterEach(cleanup);

function list() {
  render(
    <Tabs defaultValue="a">
      <OrdersStatusTabsList className="w-fit max-w-full min-w-0 justify-start">
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </OrdersStatusTabsList>
    </Tabs>
  );
  return screen.getByRole("tablist");
}

describe("orders status tab list", () => {
  it("scrolls sideways on a phone and does not wrap", () => {
    state.phone = true;
    const el = list();
    expect(el).toHaveAttribute("data-scroll", "true");
    expect(el).not.toHaveAttribute("data-wrap");
  });

  it("wraps and does not scroll when it is not a phone", () => {
    state.phone = false;
    const el = list();
    expect(el).toHaveAttribute("data-wrap", "true");
    expect(el).not.toHaveAttribute("data-scroll");
  });

  it("keeps the caller classes on both branches", () => {
    state.phone = true;
    expect(list().className).toContain("justify-start");
  });

  it("is what the orders page renders", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(dashboard)/orders/page.tsx"), "utf8");
    expect(page).toContain("<OrdersStatusTabsList");
    expect(page).not.toContain("<TabsList");
    expect(page).toContain("linksToPage");
  });
});
