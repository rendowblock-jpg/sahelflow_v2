/**
 * @vitest-environment happy-dom
 */
/**
 * The shared table's bulk behaviour (P5 slice 1), with the real component and the real `nuqs` adapter:
 *  - the bulk bar comes and goes, which a screen reader does not announce, so a persistent polite region says how
 *    many rows are selected;
 *  - a bulk action is handed controls to narrow the selection to the rows that failed, or to clear it;
 *  - a row checkbox can be named after the row (the table keeps no copy of its own for that).
 */
import { act, fireEvent, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { DataTable, selectColumn, type BulkAction, type BulkControls } from "../data-table";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));

interface Row {
  id: string;
  number: string;
}
const ROWS: Row[] = [
  { id: "a", number: "ORD-0001" },
  { id: "b", number: "ORD-0002" },
  { id: "c", number: "ORD-0003" },
];
const columns: ColumnDef<Row, unknown>[] = [
  selectColumn<Row>(),
  { accessorKey: "number", header: () => "Number", cell: ({ row }) => row.original.number },
];

function mount(actions: BulkAction[], extra: { getRowLabel?: (row: Row) => string } = {}) {
  return render(
    <NuqsTestingAdapter>
      <DataTable columns={columns} data={ROWS} bulkActions={actions} getRowId={(row) => row.id} showDensityToggle={false} {...extra} />
    </NuqsTestingAdapter>,
  );
}

const checkboxes = () => screen.getAllByRole("checkbox");
const rowBoxes = () => checkboxes().slice(1);

describe("row checkbox names", () => {
  it("uses the caller's label for each row", () => {
    mount([], { getRowLabel: (row) => `Select order ${row.number}` });
    expect(rowBoxes().map((box) => box.getAttribute("aria-label"))).toEqual([
      "Select order ORD-0001",
      "Select order ORD-0002",
      "Select order ORD-0003",
    ]);
  });

  it("falls back to the generic label when the caller gives none", () => {
    mount([]);
    expect(rowBoxes().map((box) => box.getAttribute("aria-label"))).toEqual(["dataTable.selectRow", "dataTable.selectRow", "dataTable.selectRow"]);
  });
});

describe("selection announcement", () => {
  it("keeps one polite live region in the page from the start and writes the count into it", () => {
    mount([{ label: "Do", onClick: () => undefined }]);
    const region = screen.getByTestId("data-table-selection-status");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    fireEvent.click(rowBoxes()[1] as HTMLElement);
    expect(screen.getByTestId("data-table-selection-status")).toHaveTextContent('dataTable.selected|{"count":2}');
  });

  it("is not rendered when the table has no bulk actions", () => {
    render(
      <NuqsTestingAdapter>
        <DataTable columns={columns} data={ROWS} getRowId={(row) => row.id} showDensityToggle={false} />
      </NuqsTestingAdapter>,
    );
    expect(screen.queryByTestId("data-table-selection-status")).toBeNull();
  });
});

describe("bulk action controls", () => {
  it("hands the selected ids and controls to the action", () => {
    const onClick = vi.fn();
    mount([{ label: "Do", onClick }]);
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    fireEvent.click(rowBoxes()[2] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Do" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    const [ids, controls] = onClick.mock.calls[0] as [string[], BulkControls];
    expect([...ids].sort()).toEqual(["a", "c"]);
    expect(typeof controls.select).toBe("function");
    expect(typeof controls.clear).toBe("function");
  });

  it("select() narrows the selection to the given rows and ignores ids that are not on the page", () => {
    let held: BulkControls | undefined;
    mount([{ label: "Do", onClick: (_ids, controls) => void (held = controls) }]);
    for (const box of rowBoxes()) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Do" }));
    act(() => held?.select(["b", "not-on-this-page"]));
    expect(rowBoxes().map((box) => (box as HTMLInputElement).getAttribute("aria-checked") ?? box.getAttribute("data-state"))).toEqual([
      expect.stringMatching(/false|unchecked/),
      expect.stringMatching(/true|checked/),
      expect.stringMatching(/false|unchecked/),
    ]);
    const bar = screen.getByTestId("data-table-bulk-bar");
    expect(within(bar).getByText('dataTable.selected|{"count":1}')).toBeInTheDocument();
  });

  it("select() does not remember an id that is not on the page: it must not wake up selected when that row appears later", () => {
    let held: BulkControls | undefined;
    const tree = (data: Row[]) => (
      <NuqsTestingAdapter>
        <DataTable
          columns={columns}
          data={data}
          bulkActions={[{ label: "Do", onClick: (_ids, controls) => void (held = controls) }]}
          getRowId={(row) => row.id}
          showDensityToggle={false}
        />
      </NuqsTestingAdapter>
    );
    const view = render(tree(ROWS));
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Do" }));
    act(() => held?.select(["b", "zz"]));
    view.rerender(tree([...ROWS, { id: "zz", number: "ORD-0009" }]));
    expect(rowBoxes()).toHaveLength(4);
    expect(rowBoxes()[1]).toBeChecked();
    expect(rowBoxes()[3]).not.toBeChecked();
    expect(within(screen.getByTestId("data-table-bulk-bar")).getByText('dataTable.selected|{"count":1}')).toBeInTheDocument();
  });

  it("clear() empties the selection and the bar goes away", () => {
    let held: BulkControls | undefined;
    mount([{ label: "Do", onClick: (_ids, controls) => void (held = controls) }]);
    fireEvent.click(rowBoxes()[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Do" }));
    act(() => held?.clear());
    expect(screen.queryByTestId("data-table-bulk-bar")).toBeNull();
  });
});
