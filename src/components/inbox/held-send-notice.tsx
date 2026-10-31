"use client";

import { Ban, Loader2, Send, ShieldAlert, X } from "lucide-react";
import { useRef } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { HELD_SEND_OTHER_CHATS } from "@/lib/whatsapp/held-send";

type CopyT = (key: string, params?: Record<string, string | number>) => string;

/** What the box shows about a discard in progress. `reason` is already translated. */
export type HeldSendDiscardStatus =
  | { status: "idle" }
  | { status: "discarding" }
  | { status: "failed"; reason: string };

const IDLE: HeldSendDiscardStatus = { status: "idle" };
const BOX =
  "flex max-w-80 flex-col items-end gap-1.5 rounded-control border border-dashed border-border px-3 py-2 text-end";
const BUTTON = "min-h-9 [@media(pointer:coarse)]:min-h-11";

/**
 * Shown under a message the send guard held. The label has an icon and words
 * (never colour alone). The owner gets "Send anyway" and, when the thread
 * wires it, "Discard"; anyone else is told to ask the owner. After a discard
 * (`discarded`) everyone sees one calm line and no button.
 */
export function HeldSendNotice({
  canApprove,
  onApprove,
  onDiscard,
  discard = IDLE,
  discarded = false,
  t,
}: {
  canApprove: boolean;
  onApprove: () => void;
  onDiscard?: (() => void) | undefined;
  discard?: HeldSendDiscardStatus | undefined;
  discarded?: boolean | undefined;
  t: CopyT;
}) {
  if (discarded) {
    return (
      <div role="status" className={BOX}>
        <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Ban className="size-3.5 shrink-0" aria-hidden="true" />
          {t("whatsapp.heldSend.discarded")}
        </p>
      </div>
    );
  }
  const busy = discard.status === "discarding";
  return (
    <div role="status" aria-busy={busy || undefined} className={BOX}>
      <p className="flex items-center gap-1.5 text-caption font-medium text-foreground">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {t("whatsapp.heldSend.label")}
      </p>
      <p className="text-caption text-muted-foreground">{t("whatsapp.heldSend.explain")}</p>
      {canApprove ? (
        <>
          {discard.status === "failed" ? (
            <p role="alert" className="text-caption font-medium text-destructive">
              {discard.reason}
            </p>
          ) : null}
          {busy ? (
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
              {t("whatsapp.heldSend.discarding")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onDiscard ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`${BUTTON} text-destructive hover:text-destructive`}
                disabled={busy}
                onClick={onDiscard}
              >
                <X className="size-3.5" aria-hidden="true" />
                {t("whatsapp.heldSend.discard")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={BUTTON}
              disabled={busy}
              onClick={onApprove}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {t("whatsapp.heldSend.approve")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-caption font-medium text-foreground">{t("whatsapp.heldSend.askOwner")}</p>
      )}
    </div>
  );
}

/** Says WHY before the owner overrides the guard. Focus starts on the safe button (Keep on hold). */
export function HeldSendApproveDialog({
  open,
  onResolve,
  t,
}: {
  open: boolean;
  onResolve: (confirmed: boolean) => void;
  t: CopyT;
}) {
  // ConfirmDialog closes itself after a confirm; that close must not read as a refusal.
  const confirmed = useRef(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        onResolve(false);
      }}
      title={t("whatsapp.heldSend.dialogTitle")}
      description={t("whatsapp.heldSend.dialogBody", { count: HELD_SEND_OTHER_CHATS })}
      confirmLabel={t("whatsapp.heldSend.dialogConfirm")}
      cancelLabel={t("whatsapp.heldSend.dialogCancel")}
      onConfirm={() => {
        confirmed.current = true;
        onResolve(true);
      }}
    />
  );
}

/** Names what is lost before the owner throws a held message away. Focus starts on Keep on hold. */
export function HeldSendDiscardDialog({
  open,
  onResolve,
  t,
}: {
  open: boolean;
  onResolve: (confirmed: boolean) => void;
  t: CopyT;
}) {
  // Same rule as the approve dialog: the close that follows a confirm is not a refusal.
  const confirmed = useRef(false);
  return (
    <ConfirmDialog
      open={open}
      destructive
      onOpenChange={(next) => {
        if (next) return;
        if (confirmed.current) {
          confirmed.current = false;
          return;
        }
        onResolve(false);
      }}
      title={t("whatsapp.heldSend.discardTitle")}
      description={t("whatsapp.heldSend.discardBody")}
      confirmLabel={t("whatsapp.heldSend.discard")}
      cancelLabel={t("whatsapp.heldSend.dialogCancel")}
      onConfirm={() => {
        confirmed.current = true;
        onResolve(true);
      }}
    />
  );
}
