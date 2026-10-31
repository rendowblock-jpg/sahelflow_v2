/**
 * @vitest-environment happy-dom
 */
/**
 * A scrolling tab list shows the tab that is ACTIVE.
 *
 * On a phone the Orders status tabs are one sideways strip (704 px of tabs in about 290 px). Opening
 * /orders?status=cancelled makes the seventh tab the active one, but the strip started at the first
 * tab, so the filter that was on sat off screen and the seller could not tell which list they were
 * looking at. A tab tapped while only half visible stayed half visible. The list now moves itself,
 * sideways only (never the page), until the active tab is inside it, and does nothing when the tab
 * is already in view.
 *
 * The positions here are faked: happy-dom has no layout. The list is 200 px wide at x = 0.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { render } from "@/test-utils/render";

const scrollBy = vi.fn();
const LIST = { left: 0, width: 200 };
let activeBox = { left: 300, width: 80 };

function rectOf(el: Element): DOMRect {
  const role = el.getAttribute("role");
  const box =
    role === "tablist" ? LIST : role === "tab" && el.getAttribute("data-state") === "active" ? activeBox : { left: 0, width: 0 };
  return {
    x: box.left,
    y: 0,
    left: box.left,
    top: 0,
    width: box.width,
    height: 28,
    right: box.left + box.width,
    bottom: 28,
    toJSON: () => ({}),
  } as DOMRect;
}

beforeEach(() => {
  scrollBy.mockReset();
  activeBox = { left: 300, width: 80 };
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    return rectOf(this);
  });
  for (const proto of [Element.prototype, HTMLElement.prototype]) {
    Object.defineProperty(proto, "scrollBy", { configurable: true, writable: true, value: scrollBy });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function list(options: { scroll?: boolean; value?: string }) {
  render(
    <Tabs defaultValue={options.value ?? "c"}>
      <TabsList scroll={options.scroll} variant="line">
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
        <TabsTrigger value="c">C</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

describe("TabsList scroll shows the active tab", () => {
  it("moves a tab that is off the end into the middle of the list", () => {
    list({ scroll: true });
    // tab centre 340, list centre 100
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ left: 240 });
  });

  it("moves a tab that is only half in view", () => {
    activeBox = { left: 160, width: 80 };
    list({ scroll: true });
    expect(scrollBy).toHaveBeenCalledWith({ left: 100 });
  });

  it("moves a tab that is off the start side (a negative step, so the same line is right in a right-to-left page)", () => {
    activeBox = { left: -150, width: 80 };
    list({ scroll: true });
    expect(scrollBy).toHaveBeenCalledWith({ left: -210 });
  });

  it("leaves the list where it is when the active tab is already in view", () => {
    activeBox = { left: 50, width: 80 };
    list({ scroll: true });
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does nothing for a list that does not scroll", () => {
    list({ scroll: false });
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("follows the active tab when it changes", async () => {
    function Harness() {
      const [value, setValue] = React.useState("a");
      return (
        <>
          <button type="button" onClick={() => setValue("c")}>
            go
          </button>
          <Tabs value={value} onValueChange={setValue}>
            <TabsList scroll variant="line">
              <TabsTrigger value="a">A</TabsTrigger>
              <TabsTrigger value="b">B</TabsTrigger>
              <TabsTrigger value="c">C</TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      );
    }
    activeBox = { left: 10, width: 80 };
    render(<Harness />);
    expect(scrollBy).not.toHaveBeenCalled();
    activeBox = { left: 300, width: 80 };
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith({ left: 240 }));
  });

  it("does not touch the page: only the list element is asked to move", () => {
    const pageScroll = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    list({ scroll: true });
    expect(pageScroll).not.toHaveBeenCalled();
    expect(scrollBy.mock.contexts[0]).toBe(screen.getByRole("tablist"));
  });
});
