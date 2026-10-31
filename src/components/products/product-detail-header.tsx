import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { OfflineWriteGate } from "@/components/orders/offline-write-gate";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";

/**
 * The header of products/[id]. `actions` is the edit control (null for sellers who may not manage products); it is
 * a write, so it sits behind the offline gate. The low-stock badge is a reading and stays.
 */
export function ProductDetailHeader({
  name,
  description,
  lowStockLabel,
  actions,
}: {
  name: string;
  description: string;
  /** The low-stock badge text, or null when stock is fine. */
  lowStockLabel: string | null;
  actions: ReactNode | null;
}) {
  return (
    <PageHeader
      title={name}
      description={description}
      actions={
        lowStockLabel || actions ? (
          <div className="flex flex-wrap items-center gap-2">
            {lowStockLabel ? (
              <Badge variant="destructive">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {lowStockLabel}
              </Badge>
            ) : null}
            {actions ? <OfflineWriteGate>{actions}</OfflineWriteGate> : null}
          </div>
        ) : undefined
      }
    />
  );
}
