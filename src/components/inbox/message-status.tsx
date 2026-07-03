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

type DeliveryStatus = "sending" | "sent" | "delivered" | "read" | "failed";

interface MessageStatusProps {
  status?: string;
  className?: string;
}

export function MessageStatus({ status, className }: MessageStatusProps) {
  if (!status || status === "sent") {
    return <Check className={cn("h-3.5 w-3.5 text-muted-foreground", className)} aria-label="Sent" />;
  }

  switch (status as DeliveryStatus) {
    case "sending":
      return <Clock className={cn("h-3.5 w-3.5 text-muted-foreground animate-spin", className)} aria-label="Sending" />;
    case "delivered":
      return <CheckCheck className={cn("h-3.5 w-3.5 text-muted-foreground", className)} aria-label="Delivered" />;
    case "read":
      return <CheckCheck className={cn("h-3.5 w-3.5 text-blue-500", className)} aria-label="Read" />;
    case "failed":
      return <AlertCircle className={cn("h-3.5 w-3.5 text-destructive", className)} aria-label="Failed" />;
    default:
      return null;
  }
}
