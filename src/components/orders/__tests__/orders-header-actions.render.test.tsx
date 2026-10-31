/**
 * @vitest-environment happy-dom
 */
/**
 * 31 Oct 2026 (w214): on a phone the main action ("New order") is the first thing in the action group and the
 * secondary ones follow; from 768 px up (md:) the group looks exactly as before (main action last). The DOM order stays
 * as it was, so the keyboard order on a desktop does not change. Tailwind variants are read as the CSS they stand for.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OrdersHeaderActions } from "../orders-header-actions";

afterEach(cleanup);

type View = "phone" | "desktop";

/** The classes that apply in a view: plain ones plus max-md: (phone) or md: (desktop). */
function tokensFor(el: Element, view: View): string[] {
  const prefix = view === "phone" ? "max-md:" : "md:";
  return [...el.classList].flatMap((token) => {
    if (token.startsWith(prefix)) return [token.slice(prefix.length)];
    return token.includes(":") ? [] : [token];
  });
}

/** Flex items in the order the eye reads them: `order-first`/`order-last` applied, `display: contents` looked through. */
function visualOrder(group: Element, view: View): string[] {
  const items: Array<{ text: string; rank: number }> = [];
  for (const child of Array.from(group.children)) {
    const tokens = tokensFor(child, view);
    if (tokens.includes("contents")) {
      for (const inner of Array.from(child.children)) items.push({ text: inner.textContent ?? "", rank: 0 });
      continue;
    }
    const rank = tokens.includes("order-first") ? -1 : tokens.includes("order-last") ? 1 : 0;
    items.push({ text: child.textContent ?? "", rank });
  }
  return items.map((item, index) => ({ ...item, index })).sort((a, b) => a.rank - b.rank || a.index - b.index).map((item) => item.text);
}

function group(props: { queue?: boolean; importExport?: boolean; primary?: boolean } = { queue: true, importExport: true, primary: true }) {
  const { container } = render(
    <OrdersHeaderActions
      queue={props.queue ? <a href="/q">Queue</a> : null}
      importExport={props.importExport ? <div>ImportExport</div> : null}
      primary={props.primary ? <button type="button">New order</button> : null}
    />,
  );
  return container.firstElementChild as HTMLElement;
}

describe("orders header actions", () => {
  it("puts the main action first on a phone, the others after it in their old order", () => {
    expect(visualOrder(group(), "phone")).toEqual(["New order", "Queue", "ImportExport"]);
  });

  it("looks as before from 768 px up: queue, import/export, main action last", () => {
    expect(visualOrder(group(), "desktop")).toEqual(["Queue", "ImportExport", "New order"]);
  });

  it("keeps the DOM (keyboard) order as before", () => {
    expect(group().textContent).toBe("QueueImportExportNew order");
  });

  it("gives the main action no box of its own from 768 px up, so the desktop layout cannot move", () => {
    const el = group();
    const slot = el.querySelector("button")?.parentElement as HTMLElement;
    expect(slot).not.toBe(el);
    expect(tokensFor(slot, "desktop")).toContain("contents");
    expect([...slot.classList].some((token) => /^order-/.test(token))).toBe(false);
  });

  it("renders only what it is given and nothing when it is given nothing", () => {
    expect(visualOrder(group({ primary: true }), "phone")).toEqual(["New order"]);
    expect(visualOrder(group({ queue: true, primary: true }), "phone")).toEqual(["New order", "Queue"]);
    const { container } = render(<OrdersHeaderActions />);
    expect(container.firstChild).toBeNull();
  });
});
