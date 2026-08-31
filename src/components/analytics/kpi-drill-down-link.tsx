import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

/**
 * KPI drill-down control (R4-d). Rendered through StatCard's `action` slot so
 * the card itself stays a non-interactive section (no nested links) while the
 * metric becomes clickable into the filtered orders list — the anti-vanity
 * device: every tile clicks through to the records behind it.
 */
export function KpiDrillDownLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/45 text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
    </Link>
  );
}
