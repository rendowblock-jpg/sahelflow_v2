/**
 * PremiumTable — shared wrapper that gives any table the orders-table treatment.
 *
 * NOTE: This component is intentionally NOT a Client Component ("use client").
 * It is purely presentational (no hooks, no event handlers, no client-only APIs).
 * Keeping it as a shared/Server-compatible component is REQUIRED for the compound
 * component pattern (PremiumTable.Header, .Body, .Row, .Head, .Cell, .EmptyRow)
 * to work when imported by Server Components (customers/products/returns/etc pages).
 *
 * Static property assignments (PremiumTable.Header = Header) do NOT survive the
 * React Server Component boundary — they become `undefined` on the client
 * reference proxy. Removing "use client" makes this a universal component that
 * works in both RSC and Client Component contexts.
 *
 * Pattern (from orders-table-client, rebuilt in PR #45):
 * - Rounded border wrapper (overflow-hidden rounded-lg border)
 * - Sticky header with bg-muted/50
 * - Uppercase tracking-wider text-xs header text
 * - hover:bg-muted/50 rows with divide-y
 * - px-4 py-3 cell padding (more generous than the default p-2)
 * - Proper empty row (h-24 text-center)
 *
 * Usage:
 *   <PremiumTable>
 *     <PremiumTable.Header>
 *       <PremiumTable.Row>
 *         <PremiumTable.Head>name</PremiumTable.Head>
 *         <PremiumTable.Head align="end">total</PremiumTable.Head>
 *       </PremiumTable.Row>
 *     </PremiumTable.Header>
 *     <PremiumTable.Body>
 *       <PremiumTable.Row>
 *         <PremiumTable.Cell>ahmed</PremiumTable.Cell>
 *         <PremiumTable.Cell align="end">1500</PremiumTable.Cell>
 *       </PremiumTable.Row>
 *     </PremiumTable.Body>
 *   </PremiumTable>
 *
 * Alignment rules (the standard):
 *   - Text columns: default (start in LTR, end in RTL — automatic via logical props)
 *   - Numeric/currency columns: align="end"
 *   - Action columns (buttons): align="end" + width="w-12" or similar
 *   - Status columns: align="center" (badge looks best centered)
 *
 * RTL: All alignment uses logical properties (text-start, text-end) so it
 * flips automatically in Arabic mode.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

interface PremiumTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional max-height for scrollable tables with many rows */
  maxHeight?: string;
}

export function PremiumTable({ children, className, maxHeight, ...props }: PremiumTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-card shadow-xs",
        className,
      )}
      {...props}
    >
      <div className="overflow-x-auto" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full">{children}</table>
      </div>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 border-b bg-muted">
      {children}
    </thead>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y">{children}</tbody>;
}

function Row({
  children,
  className,
  selected,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { selected?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors hover:bg-muted/50",
        selected && "bg-primary/5",
        className,
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

interface CellProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "align"> {
  /** Alignment — defaults to "start" (logical: respects RTL) */
  align?: "start" | "center" | "end";
  /** Hide on small screens — responsive column hiding */
  hideOn?: "sm" | "md" | "lg";
  /** Optional width utility class (e.g., "w-12", "w-32") */
  width?: string;
}

function Head({ children, align = "start", hideOn, width, className, ...props }: CellProps) {
  const alignClass = align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start";
  const hideClass = hideOn === "sm" ? "hidden sm:table-cell"
    : hideOn === "md" ? "hidden md:table-cell"
    : hideOn === "lg" ? "hidden lg:table-cell"
    : "";
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap",
        alignClass,
        hideClass,
        width,
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

function Cell({ children, align = "start", hideOn, width, className, ...props }: CellProps) {
  const alignClass = align === "end" ? "text-end" : align === "center" ? "text-center" : "text-start";
  const hideClass = hideOn === "sm" ? "hidden sm:table-cell"
    : hideOn === "md" ? "hidden md:table-cell"
    : hideOn === "lg" ? "hidden lg:table-cell"
    : "";
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm align-middle whitespace-nowrap",
        alignClass,
        hideClass,
        width,
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-24 text-center text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

PremiumTable.Header = Header;
PremiumTable.Body = Body;
PremiumTable.Row = Row;
PremiumTable.Head = Head;
PremiumTable.Cell = Cell;
PremiumTable.EmptyRow = EmptyRow;
