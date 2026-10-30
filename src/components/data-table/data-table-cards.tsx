"use client";

import * as React from "react";
import { flexRender, type Cell, type Row, type Table } from "@tanstack/react-table";

import { TechnicalValue } from "@/components/i18n/technical-value";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

import { reactNodeText, type CardPlan } from "./card-layout";

/** A tap on any of these belongs to the control, not to the card (same rule as a table row). */
const OWN_CONTROL = 'button, a, input, select, [role="checkbox"], [data-no-row-click]';

function plainText<TData>(cell: Cell<TData, unknown>): string | undefined {
  const value = cell.getValue();
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function renderCell<TData>(cell: Cell<TData, unknown>) {
  return flexRender(cell.column.columnDef.cell, cell.getContext());
}

interface DataTableCardsProps<TData> {
  table: Table<TData>;
  plan: CardPlan;
  isLoading: boolean;
  skeletonRows: number;
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  label?: string;
  /** The select-all control (owned by the table, shared with the desktop header). Null when there is no select column. */
  selectAll: React.ReactNode;
}

/**
 * The phone layout of the shared table: one card per row, in a named list. A card has no column headers, so list
 * semantics and a definition list for the secondary fields are the honest structure (a table row would lose its
 * headers). The title link is stretched over the whole card, so the card is one target and the focus ring is drawn on
 * the card; every real control (checkbox, status chip, row menu) sits above that link.
 */
export function DataTableCards<TData>({
  table,
  plan,
  isLoading,
  skeletonRows,
  emptyState,
  onRowClick,
  label,
  selectAll,
}: DataTableCardsProps<TData>) {
  const { t } = useI18n();
  const rows = table.getRowModel().rows;

  const labels = new Map<string, string>();
  for (const header of table.getFlatHeaders()) {
    const id = header.column.id;
    // The header is called, not rendered: reactNodeText reads strings and plain elements, and a rendered component
    // would be an opaque element to it.
    const template = header.column.columnDef.header;
    const text = reactNodeText(typeof template === "function" ? template(header.getContext()) : template);
    labels.set(id, plan.labels[id] ?? (text || id));
  }

  if (!isLoading && rows.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-control border bg-background p-4 text-center">
        {emptyState ?? <span className="text-sm text-muted-foreground">{t("dataTable.noData")}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {!isLoading ? <CardsToolbar table={table} labels={labels} selectAll={selectAll} /> : null}
      <ul
        role="list"
        data-testid="data-table-cards"
        aria-label={label ?? t("dataTable.cards.list")}
        aria-busy={isLoading}
        className="space-y-2"
      >
        {isLoading
          ? Array.from({ length: skeletonRows }).map((_, index) => (
              <li key={`skeleton-${index}`} aria-hidden="true" className="rounded-control border bg-card p-3">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="mt-2 h-3 w-3/5" />
                <Skeleton className="mt-4 h-8 w-full" />
              </li>
            ))
          : rows.map((row) => <DataCard key={row.id} row={row} plan={plan} labels={labels} onRowClick={onRowClick} />)}
      </ul>
    </div>
  );
}

function CardsToolbar<TData>({
  table,
  labels,
  selectAll,
}: {
  table: Table<TData>;
  labels: Map<string, string>;
  selectAll: React.ReactNode;
}) {
  const { t } = useI18n();
  const selectId = React.useId();
  const sortable = table.getAllLeafColumns().filter((column) => column.getCanSort());
  if (!selectAll && sortable.length === 0) return null;

  const current = table.getState().sorting[0];
  const value = current ? `${current.id}.${current.desc ? "desc" : "asc"}` : "";

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      {selectAll ? (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          {selectAll}
          <span>{t("dataTable.selectAll")}</span>
        </label>
      ) : null}
      {sortable.length > 0 ? (
        <div className="ms-auto flex min-w-0 items-center gap-2">
          <label htmlFor={selectId} className="shrink-0 text-xs text-muted-foreground">
            {t("dataTable.sort.by")}
          </label>
          <select
            id={selectId}
            value={value}
            onChange={(event) => {
              const next = event.target.value;
              if (!next) {
                table.setSorting([]);
                return;
              }
              const dot = next.lastIndexOf(".");
              table.setSorting([{ id: next.slice(0, dot), desc: next.slice(dot + 1) === "desc" }]);
            }}
            className="h-11 min-h-11 min-w-0 max-w-full rounded-control border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">{t("dataTable.sort.default")}</option>
            {sortable.flatMap((column) => {
              const name = labels.get(column.id) ?? column.id;
              return [
                <option key={`${column.id}.asc`} value={`${column.id}.asc`}>
                  {t("dataTable.sort.asc", { label: name })}
                </option>,
                <option key={`${column.id}.desc`} value={`${column.id}.desc`}>
                  {t("dataTable.sort.desc", { label: name })}
                </option>,
              ];
            })}
          </select>
        </div>
      ) : null}
    </div>
  );
}

function DataCard<TData>({
  row,
  plan,
  labels,
  onRowClick,
}: {
  row: Row<TData>;
  plan: CardPlan;
  labels: Map<string, string>;
  onRowClick?: (row: TData) => void;
}) {
  const cells = new Map(row.getVisibleCells().map((cell) => [cell.column.id, cell] as const));
  const pick = (ids: string[]) => ids.flatMap((id) => (cells.has(id) ? [cells.get(id) as Cell<TData, unknown>] : []));
  const selected = row.getIsSelected();
  const selectCell = plan.select ? cells.get(plan.select) : undefined;
  const actionsCell = plan.actions ? cells.get(plan.actions) : undefined;
  const status = pick(plan.status);
  const fields = pick(plan.fields);
  const amount = pick(plan.amount);
  const time = pick(plan.time);

  return (
    <li
      data-testid="data-table-card"
      data-state={selected ? "selected" : undefined}
      className={cn(
        "relative rounded-control border bg-card p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        // The ring and the stronger border say "selected" with or without colour; the checkbox shows its check mark.
        selected ? "border-primary bg-primary-subtle ring-1 ring-primary" : "hover:bg-muted/40",
        onRowClick && "cursor-pointer",
      )}
      onClick={
        onRowClick
          ? (event) => {
              if ((event.target as HTMLElement).closest(OWN_CONTROL)) return;
              onRowClick(row.original);
            }
          : undefined
      }
    >
      <div className="flex items-start gap-1">
        {selectCell ? (
          <div
            data-slot="select"
            className="relative z-10 -ms-2 -mt-1 flex size-11 shrink-0 items-center justify-center [&_[role=checkbox]]:relative [&_[role=checkbox]]:after:absolute [&_[role=checkbox]]:after:-inset-2.5"
            onClick={(event) => event.stopPropagation()}
          >
            {renderCell(selectCell)}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          {pick(plan.title).map((cell) => (
            <div
              key={cell.id}
              data-slot="title"
              title={plainText(cell)}
              className="min-w-0 truncate text-sm font-medium [&>*]:truncate [&_a]:after:absolute [&_a]:after:inset-0"
            >
              {renderCell(cell)}
            </div>
          ))}
          {pick(plan.subtitle).map((cell) => (
            <div
              key={cell.id}
              data-slot="subtitle"
              title={plainText(cell)}
              className="min-w-0 truncate text-xs text-muted-foreground [&>*]:truncate"
            >
              {renderCell(cell)}
            </div>
          ))}
        </div>
        {actionsCell ? (
          <div
            data-slot="actions"
            data-no-row-click
            className="relative z-10 -me-2 -mt-1 shrink-0 [&_a]:min-h-11 [&_a]:min-w-11 [&_button]:min-h-11 [&_button]:min-w-11"
            onClick={(event) => event.stopPropagation()}
          >
            {renderCell(actionsCell)}
          </div>
        ) : null}
      </div>

      {status.length > 0 ? (
        <div
          data-slot="status"
          className="relative z-10 mt-2 flex w-fit max-w-full flex-wrap items-center gap-1.5 [&_button]:relative [&_button]:after:absolute [&_button]:after:-inset-y-2 [&_button]:after:inset-x-0"
        >
          {status.map((cell) => (
            <React.Fragment key={cell.id}>{renderCell(cell)}</React.Fragment>
          ))}
        </div>
      ) : null}

      {fields.length > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {fields.map((cell) => (
            <div key={cell.id} className="min-w-0">
              <dt className="truncate text-xs text-muted-foreground">{labels.get(cell.column.id)}</dt>
              <dd title={plainText(cell)} className="min-w-0 truncate text-sm [&>*]:truncate">
                {renderCell(cell)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {amount.length > 0 || time.length > 0 ? (
        <div className="mt-3 flex items-end justify-between gap-3 border-t pt-2">
          {amount.length > 0 ? (
            <div data-slot="amount" className="min-w-0 truncate text-base font-semibold tabular-nums">
              {amount.map((cell) => (
                <TechnicalValue key={cell.id} className="font-sans">
                  {renderCell(cell)}
                </TechnicalValue>
              ))}
            </div>
          ) : null}
          {time.length > 0 ? (
            <div data-slot="time" className="ms-auto shrink-0 text-xs text-muted-foreground">
              {time.map((cell) => (
                <bdi key={cell.id}>{renderCell(cell)}</bdi>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
