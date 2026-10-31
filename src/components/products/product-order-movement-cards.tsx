import Link from "next/link";

export interface OrderMovementCardRow {
  id: string;
  date: string;
  kindLabel: string;
  quantity: number;
  orderId: string | null;
  orderNumber: string | null;
}

/**
 * Order stock movements as cards for a phone (the four-column table stays for md and up). The page passes its own
 * translated labels, so this stays server-safe. The order link is a 44 px target.
 */
export function ProductOrderMovementCards({
  rows,
  labels,
}: {
  rows: ReadonlyArray<OrderMovementCardRow>;
  labels: { list: string; quantity: string; order: string };
}) {
  return (
    <ul className="space-y-2 md:hidden" aria-label={labels.list}>
      {rows.map((row) => (
        <li key={row.id} className="rounded-surface border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">{row.date}</span>
            <span className="text-sm">
              {labels.quantity} <span className="font-medium tabular-nums">{row.quantity}</span>
            </span>
          </div>
          <p className="mt-1 text-sm">{row.kindLabel}</p>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{labels.order}</span>
            {row.orderId && row.orderNumber ? (
              <Link
                href={`/orders/${row.orderId}`}
                className="inline-flex min-h-11 items-center font-mono text-primary hover:underline"
              >
                {row.orderNumber}
              </Link>
            ) : (
              "—"
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
