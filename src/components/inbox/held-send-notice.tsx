"use client";

import { Send, ShieldAlert } from "lucide-react";
import { useRef } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { HELD_SEND_OTHER_CHATS } from "@/lib/whatsapp/held-send";

type CopyT = (key: string, params?: Record<string, string | number>) => string;

/**
 * Shown under a message the send guard held. The label has an icon and words
 * (never colour alone). The owner gets "Send anyway"; anyone else is told to
 * ask the owner.
 */
export function HeldSendNotice({
  canApprove,
  onApprove,
  t,
}: {
  canApprove: boolean;
  onApprove: () => void;
  t: CopyT;
}) {
  return (
    <div
      role="status"
      className="flex max-w-80 flex-col items-end gap-1.5 rounded-control border border-dashed border-border px-3 py-2 text-end"
    >
      <p className="flex items-center gap-1.5 text-caption font-medium text-foreground">
        <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {t("whatsapp.heldSend.label")}
      </p>
      <p className="text-caption text-muted-foreground">{t("whatsapp.heldSend.explain")}</p>
      {canApprove ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9 [@media(pointer:coarse)]:min-h-11"
          onClick={onApprove}
        >
          <Send className="size-3.5" aria-hidden="true" />
          {t("whatsapp.heldSend.approve")}
        </Button>
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
