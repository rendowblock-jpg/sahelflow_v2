import Link from "next/link";
import { AlertTriangle, Calendar, MapPin, Phone, Sparkles } from "lucide-react";

import { BlacklistToggle } from "@/components/customers/blacklist-toggle";
import { OfflineWriteGate } from "@/components/orders/offline-write-gate";
import { OrderWhatsAppButton } from "@/components/orders/order-whatsapp-button";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface CustomerDetailHeaderProps {
  /** Name, or the "restricted contact" label when the seller may not read it. */
  label: string;
  /** Raw name: the WhatsApp message greets by it; null when restricted. */
  name: string | null;
  phone: string | null;
  phone2: string | null;
  /** "Alger · Bab Ezzouar", already formatted by the page. */
  placeLabel: string | null;
  /** "Customer since 12 Jan 2026", already formatted by the page. */
  sinceLabel: string;
  askAi: { href: string; label: string } | null;
  risk: { variant: "secondary" | "outline" | "destructive"; label: string; score: number } | null;
  /** Present only for sellers who may manage risk. */
  blacklist: { customerId: string; isBlacklisted: boolean } | null;
}

/**
 * The header of customers/[id]. Presentational so it can be mounted in a test. The WhatsApp deep link is not a
 * write (it opens the seller's own app), so it stays on offline; blocking and unblocking are writes and go behind
 * the offline gate. The kit Button already carries the touch-target minimum (--sf-touch-target).
 */
export function CustomerDetailHeader({
  label,
  name,
  phone,
  phone2,
  placeLabel,
  sinceLabel,
  askAi,
  risk,
  blacklist,
}: CustomerDetailHeaderProps) {
  return (
    <PageHeader
      title={label}
      description={
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {phone ? (
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden="true" />
              <span className="font-mono" dir="ltr">{phone}</span>
            </span>
          ) : null}
          {phone2 ? (
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden="true" />
              <span className="font-mono" dir="ltr">{phone2}</span>
            </span>
          ) : null}
          {placeLabel ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden="true" />
              {placeLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <Calendar className="size-3.5" aria-hidden="true" />
            {sinceLabel}
          </span>
        </span>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2" data-testid="customer-header-actions">
          {askAi ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={askAi.href} data-testid="customer-header-ask-ai">
                <Sparkles className="me-1.5 size-4" aria-hidden="true" />
                {askAi.label}
              </Link>
            </Button>
          ) : null}
          {/* Generic WhatsApp deep link (no order context). */}
          <OrderWhatsAppButton
            phone={phone}
            customerName={name}
            testId="customer-header-whatsapp"
          />
          {risk ? (
            <Badge variant={risk.variant}>
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              {risk.label} · {risk.score}
            </Badge>
          ) : null}
          {blacklist ? (
            <OfflineWriteGate>
              <BlacklistToggle customerId={blacklist.customerId} isBlacklisted={blacklist.isBlacklisted} variant="button" />
            </OfflineWriteGate>
          ) : null}
        </div>
      }
    />
  );
}
