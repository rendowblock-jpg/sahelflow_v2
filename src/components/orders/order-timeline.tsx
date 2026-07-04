"use client";

/**
 * OrderTimeline — the order detail timeline (Phase 4).
 *
 * Shows the full OrderChange ledger as a vertical timeline: who changed
 * what, when, the action type, and the payload (e.g. status from→to).
 *
 * Fetches from /api/orders/[id]/timeline (RSC fallback or SWR).
 */
import { formatDate } from "@/lib/utils";
import {
  Package, Truck, CheckCircle2, XCircle, RotateCcw, DollarSign,
  Edit3, Plus, Minus, Hash, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

interface TimelineEntry {
  id: string;
  actionType: string;
  actor: string;
  payload: string | null;
  status: string;
  createdAt: string;
}

interface OrderTimelineProps {
  entries: TimelineEntry[];
}

const ACTION_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  status_change: { icon: Clock, color: "text-blue-500" },
  item_add: { icon: Plus, color: "text-emerald-500" },
  item_remove: { icon: Minus, color: "text-amber-500" },
  fulfill: { icon: Package, color: "text-purple-500" },
  ship: { icon: Truck, color: "text-indigo-500" },
  deliver: { icon: CheckCircle2, color: "text-emerald-500" },
  return: { icon: RotateCcw, color: "text-amber-500" },
  refund: { icon: DollarSign, color: "text-red-500" },
  cod_collected: { icon: DollarSign, color: "text-emerald-500" },
  cod_remitted: { icon: CheckCircle2, color: "text-emerald-600" },
  edit: { icon: Edit3, color: "text-muted-foreground" },
  cancel: { icon: XCircle, color: "text-red-500" },
};

const DEFAULT_CONFIG = { icon: Hash, color: "text-muted-foreground" };

function formatActionLabel(
  actionType: string,
  payload: string | null,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  try {
    const p = payload ? JSON.parse(payload) : {};
    switch (actionType) {
      case "status_change":
        return t("orders.timeline.status_change", { from: p.from ?? "?", to: p.to ?? "?" });
      case "item_add":
        return t("orders.timeline.item_add", { productName: p.productName ?? "unknown" });
      case "item_remove":
        return t("orders.timeline.item_remove", { productName: p.productName ?? "unknown" });
      case "fulfill":
        return t("orders.timeline.fulfill");
      case "ship":
        return t("orders.timeline.ship");
      case "deliver":
        return t("orders.timeline.deliver");
      case "return":
        return t("orders.timeline.return");
      case "refund":
        return t("orders.timeline.refund", { amount: p.amount ?? 0, method: p.method ?? "cash" });
      case "cod_collected":
        return t("orders.timeline.cod_collected", { amount: p.amount ?? 0 });
      case "cod_remitted":
        return t("orders.timeline.cod_remitted", { remittanceRef: p.remittanceRef ?? "—" });
      case "edit":
        return t("orders.timeline.edit");
      case "cancel":
        return t("orders.timeline.cancel");
      default:
        return actionType.replace(/_/g, " ");
    }
  } catch {
    return actionType.replace(/_/g, " ");
  }
}

export function OrderTimeline({ entries }: OrderTimelineProps) {
  const { t, locale } = useI18n();

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => {
        const config = ACTION_CONFIG[entry.actionType] ?? DEFAULT_CONFIG;
        const Icon = config.icon;
        const isLast = i === entries.length - 1;

        return (
          <div key={entry.id} className="flex gap-3">
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div className={cn("flex size-7 items-center justify-center rounded-full border bg-background", config.color)}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>

            {/* Content */}
            <div className={cn("flex-1 pb-4", isLast && "pb-0")}>
              <p className="text-sm font-medium">{formatActionLabel(entry.actionType, entry.payload, t)}</p>
              <p className="text-xs text-muted-foreground">
                {entry.actor} · {formatDate(entry.createdAt, locale)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
