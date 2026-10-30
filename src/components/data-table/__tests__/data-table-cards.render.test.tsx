/**
 * @vitest-environment happy-dom
 */
/**
 * The phone layout of the shared table: below the md breakpoint each row is a card. happy-dom cannot measure layout, so
 * these tests prove the DOM contract (one layout at a time, list semantics, slots, selection, sorting, paging, states)
 * and the class contract (truncation, stretched link, logical start/end geometry). The look is the lead's to verify.
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import axe from "axe-core";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TechnicalValue } from "@/components/i18n/technical-value";
import { render } from "@/test-utils/render";

import { DataTable, selectColumn, type BulkAction } from "../data-table";

const i18n = vi.hoisted(() => ({ locale: "en", dir: "ltr" }));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: i18n.locale,
    dir: i18n.dir,
  }),
}));

interface Row {
  id: string;
  number: string;
  customer: string;
  phone: string;
  city: string;
  items: number;
  total: number;
  created: string;
}
const LONG = "Mohamed El Amine Ben Abderrahmane Ould Sidi Mohamed El Hadj";
const ROWS: Row[] = [
  { id: "a", number: "ORD-0001", customer: LONG, phone: "0555 00 00 01", city: "Alger", items: 2, total: 4500, created: "2026-10-26" },
  { id: "b", number: "ORD-0002", customer: "Sara K.", phone: "0555 00 00 02", city: "Oran", items: 1, total: 1200, created: "2026-10-27" },
  { id: "c", number: "ORD-0003", customer: "Yacine M.", phone: "0555 00 00 03", city: "Blida", items: 5, total: 99000, created: "2026-10-28" },
];

const columns: ColumnDef<Row, unknown>[] = [
  selectColumn<Row>(),
  {
    accessorKey: "number",
    header: () => "Number",
    cell: ({ row }) => <a href={`/orders/${row.original.id}`}>{row.original.number}</a>,
    meta: { mobile: { slot: "title" } },
  },
  {
    id: "customer",
    accessorFn: (r) => r.customer,
    header: () => "Customer",
    cell: ({ row }) => (
      <div>
        <bdi dir="auto">{row.original.customer}</bdi>
        <TechnicalValue>{row.original.phone}</TechnicalValue>
      </div>
    ),
    meta: { mobile: { slot: "subtitle" } },
    enableSorting: false,
  },
  { accessorKey: "city", header: () => <span>City<svg aria-hidden="true" /></span>, cell: ({ row }) => row.original.city },
  { accessorKey: "items", header: () => "Items", cell: ({ row }) => row.original.items, meta: { mobile: { slot: "field", label: "Articles" } } },
  { accessorKey: "total", header: () => "Total", cell: ({ row }) => <span data-money>{row.original.total} DA</span>, meta: { align: "end", mobile: { slot: "amount" } } },
  { id: "status", accessorFn: (r) => r.id, header: () => "Status", cell: ({ row }) => <button type="button">{`Status ${row.original.number}`}</button>, meta: { mobile: { slot: "status" } }, enableSorting: false },
  { accessorKey: "created", header: () => "Date", cell: ({ row }) => row.original.created, meta: { hideOn: "lg", mobile: { slot: "time" } } },
  {
    id: "actions",
    header: () => "Actions",
    cell: ({ row }) => <button type="button" aria-label={`Actions ${row.original.number}`}>⋮</button>,
    meta: { align: "end", width: "w-12" },
    enableSorting: false,
  },
];

const originalWidth = window.innerWidth;
afterEach(() => {
  Object.defineProperty(window, "innerWidth", { value: originalWidth, configurable: true, writable: true });
  i18n.locale = "en";
  i18n.dir = "ltr";
});
function setWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

type Props = Parameters<typeof DataTable<Row>>[0];
function mount(props: Partial<Props> = {}, onUrlUpdate?: (event: { queryString: string }) => void) {
  return render(
    <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>
      <DataTable
        columns={columns}
        data={ROWS}
        layout="cards"
        getRowId={(row) => row.id}
        getRowLabel={(row) => `Select ${row.number}`}
        {...props}
      />
    </NuqsTestingAdapter>,
  );
}
const cards = () => screen.getAllByTestId("data-table-card");
const rowBoxes = () => cards().map((card) => within(card).getByRole("checkbox"));

describe("which layout renders", () => {
  it("layout=cards renders the card list and no table", () => {
    const { container } = mount();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByTestId("data-table-cards").tagName).toBe("UL");
    expect(cards()).toHaveLength(3);
    expect(container.querySelector("[data-layout='cards']")).not.toBeNull();
  });

  it("layout=table renders the table and no card list, whatever the width", () => {
    setWidth(360);
    mount({ layout: "table" });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table-cards")).toBeNull();
  });

  it("layout=auto follows the viewport: a 360 px phone gets cards, a 1366 px desktop gets the table", () => {
    setWidth(360);
    const phone = mount({ layout: "auto" });
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByTestId("data-table-cards")).toBeInTheDocument();
    phone.unmount();
    setWidth(1366);
    mount({ layout: "auto" });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table-cards")).toBeNull();
  });

  it("the default is auto", () => {
    setWidth(360);
    mount({ layout: undefined });
    expect(screen.getByTestId("data-table-cards")).toBeInTheDocument();
  });

  it("a card never renders a cell twice: one checkbox, one title link, one status button per row", () => {
    mount();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4); // select all + 3 rows
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /^Status ORD/ })).toHaveLength(3);
  });
});

describe("card anatomy", () => {
  it("puts each column in its slot", () => {
    mount();
    const first = cards()[0] as HTMLElement;
    const slot = (name: string) => first.querySelector(`[data-slot="${name}"]`) as HTMLElement;
    expect(within(slot("title")).getByRole("link", { name: "ORD-0001" })).toBeInTheDocument();
    expect(slot("subtitle")).toHaveTextContent(LONG);
    expect(slot("subtitle")).toHaveTextContent("0555 00 00 01");
    expect(within(slot("status")).getByRole("button", { name: "Status ORD-0001" })).toBeInTheDocument();
    expect(slot("amount")).toHaveTextContent("4500 DA");
    expect(slot("time")).toHaveTextContent("2026-10-26");
    expect(within(slot("actions")).getByRole("button", { name: "Actions ORD-0001" })).toBeInTheDocument();
    expect(within(slot("select")).getByRole("checkbox")).toHaveAttribute("aria-label", "Select ORD-0001");
  });

  it("renders the secondary fields as a definition list with labels (explicit label, else the header text without its icon)", () => {
    mount();
    const dl = (cards()[0] as HTMLElement).querySelector("dl") as HTMLElement;
    const terms = [...dl.querySelectorAll("dt")].map((dt) => dt.textContent);
    expect(terms).toEqual(["City", "Articles"]);
    expect([...dl.querySelectorAll("dd")].map((dd) => dd.textContent)).toEqual(["Alger", "2"]);
  });

  it("omits the definition list and the footer when the plan has none", () => {
    const only: ColumnDef<Row, unknown>[] = [
      { accessorKey: "number", header: () => "Number", cell: ({ row }) => row.original.number },
    ];
    mount({ columns: only });
    const card = cards()[0] as HTMLElement;
    expect(card.querySelector("dl")).toBeNull();
    expect(card.querySelector('[data-slot="amount"]')).toBeNull();
    expect(card.querySelector('[data-slot="time"]')).toBeNull();
    expect(card).toHaveTextContent("ORD-0001");
  });

  it("works with NO mobile metadata at all: first column is the title, the rest are fields, nothing is lost silently", () => {
    const plain: ColumnDef<Row, unknown>[] = [
      selectColumn<Row>(),
      { accessorKey: "number", header: () => "Number", cell: ({ row }) => row.original.number },
      { accessorKey: "city", header: () => "City", cell: ({ row }) => row.original.city },
      { accessorKey: "items", header: () => "Items", cell: ({ row }) => row.original.items },
    ];
    mount({ columns: plain });
    const card = cards()[0] as HTMLElement;
    expect(card.querySelector('[data-slot="title"]')).toHaveTextContent("ORD-0001");
    expect([...card.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["City", "Items"]);
  });
});

describe("list semantics", () => {
  it("is one named list with one list item per row", () => {
    mount();
    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveAttribute("role", "list");
    expect(lists[0]).toHaveAccessibleName("dataTable.cards.list");
    expect(within(lists[0] as HTMLElement).getAllByRole("listitem")).toHaveLength(3);
  });

  it("a caller can name the list", () => {
    mount({ label: "Orders" });
    expect(screen.getByRole("list")).toHaveAccessibleName("Orders");
  });

  it("passes axe structural rules (names for controls, list and definition-list structure, no duplicate ids, no nested interactive)", async () => {
    const { container } = mount({
      bulkActions: [{ label: "Do", onClick: () => undefined }],
      pagination: { page: 1, pageSize: 25, total: 3, onPageChange: () => undefined, serverSort: true, sort: "number.asc" },
    });
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    const result = await axe.run(container, {
      runOnly: {
        type: "rule",
        values: [
          "list", "listitem", "definition-list", "dlitem", "button-name", "link-name", "label", "select-name",
          "aria-allowed-attr", "aria-valid-attr", "aria-valid-attr-value", "aria-required-children", "aria-roles",
          "nested-interactive", "duplicate-id", "duplicate-id-aria", "aria-allowed-role",
        ],
      },
    });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });

  it("every control has an accessible name", () => {
    mount({ pagination: { page: 2, pageSize: 25, total: 90, onPageChange: () => undefined, serverSort: true, sort: "number.asc" } });
    for (const control of [...screen.getAllByRole("button"), ...screen.getAllByRole("checkbox"), ...screen.getAllByRole("combobox")]) {
      expect(control).toHaveAccessibleName();
    }
  });
});

describe("selection in the card layout", () => {
  const actions: BulkAction[] = [{ label: "Do", onClick: vi.fn() }];

  it("a card checkbox selects the row: the bulk bar and the live region follow", () => {
    mount({ bulkActions: actions });
    expect(screen.queryByTestId("data-table-bulk-bar")).toBeNull();
    fireEvent.click(rowBoxes()[1] as HTMLElement);
    expect(within(screen.getByTestId("data-table-bulk-bar")).getByText('dataTable.selected|{"count":1}')).toBeInTheDocument();
    expect(screen.getByTestId("data-table-selection-status")).toHaveTextContent('dataTable.selected|{"count":1}');
  });

  it("a selected card is marked by state, check mark and a ring, not by colour alone", () => {
    mount({ bulkActions: actions });
    const card = cards()[1] as HTMLElement;
    expect(card).not.toHaveAttribute("data-state", "selected");
    fireEvent.click(rowBoxes()[1] as HTMLElement);
    expect(card).toHaveAttribute("data-state", "selected");
    expect(rowBoxes()[1]).toBeChecked();
    expect(card.querySelector("[data-slot='checkbox-indicator'] svg")).not.toBeNull();
    expect(card.className).toMatch(/\bring-\d/);
    expect(card.className).toMatch(/\bborder-primary\b/);
    expect(cards()[0]?.className).not.toMatch(/\bborder-primary\b/);
  });

  it("select-all selects every card on the page and the bulk action receives the ids", () => {
    const onClick = vi.fn();
    mount({ bulkActions: [{ label: "Do", onClick }] });
    const selectAll = screen.getByRole("checkbox", { name: "dataTable.selectAll" });
    fireEvent.click(selectAll);
    expect(rowBoxes().every((box) => (box as HTMLElement).getAttribute("aria-checked") === "true")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Do" }));
    expect([...(onClick.mock.calls[0]?.[0] as string[])].sort()).toEqual(["a", "b", "c"]);
  });

  it("the bulk bar's clear button empties the selection and the cards return to normal", () => {
    mount({ bulkActions: actions });
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "dataTable.clear" }));
    expect(screen.queryByTestId("data-table-bulk-bar")).toBeNull();
    expect(cards()[0]).not.toHaveAttribute("data-state", "selected");
  });

  it("no select-all row when the table has no select column", () => {
    mount({ columns: columns.filter((c) => c.id !== "select") });
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("bulk bar buttons are touch sized in the card layout", () => {
    mount({ bulkActions: actions });
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    const bar = screen.getByTestId("data-table-bulk-bar");
    for (const button of within(bar).getAllByRole("button")) expect(button.className).toMatch(/min-h-11/);
  });
});

describe("row click, link and touch contract", () => {
  it("a tap on the card body opens the row; a tap on the checkbox, the status button or the actions button does not", () => {
    const onRowClick = vi.fn();
    mount({ onRowClick, bulkActions: [{ label: "Do", onClick: () => undefined }] });
    const card = cards()[0] as HTMLElement;
    fireEvent.click(card.querySelector('[data-slot="subtitle"]') as HTMLElement);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
    fireEvent.click(within(card).getByRole("checkbox"));
    fireEvent.click(within(card).getByRole("button", { name: "Status ORD-0001" }));
    fireEvent.click(within(card).getByRole("button", { name: "Actions ORD-0001" }));
    fireEvent.click(within(card).getByRole("link"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("the title link is stretched over the whole card and the card draws the focus ring", () => {
    mount({ onRowClick: () => undefined });
    const card = cards()[0] as HTMLElement;
    expect(card.className).toContain("relative");
    expect(card.className).toContain("has-[:focus-visible]:ring-2");
    const title = card.querySelector('[data-slot="title"]') as HTMLElement;
    expect(title.className).toContain("[&_a]:after:absolute");
    expect(title.className).toContain("[&_a]:after:inset-0");
    // Everything that is a control sits above the stretched link.
    for (const name of ["select", "status", "actions"]) {
      expect((card.querySelector(`[data-slot="${name}"]`) as HTMLElement).className).toContain("z-10");
    }
  });

  it("a card is not a click target when the table has no row action", () => {
    mount({ onRowClick: undefined });
    expect((cards()[0] as HTMLElement).className).not.toContain("cursor-pointer");
  });

  it("the row actions area is at least 44 px for buttons and links, and a tap inside it never opens the row", () => {
    const onRowClick = vi.fn();
    mount({ onRowClick });
    const actions = (cards()[0] as HTMLElement).querySelector('[data-slot="actions"]') as HTMLElement;
    expect(actions.className).toContain("[&_button]:min-h-11");
    expect(actions.className).toContain("[&_button]:min-w-11");
    expect(actions.className).toContain("[&_a]:min-h-11");
    fireEvent.click(actions);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("the checkbox and the status chip get a 44 px hit area", () => {
    mount();
    const card = cards()[0] as HTMLElement;
    expect((card.querySelector('[data-slot="select"]') as HTMLElement).className).toContain("after:-inset-");
    expect((card.querySelector('[data-slot="status"]') as HTMLElement).className).toContain("after:-inset-");
  });
});

describe("narrow screens (320 px): nothing may force sideways scroll", () => {
  it("long names truncate with an ellipsis and carry the full text in a title attribute", () => {
    mount();
    const subtitle = (cards()[0] as HTMLElement).querySelector('[data-slot="subtitle"]') as HTMLElement;
    expect(subtitle.className).toContain("truncate");
    expect(subtitle).toHaveAttribute("title", LONG);
    const title = (cards()[0] as HTMLElement).querySelector('[data-slot="title"]') as HTMLElement;
    expect(title.className).toContain("truncate");
    expect(title).toHaveAttribute("title", "ORD-0001");
  });

  it("every flex or grid child that holds text can shrink (min-w-0) and no card has a fixed pixel width", () => {
    mount();
    const card = cards()[0] as HTMLElement;
    for (const slot of ["title", "subtitle"]) {
      expect((card.querySelector(`[data-slot="${slot}"]`) as HTMLElement).className).toContain("min-w-0");
    }
    for (const dd of card.querySelectorAll("dd")) expect(dd.className).toContain("min-w-0");
    for (const el of [card, ...card.querySelectorAll("*")]) {
      expect(el.getAttribute("class") ?? "").not.toMatch(/(^|\s)(w|min-w)-\[\d+px\]/);
    }
    expect(screen.getByTestId("data-table-cards").className).not.toMatch(/overflow-x-(auto|scroll)/);
  });
});

describe("RTL", () => {
  it("uses only logical (start/end) geometry and keeps numbers, phones and money as LTR isolates", () => {
    i18n.locale = "ar";
    i18n.dir = "rtl";
    const { container } = render(
      <div dir="rtl" lang="ar">
        <NuqsTestingAdapter>
          <DataTable
            columns={columns}
            data={ROWS}
            layout="cards"
            getRowId={(row) => row.id}
            bulkActions={[{ label: "Do", onClick: () => undefined }]}
            pagination={{ page: 2, pageSize: 25, total: 90, onPageChange: () => undefined, serverSort: true, sort: "number.asc" }}
            onRowClick={() => undefined}
          />
        </NuqsTestingAdapter>
      </div>,
    );
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    // A physical-direction utility (ml-, pr-, left-, text-right, rounded-l ...) breaks in RTL; rtl:-prefixed ones are deliberate.
    const physical = /^-?(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|border-l|border-r|float-left|float-right)(-|$)/;
    const offenders = [...container.querySelectorAll("[class]")]
      .flatMap((el) => (el.getAttribute("class") ?? "").split(/\s+/))
      .filter((token) => token && !token.includes("rtl:") && physical.test(token.split(":").pop() ?? ""));
    expect(offenders).toEqual([]);
    const amount = (cards()[0] as HTMLElement).querySelector('[data-slot="amount"] [data-technical-value]') as HTMLElement;
    expect(amount).not.toBeNull();
    expect(amount).toHaveAttribute("dir", "ltr");
    const phone = (cards()[0] as HTMLElement).querySelector('[data-slot="subtitle"] [data-technical-value]') as HTMLElement;
    expect(phone).toHaveAttribute("dir", "ltr");
    expect(container.querySelector('[data-slot="time"] bdi')).not.toBeNull();
  });
});

describe("states", () => {
  it("loading shows skeleton cards that screen readers skip, and marks the list busy", () => {
    mount({ isLoading: true, data: [], skeletonRows: 4 });
    const list = screen.getByTestId("data-table-cards");
    expect(list).toHaveAttribute("aria-busy", "true");
    const skeletons = list.querySelectorAll("li");
    expect(skeletons).toHaveLength(4);
    for (const item of skeletons) expect(item).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByTestId("data-table-card")).toBeNull();
  });

  it("empty shows the caller's empty state or the default text, and no list", () => {
    const first = mount({ data: [], emptyState: <p>Nothing here</p> });
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    first.unmount();
    mount({ data: [] });
    expect(screen.getByText("dataTable.noData")).toBeInTheDocument();
  });

  it("refreshing dims the list but not the bulk bar", () => {
    mount({ refreshing: true, bulkActions: [{ label: "Do", onClick: () => undefined }] });
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    expect(screen.getByTestId("data-table-cards").closest(".opacity-60")).not.toBeNull();
    expect(screen.getByTestId("data-table-bulk-bar").closest(".opacity-60")).toBeNull();
  });
});

describe("sorting in the card layout", () => {
  const paged = { page: 1, pageSize: 25, total: 3, onPageChange: () => undefined, serverSort: true, sort: "number.asc" };

  it("offers one labelled native select with every sortable column in both directions", () => {
    mount({ pagination: paged });
    const select = screen.getByRole("combobox", { name: "dataTable.sort.by" });
    const options = [...select.querySelectorAll("option")].map((o) => o.value);
    expect(options).toEqual([
      "",
      "number.asc", "number.desc",
      "city.asc", "city.desc",
      "items.asc", "items.desc",
      "total.asc", "total.desc",
      "created.asc", "created.desc",
    ]);
    expect((select as HTMLSelectElement).value).toBe("number.asc");
    expect(select.className).toMatch(/min-h-11|h-11/);
  });

  it("choosing an option writes the same sort and page=1 to the URL that the header buttons write", async () => {
    const urls: string[] = [];
    mount({ pagination: { ...paged, page: 3 } }, (event) => urls.push(event.queryString));
    fireEvent.change(screen.getByRole("combobox", { name: "dataTable.sort.by" }), { target: { value: "total.desc" } });
    await waitFor(() => expect(urls.length).toBeGreaterThan(0));
    expect(urls.at(-1)).toContain("sort=total.desc");
    expect(urls.at(-1)).toContain("page=1");
  });

  it("is absent when the table cannot sort (a paginated table without a server sort contract)", () => {
    mount({ pagination: { ...paged, serverSort: false } });
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("an unpaginated table sorts locally and can return to the default order", () => {
    mount({ pagination: undefined });
    const select = screen.getByRole("combobox", { name: "dataTable.sort.by" });
    expect(select.querySelector("option[value='']")).not.toBeNull();
  });
});

describe("paging in the card layout", () => {
  it("keeps the pager and its buttons are touch sized", () => {
    const onPageChange = vi.fn();
    mount({ pagination: { page: 2, pageSize: 25, total: 90, onPageChange, serverSort: true, sort: "number.asc" } });
    const nav = screen.getByRole("navigation");
    const buttons = within(nav).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    for (const button of buttons) expect(button.className).toMatch(/size-11/);
    fireEvent.click(within(nav).getByRole("button", { name: "dataTable.nextPage" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("changing the page clears the selection", () => {
    mount({
      bulkActions: [{ label: "Do", onClick: () => undefined }],
      pagination: { page: 2, pageSize: 25, total: 90, onPageChange: () => undefined, serverSort: true, sort: "number.asc" },
    });
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "dataTable.nextPage" }));
    expect(screen.queryByTestId("data-table-bulk-bar")).toBeNull();
  });

  it("the density toggle (a desktop spacing choice) is not offered on cards", () => {
    mount({ showDensityToggle: true });
    expect(screen.queryByRole("group", { name: "dataTable.density" })).toBeNull();
  });
});
