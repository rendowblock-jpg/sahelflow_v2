"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

import {
  deriveWhatsAppPairingPhase,
  type WhatsAppPairingSnapshot,
} from "@/components/inbox/whatsapp-pairing-state";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import { getWhatsAppPairingCopy } from "@/lib/i18n/whatsapp-pairing";
import { toast } from "@/lib/toast";
import type { WhatsAppStatus } from "@/lib/whatsapp/types";

/**
 * Onboarding WhatsApp pairing panel (R4-b).
 *
 * A headless sibling of the inbox WhatsAppPairingDialog: same status polling
 * (`/api/whatsapp/status`), same connect action (`/api/whatsapp/connect`),
 * same opaque QR endpoint (`/api/whatsapp/qr-image`), same phase state machine
 * (`deriveWhatsAppPairingPhase`) and same trilingual copy authority
 * (`getWhatsAppPairingCopy`). The inbox dialog is read-only reuse — its
 * `workspace: ReturnType<typeof useInboxWorkspace>` prop would drag the whole
 * 2.5k-line inbox hook into onboarding, so this variant reproduces the
 * self-contained pairing lifecycle instead of editing it.
 */
function isWhatsAppStatus(value: unknown): value is WhatsAppStatus {
  return (
    value === "disconnected" ||
    value === "connecting" ||
    value === "qr" ||
    value === "connected"
  );
}

const STATUS_POLL_MS = 1_000;
const QR_REFRESH_MS = 15_000;

export function OnboardingPairingPanel({
  onConnectedChange,
}: {
  /** Notified whenever the derived pairing phase flips to/from "connected". */
  onConnectedChange?: (connected: boolean) => void;
}) {
  const { locale, t } = useI18n();
  const pairingCopy = useCallback(
    (key: Parameters<typeof getWhatsAppPairingCopy>[1]) =>
      getWhatsAppPairingCopy(locale, key),
    [locale],
  );
  // Reuses the inbox workspace CTA copy so the embedded step and the inbox
  // header button read identically ("Connect WhatsApp" / … / "ربط واتساب").
  const inboxCopy = useCallback(
    (key: Parameters<typeof getInboxWorkspaceCopy>[1]) =>
      getInboxWorkspaceCopy(locale, key),
    [locale],
  );

  const [snapshot, setSnapshot] = useState<WhatsAppPairingSnapshot>({
    status: null,
    hasQr: false,
    sidecarReachable: null,
  });
  const [connecting, setConnecting] = useState(false);
  const [qrKey, setQrKey] = useState(0);
  const [qrRevision, setQrRevision] = useState(0);
  const [qrImageFailed, setQrImageFailed] = useState(false);

  const requestStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/whatsapp/status", {
        cache: "no-store",
        signal,
      });
      const data = (await response.json().catch(() => ({}))) as {
        status?: unknown;
        hasQr?: unknown;
        sidecarReachable?: unknown;
      };
      if (!response.ok) {
        setSnapshot({
          status: isWhatsAppStatus(data.status) ? data.status : "disconnected",
          hasQr: false,
          sidecarReachable: false,
        });
        return;
      }
      setSnapshot({
        status: isWhatsAppStatus(data.status) ? data.status : null,
        hasQr: data.hasQr === true,
        sidecarReachable: data.sidecarReachable === false ? false : true,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSnapshot({
        status: "disconnected",
        hasQr: false,
        sidecarReachable: false,
      });
    }
  }, []);

  // Poll the sidecar status while the pairing step is on screen — identical
  // cadence to the inbox pairing dialog so both surfaces report the same truth.
  useEffect(() => {
    const controller = new AbortController();
    const initial = window.setTimeout(() => {
      void requestStatus(controller.signal);
    }, 0);
    const timer = window.setInterval(() => {
      void requestStatus(controller.signal);
    }, STATUS_POLL_MS);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [requestStatus]);

  const phase = useMemo(
    () => deriveWhatsAppPairingPhase(snapshot),
    [snapshot],
  );

  // Fresh QR renders on a cadence while one is available (same 15s cycle as
  // the inbox dialog).
  useEffect(() => {
    if (phase !== "qr-ready") return;
    const timer = window.setInterval(() => {
      setQrRevision((current) => current + 1);
      setQrImageFailed(false);
    }, QR_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  const connected = phase === "connected";

  useEffect(() => {
    onConnectedChange?.(connected);
  }, [connected, onConnectedChange]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setQrImageFailed(false);
    setSnapshot({
      status: "connecting",
      hasQr: false,
      sidecarReachable: snapshot.sidecarReachable,
    });
    try {
      const response = await fetch("/api/whatsapp/connect", {
        method: "POST",
      });
      if (!response.ok) {
        setSnapshot({
          status: "disconnected",
          hasQr: false,
          sidecarReachable: false,
        });
        toast.error(t("common.error"));
        return;
      }
      await requestStatus();
    } catch {
      setSnapshot({
        status: "disconnected",
        hasQr: false,
        sidecarReachable: false,
      });
      toast.error(t("common.error"));
    } finally {
      setConnecting(false);
    }
  }, [requestStatus, snapshot.sidecarReachable, t]);

  const refreshCurrentQr = useCallback(async () => {
    setQrKey((current) => current + 1);
    setQrRevision((current) => current + 1);
    setQrImageFailed(false);
    await requestStatus();
  }, [requestStatus]);

  return (
    <div
      data-onboarding-pairing={phase}
      className="overflow-hidden rounded-xl border"
    >
      <div className="px-6 py-6">
        {phase === "starting" || phase === "waiting-qr" ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border bg-primary/8 text-primary">
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-base font-semibold">
              {phase === "starting"
                ? pairingCopy("startingTitle")
                : pairingCopy("waitingQrTitle")}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {phase === "starting"
                ? pairingCopy("startingBody")
                : pairingCopy("waitingQrBody")}
            </p>
          </div>
        ) : null}

        {phase === "qr-ready" ? (
          <div className="grid gap-6 sm:grid-cols-[15rem_1fr] sm:items-center">
            <div className="mx-auto flex size-60 items-center justify-center rounded-3xl border bg-white p-3 shadow-sm">
              {qrImageFailed ? (
                <div className="px-4 text-center text-slate-700">
                  <TriangleAlert className="mx-auto size-7" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">
                    {pairingCopy("qrFailedTitle")}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {pairingCopy("qrFailedBody")}
                  </p>
                </div>
              ) : (
                // Dynamic opaque QR endpoint: browser image loading is intentional.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${qrKey}:${qrRevision}`}
                  src={`/api/whatsapp/qr-image?refresh=${qrKey}-${qrRevision}`}
                  alt={pairingCopy("qrAlt")}
                  className="size-full rounded-2xl object-contain"
                  onLoad={() => setQrImageFailed(false)}
                  onError={() => setQrImageFailed(true)}
                />
              )}
            </div>

            <div className="text-start">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Smartphone className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold">
                {pairingCopy("scanTitle")}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {pairingCopy("scanBody")}
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-foreground">
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
                </span>
                {pairingCopy("waitingPhone")}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => void refreshCurrentQr()}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {pairingCopy("refreshQr")}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "connected" ? (
          <div
            data-onboarding-pairing-connected="true"
            className="flex min-h-64 flex-col items-center justify-center text-center"
          >
            <div className="flex size-14 items-center justify-center rounded-2xl bg-success/10 text-success">
              <CheckCircle2 className="size-7" aria-hidden="true" />
            </div>
            <h3 className="mt-5 text-base font-semibold">
              {pairingCopy("connectedTitle")}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {pairingCopy("connectedBody")}
            </p>
          </div>
        ) : null}

        {phase === "unavailable" || phase === "disconnected" ? (
          <div className="flex min-h-64 flex-col items-center justify-center text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border bg-destructive/8 text-destructive">
              {phase === "unavailable" ? (
                <WifiOff className="size-6" aria-hidden="true" />
              ) : (
                <TriangleAlert className="size-6" aria-hidden="true" />
              )}
            </div>
            <h3 className="mt-5 text-base font-semibold">
              {phase === "unavailable"
                ? pairingCopy("unavailableTitle")
                : pairingCopy("disconnectedTitle")}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {phase === "unavailable"
                ? pairingCopy("unavailableBody")
                : pairingCopy("disconnectedBody")}
            </p>
            <Button
              className="mt-5"
              onClick={() => void connect()}
              disabled={connecting}
            >
              {connecting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : phase === "unavailable" ? (
                <RefreshCw className="size-4" aria-hidden="true" />
              ) : (
                <Smartphone className="size-4" aria-hidden="true" />
              )}
              {phase === "unavailable"
                ? pairingCopy("retry")
                : inboxCopy("connect")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t bg-muted/25 px-6 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>{pairingCopy("secureNote")}</span>
      </div>
    </div>
  );
}
