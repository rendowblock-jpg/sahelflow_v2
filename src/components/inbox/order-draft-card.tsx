"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import {
  approvalGate,
  draftDomId,
  draftLedger,
  phoneState,
  type ThreadOrderDraft,
} from "@/components/inbox/inbox-order-draft-model";
import { SignalShape } from "@/components/inbox/inbox-signal-shape";
import styles from "@/components/inbox/inbox-v3-workspace.module.css";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { cn, formatDZD } from "@/lib/utils";

/**
 * The AI order as a pencilled slip: dashed while it is only a suggestion, solid and stamped once the
 * seller approved it. Presentation only: what Approve does is decided by the caller.
 */
export function OrderDraftCard({
  draft,
  busy,
  error,
  editor,
  onApprove,
  onEdit,
  onDismiss,
  onUndo,
}: {
  draft: ThreadOrderDraft;
  busy: boolean;
  error: string | null;
  /** The existing review form, shown under the actions while the seller edits. */
  editor: ReactNode;
  onApprove: () => void;
  onEdit: () => void;
  onDismiss: () => void;
  onUndo: () => void;
}) {
  const { t, locale } = useI18n();
  const id = draftDomId(draft.anchorMessageId);

  if (draft.status === "dismissed") {
    return (
      <section
        id={id}
        data-order-draft=""
        data-draft-state="dismissed"
        className="mx-auto my-3 flex w-full max-w-xl flex-wrap items-center gap-3 rounded-surface border border-dashed border-border px-3 py-2 text-body-sm text-muted-foreground"
      >
        <span>{t("inbox.thread.draft.dismissed")}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUndo}
          className="ms-auto min-h-11 [@media(pointer:fine)]:min-h-8"
        >
          {t("inbox.thread.draft.undo")}
        </Button>
      </section>
    );
  }

  const approved = draft.status === "approved";
  const ledger = draftLedger(draft);
  const gate = approvalGate(draft.order, draft.catalog, draft.knownPhone);
  const missing = gate.ok ? [] : gate.missing;
  const phone = draft.order.phone || draft.knownPhone || "";
  const phoneWarning = phoneState(phone);
  const money = (value: number) => formatDZD(value, locale);

  return (
    <section
      id={id}
      data-order-draft=""
      data-draft-state={draft.status}
      aria-label={t("inbox.thread.draft.title")}
      className={cn(
        "mx-auto my-3 flex w-full max-w-xl scroll-mt-16 flex-col gap-3 rounded-surface bg-card p-4",
        approved ? "border-2 border-solid border-foreground" : "border-2 border-dashed border-foreground/60",
        styles.draftSlip,
      )}
    >
      <header className="flex items-center gap-2">
        <h3 className="text-body font-semibold">{t("inbox.thread.draft.title")}</h3>
        {approved ? null : (
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-control border border-border px-2 py-0.5 text-caption">
            <SignalShape shape="diamond" />
            {t("inbox.thread.draft.chip")}
          </span>
        )}
      </header>

      <table className="w-full border-collapse text-body-sm">
        <thead>
          <tr className="border-b border-border text-caption text-muted-foreground">
            <th scope="col" className="py-1 text-start font-normal">{t("inbox.thread.draft.col.item")}</th>
            <th scope="col" className="py-1 text-end font-normal">{t("inbox.thread.draft.col.qty")}</th>
            <th scope="col" className="ps-3 py-1 text-end font-normal">{t("inbox.thread.draft.col.price")}</th>
            <th scope="col" className="ps-3 py-1 text-end font-normal">{t("inbox.thread.draft.col.amount")}</th>
          </tr>
        </thead>
        <tbody>
          {ledger.rows.map((row, index) => (
            <tr key={`${row.name}-${index}`}>
              <td className="py-1" dir="auto">{row.name}</td>
              <td className="numeric-value py-1 text-end">{row.quantity}</td>
              <td className="numeric-value ps-3 py-1 text-end">
                {row.unitPrice === null ? "-" : money(row.unitPrice)}
              </td>
              <td className="numeric-value ps-3 py-1 text-end">
                {row.amount === null ? (
                  <span className="font-sans text-caption text-muted-foreground">{t("inbox.thread.draft.unpriced")}</span>
                ) : (
                  money(row.amount)
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3} className="py-1 text-start font-normal text-muted-foreground">
              {t("inbox.thread.draft.subtotal")}
            </th>
            <td className="numeric-value py-1 text-end">{money(ledger.subtotal)}</td>
          </tr>
          <tr data-order-draft-delivery="">
            <th scope="row" colSpan={3} className="py-1 text-start font-normal text-muted-foreground">
              {t("inbox.thread.draft.delivery")}
              <span className="ms-2 text-caption">({t("inbox.thread.draft.deliveryDefault")})</span>
            </th>
            <td className="numeric-value py-1 text-end">{money(ledger.delivery)}</td>
          </tr>
          <tr>
            <th scope="row" colSpan={3} className="carnet-total border-t border-foreground pt-1.5 text-start font-semibold">
              {t("inbox.thread.draft.total")}
            </th>
            <td className="carnet-total numeric-value border-t border-foreground pt-1.5 text-end font-semibold">
              {money(ledger.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body-sm">
        <dt className="text-muted-foreground">{t("inbox.thread.draft.wilaya")}</dt>
        <dd dir="auto">{draft.order.wilaya || t("inbox.thread.draft.notFound")}</dd>
        <dt className="text-muted-foreground">{t("inbox.thread.draft.commune")}</dt>
        <dd dir="auto">{draft.order.commune || t("inbox.thread.draft.notFound")}</dd>
        <dt className="text-muted-foreground">{t("inbox.thread.draft.phone")}</dt>
        <dd dir="ltr" className="numeric-value text-start">{phone || t("inbox.thread.draft.notFound")}</dd>
      </dl>

      {approved ? (
        <div data-order-draft-done="" className="flex flex-wrap items-center gap-3">
          <span data-plain-badge="" className={cn("inline-flex size-7 items-center justify-center rounded-full bg-success text-success-foreground", styles.plainBadge)}>
            <Check className="size-4" aria-hidden="true" />
          </span>
          <span aria-hidden="true" className={cn("carnet-stamp", styles.stampOnly)}>
            {t("inbox.thread.draft.stamp")}
          </span>
          <p className="text-body-sm">
            <span className="font-semibold">{t("inbox.thread.draft.approved")}</span>
            {draft.created ? (
              <>
                {" "}
                <span className="numeric-value" dir="ltr">{t("inbox.thread.draft.orderId", { id: draft.created.id })}</span>
                {draft.created.status ? (
                  <>
                    {" "}
                    <span className="text-muted-foreground">
                      {t("inbox.thread.draft.status", { status: draft.created.status })}
                    </span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>
          {draft.created ? (
            <Link
              href={`/orders/${draft.created.id}`}
              className="inline-flex min-h-11 items-center text-body-sm font-medium underline underline-offset-4 [@media(pointer:fine)]:min-h-8"
            >
              {t("inbox.thread.draft.open")}
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          {phoneWarning !== "ok" ? (
            <div data-order-draft-warning="phone" className="flex items-start gap-2 rounded-control border border-destructive/50 bg-destructive/10 px-3 py-2 text-body-sm">
              <SignalShape shape="triangle" className="mt-1" />
              <p>
                <span className="block font-semibold">
                  {phoneWarning === "missing"
                    ? t("inbox.thread.draft.warn.phone.missing")
                    : t("inbox.thread.draft.warn.phone.incomplete")}
                </span>
                {t("inbox.thread.draft.warn.phone.body")}
              </p>
            </div>
          ) : null}
          {missing.includes("items") ? (
            <p data-order-draft-warning="items" className="text-body-sm text-destructive">{t("inbox.thread.draft.warn.items")}</p>
          ) : null}
          {missing.includes("wilaya") ? (
            <p data-order-draft-warning="wilaya" className="text-body-sm text-destructive">{t("inbox.thread.draft.warn.wilaya")}</p>
          ) : null}
          {error ? (
            <p role="alert" className="text-body-sm text-destructive">
              {t("inbox.thread.draft.error", { reason: error })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              data-order-draft-action="approve"
              onClick={onApprove}
              disabled={busy || !gate.ok}
              className="min-h-11 flex-1 sm:flex-none [@media(pointer:fine)]:min-h-9"
            >
              {busy ? t("inbox.thread.draft.approving") : t("inbox.thread.draft.approve")}
            </Button>
            <Button
              type="button"
              variant="outline"
              data-order-draft-action="edit"
              onClick={onEdit}
              disabled={busy}
              className="min-h-11 [@media(pointer:fine)]:min-h-9"
            >
              {editor ? t("inbox.thread.draft.editClose") : t("inbox.thread.draft.edit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              data-order-draft-action="dismiss"
              onClick={onDismiss}
              disabled={busy}
              className="min-h-11 [@media(pointer:fine)]:min-h-9"
            >
              {t("inbox.thread.draft.dismiss")}
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">{t("inbox.thread.draft.fine")}</p>
          {editor}
        </>
      )}
    </section>
  );
}
