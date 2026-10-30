"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { normalizeCourierTracking } from "@/lib/delivery/delivery-reconcile";
import { toast } from "@/lib/toast";

interface DeliveryReconcileActionsProps {
  deliveryId: string;
  orderId: string | null;
  /** Orders on the newer courier flow are decided on the order page. */
  canonical?: boolean;
}

interface ReconcileReply {
  ok?: boolean;
  noop?: boolean;
  code?: string;
  orderId?: string;
  provider?: string;
  delivery?: { id?: string };
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: ReconcileReply }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as ReconcileReply;
  return { ok: response.ok, data };
}

/**
 * The seller's two ways out of a booking that timed out: record the tracking
 * number read in the courier's own app, or book again after an explicit
 * warning that a second parcel and a second fee are possible.
 */
export function DeliveryReconcileActions({
  deliveryId,
  orderId,
  canonical = false,
}: DeliveryReconcileActionsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const ids = useId();
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [canonicalBlocked, setCanonicalBlocked] = useState(false);

  const orderHref = orderId ? `/orders/${orderId}` : null;
  const showCanonical = canonical || canonicalBlocked;

  if (showCanonical) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("deliveries.reconcile.canonicalHint")}</p>
        {orderHref ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={orderHref}>{t("deliveries.reconcile.openOrder")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  function fail(data: ReconcileReply) {
    if (data.code === "CANONICAL_FOLLOWUP_REQUIRED") {
      setCanonicalBlocked(true);
      return;
    }
    setError(t("deliveries.reconcile.failed"));
  }

  async function saveTracking() {
    const normalized = normalizeCourierTracking(tracking);
    if (normalized === null) {
      setError(t("deliveries.reconcile.trackingInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { ok, data } = await postJson(`/api/delivery/${deliveryId}/reconcile`, {
        action: "courier-has-it",
        tracking: normalized,
      });
      if (!ok) {
        fail(data);
        return;
      }
      toast.success(
        t(data.noop ? "deliveries.reconcile.alreadySaved" : "deliveries.reconcile.savedOk"),
      );
      router.refresh();
    } catch {
      setError(t("deliveries.reconcile.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function bookAgain() {
    setBusy(true);
    setError(null);
    try {
      const released = await postJson(`/api/delivery/${deliveryId}/reconcile`, {
        action: "book-again",
        confirmedDuplicateRisk: true,
      });
      if (!released.ok) {
        setConfirmOpen(false);
        fail(released.data);
        return;
      }
      // The old empty reservation is gone; make the fresh attempt through the
      // same route every other booking uses.
      const targetOrder = released.data.orderId ?? orderId;
      const booked = await postJson("/api/delivery/create", {
        orderId: targetOrder,
        provider: released.data.provider,
      });
      setConfirmOpen(false);
      if (booked.ok && booked.data.ok) {
        toast.success(t("deliveries.reconcile.bookedOk"));
        router.push(booked.data.delivery?.id ? `/deliveries/${booked.data.delivery.id}` : "/deliveries");
        return;
      }
      toast.error(t("deliveries.reconcile.releasedOnly"));
      router.push(targetOrder ? `/orders/${targetOrder}` : "/deliveries");
    } catch {
      setConfirmOpen(false);
      setError(t("deliveries.reconcile.failed"));
    } finally {
      setBusy(false);
    }
  }

  const inputId = `${ids}-tracking`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;

  return (
    <div className="space-y-5">
      <section className="space-y-2" aria-labelledby={`${ids}-has-it`}>
        <h3 id={`${ids}-has-it`} className="text-sm font-semibold">
          {t("deliveries.reconcile.courierHasIt")}
        </h3>
        <Label htmlFor={inputId}>{t("deliveries.reconcile.trackingLabel")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={inputId}
            dir="ltr"
            value={tracking}
            onChange={(event) => {
              setTracking(event.target.value);
              setError(null);
            }}
            autoComplete="off"
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            aria-invalid={error ? true : undefined}
            disabled={busy}
            className="sm:max-w-xs"
          />
          <Button
            type="button"
            onClick={() => void saveTracking()}
            disabled={busy || tracking.trim() === ""}
          >
            {t("deliveries.reconcile.saveTracking")}
          </Button>
        </div>
        <p id={hintId} className="text-xs text-muted-foreground">
          {t("deliveries.reconcile.trackingHint")}
        </p>
      </section>

      <section>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
        >
          {t("deliveries.reconcile.bookAgain")}
        </Button>
      </section>

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !busy && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deliveries.reconcile.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deliveries.reconcile.confirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("deliveries.reconcile.cancel")}</AlertDialogCancel>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void bookAgain()}>
              {t("deliveries.reconcile.confirmAction")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
