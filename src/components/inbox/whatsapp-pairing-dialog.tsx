"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  QrCode,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { getWhatsAppPairingCopy } from "@/lib/i18n/whatsapp-pairing";
import type { WhatsAppStatus } from "@/lib/whatsapp/types";

function isWhatsAppStatus(value: unknown): value is WhatsAppStatus {
  return (
    value === "disconnected" ||
    value === "connecting" ||
    value === "qr" ||
    value === "connected"
  );
}

export function WhatsAppPairingDialog({
  workspace,
}: {
  workspace: ReturnType<typeof useInboxWorkspace>;
}) {
  const {
    locale,
    copy,
    transport,
    canManageWhatsApp,
    connectWhatsApp,
    qrKey,
    refreshQr,
  } = workspace;
  const pairingCopy = useCallback(
    (key: Parameters<typeof getWhatsAppPairingCopy>[1]) =>
      getWhatsAppPairingCopy(locale, key),
    [locale],
  );
  const [open, setOpen] = useState(false);
  const [qrRevision, setQrRevision] = useState(0);
  const [qrImageFailed, setQrImageFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<WhatsAppPairingSnapshot>({
    status: transport.status,
    hasQr: transport.status === "qr",
    sidecarReachable: transport.reachable,
  });

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

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const initial = window.setTimeout(() => {
      void requestStatus(controller.signal);
    }, 0);
    const timer = window.setInterval(() => {
      void requestStatus(controller.signal);
    }, 1_000);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [open, requestStatus]);

  const phase = useMemo(
    () => deriveWhatsAppPairingPhase(snapshot),
    [snapshot],
  );

  useEffect(() => {
    if (!open || phase !== "qr-ready") return;
    const timer = window.setInterval(() => {
      setQrRevision((current) => current + 1);
      setQrImageFailed(false);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [open, phase]);

  const beginPairing = async () => {
    setOpen(true);
    setQrImageFailed(false);
    setSnapshot({
      status: "connecting",
      hasQr: false,
      sidecarReachable: transport.reachable,
    });
    const started = await connectWhatsApp();
    if (!started) {
      setSnapshot({
        status: "disconnected",
        hasQr: false,
        sidecarReachable: false,
      });
      return;
    }
    await requestStatus();
  };

  const openExistingPairing = () => {
    setOpen(true);
    setQrImageFailed(false);
    void requestStatus();
  };

  const retry = async () => {
    setQrImageFailed(false);
    setSnapshot({
      status: "connecting",
      hasQr: false,
      sidecarReachable: snapshot.sidecarReachable,
    });
    const started = await connectWhatsApp();
    if (!started) {
      setSnapshot({
        status: "disconnected",
        hasQr: false,
        sidecarReachable: false,
      });
      return;
    }
    await requestStatus();
  };

  const refreshCurrentQr = async () => {
    refreshQr();
    setQrRevision((current) => current + 1);
    setQrImageFailed(false);
    await requestStatus();
  };

  if (!canManageWhatsApp) return null;

  return (
    <>
      {transport.status !== "connected" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (transport.status === "qr") openExistingPairing();
            else void beginPairing();
          }}
        >
          {transport.status === "qr" ? (
            <QrCode className="size-3.5" aria-hidden="true" />
          ) : (
            <Smartphone className="size-3.5" aria-hidden="true" />
          )}
          {transport.status === "qr" ? copy("pair") : copy("connect")}
        </Button>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0 sm:max-w-[34rem]">
          <DialogHeader className="border-b px-6 pb-5 pt-6 text-start">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              {pairingCopy("eyebrow")}
            </p>
            <DialogTitle className="mt-1 text-xl tracking-tight">
              {pairingCopy("title")}
            </DialogTitle>
            <DialogDescription className="max-w-[46ch] text-sm leading-6">
              {pairingCopy("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-6">
            {phase === "starting" || phase === "waiting-qr" ? (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
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
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
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
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
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
                <Button className="mt-5" onClick={() => void retry()}>
                  <RefreshCw className="size-4" aria-hidden="true" />
                  {pairingCopy("retry")}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t bg-muted/25 px-6 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 shrink-0 text-success" aria-hidden="true" />
            <span>{pairingCopy("secureNote")}</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
