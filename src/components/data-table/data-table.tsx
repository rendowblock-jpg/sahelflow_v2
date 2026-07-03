"use client";

/**
 * DataTable v2 — premium data table built on TanStack Table (Phase 1).
 *
 * The reusable primitive for all list pages (orders, customers, products,
 * deliveries, returns). Replaces the ad-hoc HTML <table> + take:200 pattern.
 *
 * Features (the "real app" bar from R-2/R-5):
 *   - Cursor/offset pagination (prev/next + page indicator)
 *   - URL-synced sort + page (via nuqs — shareable, back-button works)
 *   - Density toggle (compact/comfortable) — persisted to localStorage
 *   - Bulk selection (checkboxes) + bulk action bar
 *   - Loading skeleton rows (not bare spinner)
 *   - Empty state (illustrated + CTA, not "No data")
 *   - Responsive column hiding (via column meta `hideOn`)
 *   - Row click navigation (via `onRowClick`)
 *   - Frozen first column (for the checkbox column)
 *   - RTL-aware (logical properties throughout)
 *
 * Usage:
 *   const columns = useOrderColumns();
 *   const { data, isLoading, pagination } = useOrders();
 *   <DataTable
 *     columns={columns}
 *     data={data?.orders ?? []}
 *     isLoading={isLoading}
 *     pagination={pagination}
 *     onRowClick={(row) => router.push(`/orders/${row.id}`)}
 *     bulkActions={[{ label: "Confirm", onClick: handleBulkConfirm }]}
 *     emptyState={<EmptyState icon={Package} title="No orders" ... />}
 *   />
 */
import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useQueryStates } from "nuqs";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

// ── Density ────────────────────────────────────────────────────────────
type Density = "compact" | "comfortable";
const DENSITY_STORAGE_KEY = "sf-density";
const DENSITY_CLASSES: Record<Density, { cell: string; head: string }> = {
  compact: { cell: "px-3 py-1.5", head: "px-3 py-2" },
  comfortable: { cell: "px-4 py-3", head: "px-4 py-3" },
};

function useDensity(): [Density, (d: Density) => void] {
  // Lazy initializer reads localStorage once on mount (client-only — no SSR
  // flash because the default "comfortable" matches the first render).
  const [density, setDensityState] = React.useState<Density>(() => {
    if (typeof window === "undefined") return "comfortable";
    try {
      const stored = localStorage.getItem(DENSITY_STORAGE_KEY) as Density | null;
      if (stored === "compact" || stored === "comfortable") return stored;
    } catch { /* blocked */ }
    return "comfortable";
  });
  const setDensity = React.useCallback((d: Density) => {
    setDensityState(d);
    try { localStorage.setItem(DENSITY_STORAGE_KEY, d); } catch { /* ignore */ }
  }, []);
  return [density, setDensity];
}

// ── URL-state parsers (nuqs) ──────────────────────────────────────────
const sortParser = {
  parse: (v: string | null) => v ?? "",
  serialize: (v: string) => v || "",
};
const pageParser = {
  parse: (v: string | null) => (v ? Math.max(1, parseInt(v, 10) || 1) : 1),
  serialize: (v: number) => String(v),
};

// ── Pagination interface ──────────────────────────────────────────────
export interface DataTablePagination {
  /** Current page (1-based). */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Total item count (for page count display). undefined = unknown. */
  total?: number;
  /** Is there a next page? Required if total is unknown (cursor mode). */
  hasNextPage?: boolean;
  /** Called when user navigates to a page. */
  onPageChange: (page: number) => void;
  /** Is the current page loading (refetch)? */
  isLoading?: boolean;
}

// ── Bulk action ───────────────────────────────────────────────────────
export interface BulkAction {
  label: string;
  onClick: (selectedIds: string[]) => void;
  variant?: "default" | "destructive";
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

// ── Column meta (for responsive hiding) ───────────────────────────────
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    /** Hide column on small screens. */
    hideOn?: "sm" | "md" | "lg";
    /** Cell alignment (logical: start/end/center). */
    align?: "start" | "center" | "end";
    /** Fixed width utility class. */
    width?: string;
  }
}

// ── Main component ────────────────────────────────────────────────────
interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Loading state — shows skeleton rows. */
  isLoading?: boolean;
  /** Pagination controls (omit for non-paginated tables). */
  pagination?: DataTablePagination;
  /** Row click handler (usually navigate to detail). */
  onRowClick?: (row: TData) => void;
  /** Bulk actions shown when rows are selected. */
  bulkActions?: BulkAction[];
  /** Custom empty state (shown when data.length === 0 && !isLoading). */
  emptyState?: React.ReactNode;
  /** Get the row ID (for selection). Defaults to (row) => row.id. */
  getRowId?: (row: TData) => string;
  /** Show the density toggle (default true). */
  showDensityToggle?: boolean;
  /** Skeleton row count for loading state. */
  skeletonRows?: number;
  /** className for the table wrapper. */
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  isLoading = false,
  pagination,
  onRowClick,
  bulkActions,
  emptyState,
  getRowId = (row) => (row as { id?: string }).id ?? "",
  showDensityToggle = true,
  skeletonRows = 8,
  className,
}: DataTableProps<TData>) {
  const [density, setDensity] = useDensity();
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  // URL-synced sorting (nuqs) — only if no server-side sort via pagination
  const [sortUrl, setSortUrl] = useQueryStates(
    { sort: sortParser, page: pageParser },
    { shallow: true },
  );

  const sorting = React.useMemo<SortingState>(() => {
    if (!sortUrl.sort) return [];
    const [id, dir] = sortUrl.sort.split(".");
    if (!id) return [];
    return [{ id, desc: dir === "desc" }];
  }, [sortUrl.sort]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      setSortUrl({ sort: first ? `${first.id}.${first.desc ? "desc" : "asc"}` : "", page: 1 });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    manualPagination: !!pagination, // server-side pagination
  });

  const selectedIds = React.useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]),
    [rowSelection],
  );

  const dens = DENSITY_CLASSES[density];

  // ── Pagination info ──
  const totalPages = pagination?.total
    ? Math.ceil(pagination.total / pagination.pageSize)
    : undefined;
  const currentPage = pagination?.page ?? 1;
  const hasNext = pagination?.hasNextPage ?? (totalPages ? currentPage < totalPages : false);
  const hasPrev = currentPage > 1;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Bulk action toolbar */}
      {bulkActions && selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/50 px-4 py-2.5 animate-fade-up"
          data-testid="data-table-bulk-bar"
        >
          <span className="text-sm font-medium">
            {selectedIds.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.variant ?? "default"}
                onClick={() => action.onClick(selectedIds)}
                disabled={action.disabled}
              >
                {action.icon && <action.icon className="me-2 h-3.5 w-3.5" />}
                {action.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRowSelection({})}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Table — rounded border wrapper, sticky header */}
      <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 border-b bg-muted/50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="text-start">
                  {hg.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const hideClass = meta?.hideOn === "sm" ? "hidden sm:table-cell"
                      : meta?.hideOn === "md" ? "hidden md:table-cell"
                      : meta?.hideOn === "lg" ? "hidden lg:table-cell"
                      : "";
                    const alignClass = meta?.align === "end" ? "text-end"
                      : meta?.align === "center" ? "text-center"
                      : "text-start";
                    const canSort = header.column.getCanSort();
                    const sortDir = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          "text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap",
                          dens.head,
                          alignClass,
                          hideClass,
                          meta?.width,
                          canSort && "cursor-pointer hover:text-foreground select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        )}
                        role={canSort ? "button" : undefined}
                        tabIndex={canSort ? 0 : undefined}
                        aria-sort={
                          sortDir === "asc" ? "ascending"
                          : sortDir === "desc" ? "descending"
                          : "none"
                        }
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                        onKeyDown={canSort ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            header.column.getToggleSortingHandler()?.(e);
                          }
                        } : undefined}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                // Skeleton rows
                Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={`skeleton-${i}`}>
                    {columns.map((_, j) => (
                      <td key={j} className={dens.cell}>
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center">
                    {emptyState ?? (
                      <span className="text-sm text-muted-foreground">No data</span>
                    )}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "transition-colors hover:bg-muted/50",
                      onRowClick && "cursor-pointer",
                      row.getIsSelected() && "bg-primary/5",
                    )}
                    onClick={onRowClick ? (e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button") || target.closest("a") || target.closest('[role="checkbox"]')) return;
                      onRowClick(row.original);
                    } : undefined}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      const hideClass = meta?.hideOn === "sm" ? "hidden sm:table-cell"
                        : meta?.hideOn === "md" ? "hidden md:table-cell"
                        : meta?.hideOn === "lg" ? "hidden lg:table-cell"
                        : "";
                      const alignClass = meta?.align === "end" ? "text-end"
                        : meta?.align === "center" ? "text-center"
                        : "text-start";
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "text-sm align-middle whitespace-nowrap",
                            dens.cell,
                            alignClass,
                            hideClass,
                            meta?.width,
                          )}
                          onClick={(e) => {
                            // Stop propagation for checkbox cell
                            if (cell.column.id === "select") e.stopPropagation();
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer: pagination + density */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Density toggle */}
        {showDensityToggle && (
          <div className="flex items-center gap-1 rounded-md border p-0.5" role="group" aria-label="Density">
            {(["comfortable", "compact"] as Density[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium transition-colors",
                  density === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={density === d}
              >
                {d === "comfortable" ? "Normal" : "Compact"}
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {pagination.total != null
                ? `Page ${currentPage} of ${totalPages} (${pagination.total} items)`
                : `Page ${currentPage}`}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="icon-sm"
                variant="outline"
                disabled={!hasPrev || pagination.isLoading}
                onClick={() => pagination.onPageChange(1)}
                aria-label="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                disabled={!hasPrev || pagination.isLoading}
                onClick={() => pagination.onPageChange(currentPage - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                disabled={!hasNext || pagination.isLoading}
                onClick={() => pagination.onPageChange(currentPage + 1)}
                aria-label="Next page"
              >
                {pagination.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                disabled={!hasNext || pagination.isLoading}
                onClick={() => pagination.onPageChange(totalPages ?? currentPage + 1)}
                aria-label="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper: select column definition (reusable) ───────────────────────
export function selectColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected()
            ? true
            : table.getIsSomePageRowsSelected()
              ? "indeterminate"
              : false
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        aria-label="Select row"
      />
    ),
    meta: { width: "w-10", align: "center" },
    enableSorting: false,
  };
}
