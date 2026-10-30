"use client";

import { useState } from "react";
import { EllipsisVertical, PlugZap, RefreshCw } from "lucide-react";

import { InboxLinkSurface } from "@/components/inbox/inbox-link-surface";
import { WhatsAppPairingDialog } from "@/components/inbox/whatsapp-pairing-dialog";
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
    transport,
    refreshChats,
    refreshQr,
    reconnect,
    canManageWhatsApp,
    setLogoutConfirmOpen,
  } = workspace;
  // While the account is waiting to be linked, the link surface's banner owns
  // the pairing button; showing a second one here would be a second notice.
  const bannerOwnsPairing =
    transport.status === "qr" && canManageWhatsApp && transport.reachable !== false;

  return (
    <div className="shrink-0 border-b bg-background/95 backdrop-blur-sm">
      <header className="flex min-h-14 flex-wrap items-center gap-x-3 px-3.5 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {/* The unread count lives on the queue's Unread tab (and the
              sidebar badge, which counts the same chats); repeating it beside
              the title made three different surfaces show a number. */}
          <h2 className="truncate text-title-3 tracking-tight">
            {t("nav.inbox")}
          </h2>
        </div>

        <InboxLinkSurface
          workspace={workspace}
          canViewIngress={canViewIngress}
          canRetryIngress={canRetryIngress}
        />

        <div className="ms-auto flex shrink-0 items-center gap-1.5">
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
          {bannerOwnsPairing ? null : <WhatsAppPairingDialog workspace={workspace} />}
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
    </div>
  );
}
