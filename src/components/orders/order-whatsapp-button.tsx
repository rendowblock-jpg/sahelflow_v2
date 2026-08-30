"use client";

/**
 * WhatsApp deep-link trigger (R3-b).
 *
 * One shared button for every seller→buyer WhatsApp touchpoint: order rows,
 * the confirmation queue, the order-detail customer summary and the customer
 * header. The prefilled message is composed from the trilingual runtime
 * templates (order-actions-runtime.ts) WITHOUT display-layer bidi
 * stabilization — invisible LRI/PDI marks must never leak into the wa.me
 * URL-encoded text. Renders nothing when the phone is unusable, so callers
 * can mount it unconditionally.
 */

import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import { buildOrderWhatsAppMessage } from "@/lib/i18n/order-actions-runtime";
import { formatDZD } from "@/lib/utils";
import { buildWhatsAppLink } from "@/lib/whatsapp/deep-link";

interface OrderWhatsAppButtonProps {
  /** Any app phone format; invalid numbers hide the button. */
  phone: string | null | undefined;
  customerName?: string | null;
  /** Present → confirmation template; absent → generic greeting template. */
  orderNumber?: string | null;
  /** Raw COD total; formatted with the active locale into the message. */
  total?: number | null;
  iconOnly?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
  label?: string;
  tooltip?: string;
  className?: string;
  testId?: string;
}

export function OrderWhatsAppButton({
  phone,
  customerName,
  orderNumber,
  total,
  iconOnly = false,
  variant = "outline",
  size = "sm",
  label,
  tooltip,
  className,
  testId,
}: OrderWhatsAppButtonProps) {
  const { t, locale } = useI18n();

  const message = phone
    ? buildOrderWhatsAppMessage(locale, {
        name: customerName ?? null,
        fallbackName: t("orders.customer"),
        orderNumber: orderNumber ?? null,
        totalLabel: total != null ? formatDZD(total, locale) : null,
      })
    : null;
  const href = phone && message ? buildWhatsAppLink(phone, message) : null;

  if (!href) return null;

  const tooltipLabel = tooltip ?? t("orders.whatsapp.confirm");
  const resolvedLabel = label ?? t("orders.whatsapp.action");

  const button = (
    <Button
      asChild
      variant={variant}
      size={iconOnly ? "icon-sm" : size}
      className={className}
      data-testid={testId}
    >
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle
          className={iconOnly ? "size-4" : "me-1.5 size-4"}
          aria-hidden="true"
        />
        {iconOnly ? (
          <span className="sr-only">{tooltipLabel}</span>
        ) : (
          resolvedLabel
        )}
      </a>
    </Button>
  );

  if (!iconOnly) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
}
