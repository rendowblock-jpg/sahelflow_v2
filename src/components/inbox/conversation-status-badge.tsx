"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Circle, Clock, CheckCircle2, BellOff } from "lucide-react";

const STATUS_CONFIG = {
  open: { icon: Circle, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  pending: { icon: Clock, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  resolved: { icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  snoozed: { icon: BellOff, className: "bg-muted text-muted-foreground border-border" },
} as const;

export function ConversationStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.open;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", config.className)}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}
