"use client";

import { useState, useSyncExternalStore } from "react";

import { SignalShape } from "@/components/inbox/inbox-signal-shape";
import {
  deriveInboxLinkState,
  type InboxLinkKind,
} from "@/components/inbox/inbox-link-state";
import styles from "@/components/inbox/inbox-v3-workspace.module.css";
import { InboxLinkSilentNote } from "@/components/inbox/inbox-link-silent-note";
import { WhatsAppIngressRecoveryDock } from "@/components/inbox/whatsapp-ingress-recovery-dock";
import { WhatsAppPairingDialog } from "@/components/inbox/whatsapp-pairing-dialog";
import { WhatsAppUnofficialNotice } from "@/components/inbox/whatsapp-unofficial-notice";
import { Button } from "@/components/ui/button";
import type { useInboxWorkspace } from "@/hooks/use-inbox-workspace";

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const readOnline = () => navigator.onLine;
const serverOnline = () => true;

const REASON_KEY: Partial<Record<InboxLinkKind, string>> = {
  disconnected: "inbox.carnet.link.reason.disconnected",
  error: "inbox.carnet.link.reason.error",
  offline: "inbox.carnet.link.reason.offline",
  "unofficial-only": "inbox.carnet.link.reason.notLinked",
};

/**
 * The inbox's only connection notice: a tag in the header (always there, a
 * word and a shape), one banner only while sending is blocked, the recovery
 * dock and the unofficial-link sentence as parts of it. Renders as `contents`
 * so the header's flex row owns the layout. Every action is a click.
 */
export function InboxLinkSurface({
  workspace,
  canViewIngress,
  canRetryIngress,
}: {
  workspace: ReturnType<typeof useInboxWorkspace>;
  canViewIngress: boolean;
  canRetryIngress: boolean;
}) {
  const { t, copy, transport, dataDegraded, reconnect, refreshChats, canManageWhatsApp } =
    workspace;
  const browserOnline = useSyncExternalStore(subscribeOnline, readOnline, serverOnline);
  const link = deriveInboxLinkState({
    status: transport.status,
    reachable: transport.reachable,
    wsOpen: transport.wsOpen,
    browserOnline,
    dataDegraded,
  });
  const [detailChoice, setDetailChoice] = useState<boolean | null>(null);
  const detailOpen = detailChoice ?? link.unofficialDetail === "open";

  const word =
    link.kind === "connected"
      ? copy("transportConnected")
      : link.reason === "checking"
        ? copy("transportChecking")
        : t(`inbox.carnet.link.${link.kind === "unofficial-only" ? "notLinked" : link.kind}`);
  const tagBody = (
    <>
      <SignalShape shape={link.shape} />
      <span>{word}</span>
      {link.listStale ? (
        <span className="sr-only sm:not-sr-only sm:font-normal">
          {"· "}
          {t("inbox.carnet.link.staleList")}
        </span>
      ) : null}
    </>
  );
  const tagProps = {
    "data-inbox-link-tag": "",
    "data-inbox-link-kind": link.kind,
    className: styles.linkTag,
  };
  const reasonKey = REASON_KEY[link.kind];

  return (
    <div className="contents">
      {link.kind === "connecting" && link.action === "reconnect" ? (
        <button type="button" onClick={() => reconnect()} {...tagProps}>
          {tagBody}
        </button>
      ) : (
        <span {...tagProps}>{tagBody}</span>
      )}
      <button
        type="button"
        aria-expanded={detailOpen}
        aria-controls="inbox-unofficial-detail"
        aria-label={t("inbox.carnet.link.aboutUnofficial")}
        onClick={() => setDetailChoice(!detailOpen)}
        className={styles.helpButton}
      >
        ?
      </button>
      {canViewIngress ? <InboxLinkSilentNote connected={link.kind === "connected"} /> : null}

      {link.showBanner && reasonKey ? (
        <div
          role="status"
          data-inbox-link-banner=""
          data-inbox-link-kind={link.kind}
          className={styles.banner}
        >
          <SignalShape shape={link.shape} />
          <p className="min-w-0 flex-1 font-medium">{t(reasonKey)}</p>
          {link.savedOnDevice ? (
            <p className="basis-full text-muted-foreground">
              {t("inbox.carnet.link.saved")}
            </p>
          ) : null}
          {link.action === "pair" ? (
            canManageWhatsApp ? <WhatsAppPairingDialog workspace={workspace} /> : null
          ) : link.action ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={styles.action}
              onClick={() => {
                reconnect();
                if (link.action === "retry") void refreshChats();
              }}
            >
              {t(
                link.action === "retry"
                  ? "inbox.carnet.link.retry"
                  : "inbox.carnet.link.reconnect",
              )}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        id="inbox-unofficial-detail"
        hidden={!detailOpen}
        className="order-last basis-full pb-2 text-muted-foreground"
      >
        <WhatsAppUnofficialNotice variant="detail" />
      </div>

      {canViewIngress ? (
        <WhatsAppIngressRecoveryDock
          canRetry={canRetryIngress}
          embedded
          onReconnect={() => reconnect()}
          linkConnected={link.kind === "connected"}
        />
      ) : null}
    </div>
  );
}
