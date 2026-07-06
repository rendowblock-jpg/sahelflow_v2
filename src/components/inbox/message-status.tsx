"use client";

/**
 * MessageStatus — WhatsApp-style delivery receipts (Phase 5 — Chatwoot pattern).
 *
 * Shows the delivery state of an outgoing message:
 *   sending:  clock (spinning)
 *   sent:     single gray check
 *   delivered: double gray check
 *   read:     double blue check
 *   failed:   red alert
 */
import { Clock, Check, CheckCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";

type DeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";

interface MessageStatusProps {
  status?: string;
  className?: string;
}

export function MessageStatus({ status, className }: MessageStatusProps) {
  const { t } = useI18n();
  if (!status || status === "sent") {
    return <Check className={cn("h-3.5 w-3.5 text-muted-foreground", className)} aria-label={t("inbox.messageStatus.sent")} />;
  }

  switch (status as DeliveryStatus) {
    case "sending":
      return <Clock className={cn("h-3.5 w-3.5 text-muted-foreground animate-spin", className)} aria-label={t("inbox.messageStatus.sending")} />;
    case "delivered":
      return <CheckCheck className={cn("h-3.5 w-3.5 text-muted-foreground", className)} aria-label={t("inbox.messageStatus.delivered")} />;
    case "read":
      return <CheckCheck className={cn("h-3.5 w-3.5 text-blue-500", className)} aria-label={t("inbox.messageStatus.read")} />;
    case "failed":
      return <AlertCircle className={cn("h-3.5 w-3.5 text-destructive", className)} aria-label={t("inbox.messageStatus.failed")} />;
    default:
      return null;
  }
}
