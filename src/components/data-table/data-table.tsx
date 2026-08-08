"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table,
} from "@tanstack/react-table";
import { useQueryStates } from "nuqs";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

type Density = "compact" | "comfortable";
const DENSITY_STORAGE_KEY = "sf-density";
const DENSITY_CLASSES: Record<Density, { cell: string; head: string }> = {
  compact: { cell: "px-3 py-1.5", head: "px-3 py-2" },
  comfortable: { cell: "px-4 py-3", head: "px-4 py-3" },
};

function useDensity(): [Density, (density: Density) => void] {
  const [density, setDensityState] = React.useState<Density>(() => {
    if (typeof window === "undefined") return "comfortable";
    try {
      const stored = localStorage.getItem(DENSITY_STORAGE_KEY) as Density | null;
      if (stored === "compact" || stored === "comfortable") return stored;
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
    return "comfortable";
  });

  const setDensity = React.useCallback((next: Density) => {
    setDensityState(next);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // Density remains a session preference when persistence is unavailable.
    }
  }, []);

  return [density, setDensity];
}

const sortParser = {
  parse: (value: string | null) => value ?? "",
  serialize: (value: string) => value || "",
};
const pageParser = {
  parse: (value: string | null) =>
    value ? Math.max(1, Number.parseInt(value, 10) || 1) : 1,
  serialize: (value: number) => String(value),
};

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total?: number;
  hasNextPage?: boolean;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  /**
   * When true, URL sort changes are part of the server query contract and the
   * table must not locally reorder one page as though it sorted the dataset.
   */
  serverSort?: boolean;
  /** Authoritative normalized server sort, for example `createdAt.desc`. */
  sort?: string;
}

export interface BulkAction {
  label: string;
  onClick: (selectedIds: string[]) => void;
  variant?: "default" | "destructive";
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    hideOn?: "sm" | "md" | "lg";
    align?: "start" | "center" | "end";
    width?: string;
  }
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  isLoading?: boolean;
  pagination?: DataTablePagination;
  onRowClick?: (row: TData) => void;
  bulkActions?: BulkAction[];
  emptyState?: React.ReactNode;
  getRowId?: (row: TData) => string;
  showDensityToggle?: boolean;
  skeletonRows?: number;
  className?: string;
}

/**
 * SahelFlow operational table.
 *
 * This remains a semantic HTML table rather than pretending every list is an
 * ARIA grid. Sortable headers contain real buttons. A paginated table exposes
 * sort only when its backend declares a matching server contract; otherwise it
 * avoids the false impression that reordering one page sorted the complete set.
 * Row navigation remains a pointer convenience only; keyboard navigation belongs
 * to real labelled links rendered inside the row rather than focusable <tr>s.
 */
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
  const { t } = useI18n();
  const [density, setDensity] = useDensity();
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [sortUrl, setSortUrl] = useQueryStates(
    { sort: sortParser, page: pageParser },
    { shallow: true },
  );
  const effectiveSort = pagination?.serverSort
    ? (pagination.sort ?? sortUrl.sort)
    : sortUrl.sort;

  const sorting = React.useMemo<SortingState>(() => {
    if (!effectiveSort) return [];
    const [id, direction] = effectiveSort.split(".");
    if (!id) return [];
    return [{ id, desc: direction === "desc" }];
  }, [effectiveSort]);

  const sortingEnabled = pagination ? Boolean(pagination.serverSort) : true;
  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection },
    enableRowSelection: true,
    enableSorting: sortingEnabled,
    enableSortingRemoval: !pagination?.serverSort,
    onRowSelectionChange: setRowSelection,
    onSortingChange: (updater) => {
      if (!sortingEnabled) return;
      const next = typeof updater === "function" ? updater(sorting) : updater;
      const first = next[0];
      const nextSort = first
        ? `${first.id}.${first.desc ? "desc" : "asc"}`
        : (pagination?.sort ?? "");
      setRowSelection({});
      void setSortUrl({ sort: nextSort, page: 1 });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    manualPagination: Boolean(pagination),
    manualSorting: Boolean(pagination?.serverSort),
  });

  const visibleIds = React.useMemo(
    () => new Set(data.map((row) => getRowId(row))),
    [data, getRowId],
  );
  const selectedIds = React.useMemo(
    () =>
      Object.keys(rowSelection).filter(
        (key) => rowSelection[key] && visibleIds.has(key),
      ),
    [rowSelection, visibleIds],
  );
  const dens = DENSITY_CLASSES[density];
  const currentPage = pagination?.page ?? 1;
  const totalPages =
    pagination?.total != null
      ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
      : undefined;
  const hasNext =
    pagination?.hasNextPage ??
    (totalPages !== undefined ? currentPage < totalPages : false);
  const hasPrev = currentPage > 1;

  const changePage = React.useCallback(
    (page: number) => {
      if (!pagination) return;
      setRowSelection({});
      pagination.onPageChange(page);
    },
    [pagination],
  );

  const paginationLabel = pagination
    ? t("dataTable.pageOf", {
        current: currentPage,
        total: totalPages ?? currentPage,
        count: pagination.total ?? data.length,
      })
    : undefined;

  return (
    <div className={cn("space-y-3", className)} data-table-density={density}>
      {bulkActions && selectedIds.length > 0 ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/35 px-3 py-2"
          data-testid="data-table-bulk-bar"
          role="toolbar"
          aria-label={t("dataTable.selected", { count: selectedIds.length })}
        >
          <span className="text-sm font-medium">
            {t("dataTable.selected", { count: selectedIds.length })}
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
                {action.icon ? (
                  <action.icon className="me-2 size-3.5" aria-hidden="true" />
                ) : null}
                {action.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRowSelection({})}
            >
              {t("dataTable.clear")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border bg-background">
        <div className="relative overflow-x-auto">
          <table className="w-full" aria-busy={isLoading}>
            <thead className="sticky top-0 z-10 border-b bg-muted/80 backdrop-blur-sm">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="text-start">
                  {headerGroup.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const hideClass =
                      meta?.hideOn === "sm"
                        ? "hidden sm:table-cell"
                        : meta?.hideOn === "md"
                          ? "hidden md:table-cell"
                          : meta?.hideOn === "lg"
                            ? "hidden lg:table-cell"
                            : "";
                    const alignClass =
                      meta?.align === "end"
                        ? "text-end"
                        : meta?.align === "center"
                          ? "text-center"
                          : "text-start";
                    const canSort = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();
                    const content = header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        );

                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn(
                          "whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground",
                          dens.head,
                          alignClass,
                          hideClass,
                          meta?.width,
                        )}
                        aria-sort={
                          canSort
                            ? sortDirection === "asc"
                              ? "ascending"
                              : sortDirection === "desc"
                                ? "descending"
                                : "none"
                            : undefined
                        }
                      >
                        {canSort ? (
                          <button
                            type="button"
                            className={cn(
                              "inline-flex min-h-7 max-w-full items-center rounded px-1 text-inherit outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                              meta?.align === "end" && "ms-auto",
                              meta?.align === "center" && "mx-auto",
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {content}
                          </button>
                        ) : (
                          content
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`}>
                    {columns.map((_, columnIndex) => (
                      <td key={columnIndex} className={dens.cell}>
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="h-32 text-center">
                    {emptyState ?? (
                      <span className="text-sm text-muted-foreground">
                        {t("dataTable.noData")}
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "transition-colors hover:bg-muted/40",
                      onRowClick && "cursor-pointer",
                      row.getIsSelected() && "bg-primary/5",
                    )}
                    onClick={
                      onRowClick
                        ? (event) => {
                            const target = event.target as HTMLElement;
                            if (
                              target.closest("button") ||
                              target.closest("a") ||
                              target.closest("input") ||
                              target.closest("select") ||
                              target.closest('[role="checkbox"]') ||
                              target.closest("[data-no-row-click]")
                            ) {
                              return;
                            }
                            onRowClick(row.original);
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      const hideClass =
                        meta?.hideOn === "sm"
                          ? "hidden sm:table-cell"
                          : meta?.hideOn === "md"
                            ? "hidden md:table-cell"
                            : meta?.hideOn === "lg"
                              ? "hidden lg:table-cell"
                              : "";
                      const alignClass =
                        meta?.align === "end"
                          ? "text-end"
                          : meta?.align === "center"
                            ? "text-center"
                            : "text-start";
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "whitespace-nowrap text-sm align-middle",
                            dens.cell,
                            alignClass,
                            hideClass,
                            meta?.width,
                          )}
                          onClick={(event) => {
                            if (cell.column.id === "select") {
                              event.stopPropagation();
                            }
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        {showDensityToggle ? (
          <div
            className="flex items-center gap-1 rounded-md border p-0.5"
            role="group"
            aria-label={t("dataTable.density")}
          >
            {(["comfortable", "compact"] as Density[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDensity(option)}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  density === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={density === option}
              >
                {option === "comfortable"
                  ? t("dataTable.normal")
                  : t("dataTable.compact")}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}

        {pagination ? (
          <nav
            className="flex items-center gap-2"
            aria-label={paginationLabel}
          >
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {pagination.total != null ? paginationLabel : `${currentPage}`}
            </span>
            <div className="flex items-center gap-1">
              {totalPages !== undefined ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={!hasPrev || pagination.isLoading}
                  onClick={() => changePage(1)}
                  aria-label={t("dataTable.firstPage")}
                >
                  <ChevronsLeft
                    className="size-4 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </Button>
              ) : null}
              <Button
                size="icon-sm"
                variant="outline"
                disabled={!hasPrev || pagination.isLoading}
                onClick={() => changePage(currentPage - 1)}
                aria-label={t("dataTable.prevPage")}
              >
                <ChevronLeft
                  className="size-4 rtl:rotate-180"
                  aria-hidden="true"
                />
              </Button>
              <Button
                size="icon-sm"
                variant="outline"
                disabled={!hasNext || pagination.isLoading}
                onClick={() => changePage(currentPage + 1)}
                aria-label={t("dataTable.nextPage")}
              >
                {pagination.isLoading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ChevronRight
                    className="size-4 rtl:rotate-180"
                    aria-hidden="true"
                  />
                )}
              </Button>
              {totalPages !== undefined ? (
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={!hasNext || pagination.isLoading}
                  onClick={() => changePage(totalPages)}
                  aria-label={t("dataTable.lastPage")}
                >
                  <ChevronsRight
                    className="size-4 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </Button>
              ) : null}
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function SelectAllHeader<T>({ table }: { table: Table<T> }) {
  const { t } = useI18n();
  return (
    <Checkbox
      checked={
        table.getIsAllPageRowsSelected()
          ? true
          : table.getIsSomePageRowsSelected()
            ? "indeterminate"
            : false
      }
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
      aria-label={t("dataTable.selectAll")}
    />
  );
}

function SelectRowCell<T>({ row }: { row: Row<T> }) {
  const { t } = useI18n();
  return (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
      aria-label={t("dataTable.selectRow")}
    />
  );
}

export function selectColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: "select",
    header: ({ table }) => <SelectAllHeader table={table} />,
    cell: ({ row }) => <SelectRowCell row={row} />,
    meta: { width: "w-10", align: "center" },
    enableSorting: false,
  };
}
