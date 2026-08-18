"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  MessageCircle,
  PlugZap,
  QrCode,
  RefreshCw,
  WifiOff,
} from "lucide-react";

import { WhatsAppIngressRecoveryDock } from "@/components/inbox/whatsapp-ingress-recovery-dock";
import { WhatsAppPairingDialog } from "@/components/inbox/whatsapp-pairing-dialog";
import type { InboxTransportState } from "@/components/inbox/inbox-workspace-types";
import { Button } from "@/components/ui/button";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { cn } from "@/lib/utils";

function TransportPill({
  transport,
  copy,
}: {
  transport: InboxTransportState;
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
}) {
  const base =
    "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium";
  if (transport.reachable === false) {
    return (
      <span
        className={cn(
          base,
          "border-destructive/20 bg-destructive/6 text-destructive",
        )}
      >
        <WifiOff className="size-3.5" aria-hidden="true" />
        {copy("transportUnavailable")}
      </span>
    );
  }
  if (transport.status === "connected" && transport.wsOpen) {
    return (
      <span
        className={cn(
          base,
          "border-success/20 bg-success/8 text-success",
        )}
      >
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {copy("transportConnected")}
      </span>
    );
  }
  if (
    transport.status === "connecting" ||
    (transport.status === "connected" && !transport.wsOpen)
  ) {
    return (
      <span
        className={cn(
          base,
          "border-warning/20 bg-warning/8 text-warning",
        )}
      >
        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        {copy("transportReconnecting")}
      </span>
    );
  }
  if (transport.status === "qr") {
    return (
      <span
        className={cn(base, "border-primary/20 bg-primary/8 text-primary")}
      >
        <QrCode className="size-3.5" aria-hidden="true" />
        {copy("pair")}
      </span>
    );
  }
  if (transport.status === "disconnected") {
    return (
      <span
        className={cn(
          base,
          "border-border bg-muted/50 text-muted-foreground",
        )}
      >
        <Circle className="size-3.5" aria-hidden="true" />
        {copy("transportDisconnected")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "border-border bg-muted/30 text-muted-foreground",
      )}
    >
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      {copy("transportChecking")}
    </span>
  );
}

export function InboxOperationsHeader({
  workspace,
  canViewIngress,
  canRetryIngress,
}: {
  workspace: ReturnType<typeof useInboxWorkspace>;
  canViewIngress: boolean;
  canRetryIngress: boolean;
}) {
  const {
    t,
    copy,
    queueCounts,
    transport,
    dataDegraded,
    refreshChats,
    refreshQr,
    canManageWhatsApp,
    setLogoutConfirmOpen,
  } = workspace;

  return (
    <div className="shrink-0 border-b bg-background">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MessageCircle className="size-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-base font-semibold tracking-tight">
                {t("nav.inbox")}
              </h2>
              {queueCounts.unread > 0 ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                  {queueCounts.unread}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {t("inbox.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <TransportPill transport={transport} copy={copy} />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              refreshQr();
              void refreshChats();
            }}
            aria-label={t("common.refresh")}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
          <WhatsAppPairingDialog workspace={workspace} />
          {transport.status === "connected" && canManageWhatsApp ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLogoutConfirmOpen(true)}
            >
              <PlugZap className="size-3.5" aria-hidden="true" />
              {copy("disconnect")}
            </Button>
          ) : null}
        </div>
      </header>

      {dataDegraded ? (
        <div
          className="flex items-center gap-2 border-t bg-warning/6 px-3 py-2 text-xs text-warning sm:px-4"
          role="status"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{copy("dataDegraded")}</span>
        </div>
      ) : null}

      {canViewIngress ? (
        <div className="border-t px-3 py-2 empty:hidden sm:px-4">
          <WhatsAppIngressRecoveryDock canRetry={canRetryIngress} />
        </div>
      ) : null}
    </div>
  );
}
