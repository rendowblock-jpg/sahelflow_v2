"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Circle, Clock, CheckCircle2, BellOff } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

const STATUS_CONFIG = {
  open: { icon: Circle, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  pending: { icon: Clock, className: "bg-amber-500/10 text-warning border-amber-500/20" },
  resolved: { icon: CheckCircle2, className: "bg-emerald-500/10 text-success border-emerald-500/20" },
  snoozed: { icon: BellOff, className: "bg-muted text-muted-foreground border-border" },
} as const;

export function ConversationStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open;
  const Icon = config.icon;
  const labelKey = `inbox.convStatus.${status}`;
  const fallback = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <Badge variant="outline" className={cn("gap-1", config.className)}>
      <Icon className="h-3 w-3" />
      {t(labelKey) || fallback}
    </Badge>
  );
}
