/**
 * @vitest-environment happy-dom
 */
/**
 * The desktop table must stay byte-for-byte what it was before the phone card layout existed. The golden files in
 * __snapshots__ were captured from the table BEFORE the card layout was added; this test fails on any markup change
 * in the table path (a new attribute, a moved class, an extra wrapper).
 */
import { fireEvent, screen } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { DataTable, selectColumn } from "../data-table";

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
  customer: string;
  total: number;
  status: string;
  created: string;
}
const ROWS: Row[] = [
  { id: "a", number: "ORD-0001", customer: "Amine B.", total: 4500, status: "pending", created: "2026-10-26" },
  { id: "b", number: "ORD-0002", customer: "Sara K.", total: 1200, status: "shipped", created: "2026-10-27" },
];
const columns: ColumnDef<Row, unknown>[] = [
  selectColumn<Row>(),
  { accessorKey: "number", header: () => "Number", cell: ({ row }) => <a href={`/o/${row.original.id}`}>{row.original.number}</a> },
  { id: "customer", accessorFn: (r) => r.customer, header: () => "Customer", cell: ({ row }) => row.original.customer, enableSorting: false },
  { accessorKey: "total", header: () => "Total", cell: ({ row }) => row.original.total, meta: { align: "end" } },
  { accessorKey: "status", header: () => "Status", cell: ({ row }) => row.original.status, meta: { hideOn: "md" } },
  { accessorKey: "created", header: () => "Date", cell: ({ row }) => row.original.created, meta: { hideOn: "lg", wrap: true } },
  { id: "actions", header: () => "Actions", cell: () => <button type="button">menu</button>, meta: { align: "end", width: "w-12" }, enableSorting: false },
];

/** React ids differ between runs of the same test file; the golden must not. */
function normalised(html: string): string {
  return html
    .replace(/(:r|«r|_r_)[0-9a-z]+(:|»|_)/g, "ID")
    .replace(/radix-[^"]*/g, "radix-ID")
    .replace(/></g, ">\n<");
}

function mount(props: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  return render(
    <NuqsTestingAdapter>
      <DataTable
        columns={columns}
        data={ROWS}
        getRowId={(row) => row.id}
        getRowLabel={(row) => `Select ${row.number}`}
        bulkActions={[{ label: "Do", onClick: () => undefined }]}
        pagination={{ page: 2, pageSize: 25, total: 80, onPageChange: () => undefined, serverSort: true, sort: "number.asc" }}
        onRowClick={() => undefined}
        {...props}
      />
    </NuqsTestingAdapter>,
  );
}

describe("desktop table markup is frozen", () => {
  it("rows, pagination, density toggle and live region", async () => {
    const { container } = mount();
    await expect(normalised(container.innerHTML)).toMatchFileSnapshot("./__snapshots__/desktop-rows.html");
  });

  it("a selected row and the bulk bar", async () => {
    const { container } = mount();
    fireEvent.click(screen.getAllByRole("checkbox")[1] as HTMLElement);
    await expect(normalised(container.innerHTML)).toMatchFileSnapshot("./__snapshots__/desktop-selected.html");
  });

  it("loading skeleton rows", async () => {
    const { container } = mount({ isLoading: true, data: [], skeletonRows: 3, pagination: undefined, bulkActions: undefined });
    await expect(normalised(container.innerHTML)).toMatchFileSnapshot("./__snapshots__/desktop-loading.html");
  });

  it("empty state", async () => {
    const { container } = mount({ data: [], pagination: undefined, bulkActions: undefined });
    await expect(normalised(container.innerHTML)).toMatchFileSnapshot("./__snapshots__/desktop-empty.html");
  });

  it("the default layout on a desktop width renders the table and no card list", () => {
    mount();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.queryByTestId("data-table-cards")).toBeNull();
    expect(document.querySelector("[data-layout]")).toBeNull();
  });
});
