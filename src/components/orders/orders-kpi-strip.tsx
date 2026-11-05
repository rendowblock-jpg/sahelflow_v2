import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Orders page KPIs as ONE quiet strip (item 1, 5 Nov 2026).
 *
 * Before: four stat cards of the same size, the first one tinted green as "selected", and the pending count written in
 * a card, in a tab chip and in the header button. Now: one card with a few figures separated by thin dividers. The
 * strip is passive on purpose: the status tabs below carry the selection, and the accent colour stays for the main
 * action. Each figure is still a link to where it comes from.
 */
export function OrdersKpiStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      aria-label={label}
      data-orders-kpi-strip
      className="grid min-w-0 grid-cols-3 divide-x divide-border/70 overflow-hidden rounded-surface border border-border bg-card text-card-foreground shadow-layer rtl:divide-x-reverse"
    >
      {children}
    </section>
  );
}

export function OrdersKpiItem({
  label,
  value,
  href,
}: {
  label: ReactNode;
  value: ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      data-orders-kpi-item
      className="flex min-w-0 flex-col gap-1 px-3 py-2.5 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset md:px-5 md:py-3.5"
    >
      <span data-orders-kpi-label className="line-clamp-2 text-xs font-medium text-muted-foreground md:text-sm">
        {label}
      </span>
      <span
        data-orders-kpi-figure
        className="mt-auto break-words text-base font-semibold leading-tight tracking-tight text-foreground tabular-nums md:text-2xl"
      >
        {value}
      </span>
    </Link>
  );
}
