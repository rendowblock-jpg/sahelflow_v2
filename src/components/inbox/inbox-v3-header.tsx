"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
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

function ConnectionState({
  transport,
  copy,
}: {
  transport: InboxTransportState;
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
}) {
  const base =
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium";

  if (transport.reachable === false) {
    return (
      <span
        className={cn(
          base,
          "border-destructive/20 bg-destructive/5 text-destructive",
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
          "border-success/20 bg-success/7 text-success",
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
          "border-warning/20 bg-warning/7 text-warning",
        )}
      >
        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        {copy("transportReconnecting")}
      </span>
    );
  }

  if (transport.status === "qr") {
    return (
      <span className={cn(base, "border-primary/20 bg-primary/7 text-primary")}>
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
          "border-border/70 bg-muted/35 text-muted-foreground",
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
        "border-border/70 bg-muted/25 text-muted-foreground",
      )}
    >
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      {copy("transportChecking")}
    </span>
  );
}

export function InboxV3Header({
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
    <div className="shrink-0 border-b bg-background/95 backdrop-blur-sm">
      <header className="flex min-h-14 items-center justify-between gap-3 px-3.5 py-2 sm:px-4">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold tracking-tight">
              {t("nav.inbox")}
            </h2>
            {queueCounts.unread > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-bold leading-5 tabular-nums text-primary">
                {queueCounts.unread > 99 ? "99+" : queueCounts.unread}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] leading-4 text-muted-foreground">
            {t("inbox.subtitle")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ConnectionState transport={transport} copy={copy} />
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
            <RefreshCw className="size-3.5" aria-hidden="true" />
          </Button>
          <WhatsAppPairingDialog workspace={workspace} />
          {transport.status === "connected" && canManageWhatsApp ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setLogoutConfirmOpen(true)}
              aria-label={copy("disconnect")}
            >
              <PlugZap className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </header>

      {dataDegraded ? (
        <div
          className="flex items-center gap-2 border-t bg-warning/5 px-4 py-2 text-xs text-warning"
          role="status"
        >
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{copy("dataDegraded")}</span>
        </div>
      ) : null}

      {canViewIngress ? (
        <div className="border-t px-3.5 py-1.5 empty:hidden sm:px-4">
          <WhatsAppIngressRecoveryDock canRetry={canRetryIngress} />
        </div>
      ) : null}
    </div>
  );
}
