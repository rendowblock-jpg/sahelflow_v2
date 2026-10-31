import { cn } from "@/lib/utils";

export interface StockEventCardRow {
  id: string;
  date: string;
  /** Signed change in units; null when the source did not record one. */
  delta: number | null;
  toStock?: number | null;
  sourceLabel: string;
  reason?: string | null;
  actorLabel: string;
}

interface ProductStockEventCardsProps {
  rows: ReadonlyArray<StockEventCardRow>;
  labels: { list: string; newStock: string; by: string };
}

/** "+12", "-3", "0"; "—" when no change was recorded. */
export function formatStockDelta(delta: number | null): string {
  if (delta === null) return "—";
  return delta > 0 ? `+${delta}` : String(delta);
}

/**
 * The stock audit trail as cards for a phone (the six-column table stays for md and up). The page passes its own
 * translated labels, so this stays server-safe.
 */
export function ProductStockEventCards({ rows, labels }: ProductStockEventCardsProps) {
  return (
    <ul className="space-y-2 md:hidden" aria-label={labels.list}>
      {rows.map((row) => (
        <li key={row.id} className="rounded-surface border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{row.date}</span>
            <span
              dir="ltr"
              className={cn(
                "font-medium tabular-nums",
                row.delta !== null && row.delta > 0 && "text-success",
                row.delta !== null && row.delta < 0 && "text-destructive",
              )}
            >
              {formatStockDelta(row.delta)}
            </span>
          </div>
          <p className="mt-1 text-sm">
            {row.sourceLabel} · {labels.newStock} <span className="tabular-nums">{row.toStock ?? "—"}</span>
          </p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{row.reason ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {labels.by}: {row.actorLabel}
          </p>
        </li>
      ))}
    </ul>
  );
}
