"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  EllipsisVertical,
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import {
  playNewMessageChime,
  readNewMessageSoundEnabled,
  readNewMessageToastEnabled,
  writeNewMessageSoundEnabled,
  writeNewMessageToastEnabled,
} from "@/hooks/use-new-message-alerts";
import { cn } from "@/lib/utils";

function ConnectionState({
  transport,
  copy,
  onRetry,
}: {
  transport: InboxTransportState;
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
  onRetry: () => void;
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
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          base,
          "border-warning/20 bg-warning/7 text-warning transition-colors hover:bg-warning/12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
        {copy("transportReconnecting")}
      </button>
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

/**
 * Global new-message alert preferences (R4-a liveness).
 *
 * Toast defaults ON, sound defaults OFF; both persist per device in
 * localStorage (sf_inbox_* keys). The sidebar alert hook reads the stored
 * value at alert time, so a toggle here takes effect on the very next
 * message without any cross-component state bridge. Enabling the sound plays
 * a preview so the seller knows exactly what they opted into.
 */
function AlertPreferencesMenu({
  t,
}: {
  t: ReturnType<typeof useInboxWorkspace>["t"];
}) {
  const [toastEnabled, setToastEnabled] = useState(() =>
    readNewMessageToastEnabled(),
  );
  const [soundEnabled, setSoundEnabled] = useState(() =>
    readNewMessageSoundEnabled(),
  );

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) return;
        // Re-read on open so the menu always reflects stored truth, even if
        // another window or a data migration changed it since mount.
        setToastEnabled(readNewMessageToastEnabled());
        setSoundEnabled(readNewMessageSoundEnabled());
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("inbox.liveness.alertsMenu")}
        >
          <EllipsisVertical className="size-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuCheckboxItem
          checked={toastEnabled}
          onCheckedChange={(checked) => {
            writeNewMessageToastEnabled(checked);
            setToastEnabled(checked);
          }}
          onSelect={(event) => event.preventDefault()}
        >
          {t("inbox.liveness.toastToggle")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={soundEnabled}
          onCheckedChange={(checked) => {
            writeNewMessageSoundEnabled(checked);
            setSoundEnabled(checked);
            if (checked) void playNewMessageChime();
          }}
          onSelect={(event) => event.preventDefault()}
        >
          {t("inbox.liveness.soundToggle")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    reconnect,
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
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-2xs font-bold leading-5 tabular-nums text-primary">
                {queueCounts.unread > 99 ? "99+" : queueCounts.unread}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-2xs leading-4 text-muted-foreground">
            {t("inbox.subtitle")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ConnectionState
            transport={transport}
            copy={copy}
            onRetry={reconnect}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              reconnect();
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
          <AlertPreferencesMenu t={t} />
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
