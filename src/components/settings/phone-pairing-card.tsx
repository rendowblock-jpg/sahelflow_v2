"use client";

import * as React from "react";
import { Ban, Check, Clock, Copy, Loader2, ShieldCheck, Smartphone } from "lucide-react";

import { StateView } from "@/components/shared/state-view";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import { relativeTimeParts, type DeviceStatus, type DeviceView } from "@/lib/connected-platform/desktop-devices";
import { pairingCountdown } from "@/lib/connected-platform/pairing-link";

const POLL_MS = 3000;
const TARGET = "min-h-11 min-w-11";

type Call = { ok: true; data: Record<string, unknown> } | { ok: false; status: number; code: string };

async function call(path: string, method: "GET" | "POST"): Promise<Call> {
  let response: Response;
  try {
    response = await fetch(path, { method, headers: { Accept: "application/json" }, cache: "no-store" });
  } catch {
    return { ok: false, status: 0, code: "OFFLINE" };
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) return { ok: false, status: response.status, code: typeof body.code === "string" ? body.code : "UNKNOWN" };
  return { ok: true, data: body };
}

type Load =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "unavailable"; reason: "notEnrolled" | "noLicence" }
  | { kind: "offline" | "error"; code: string }
  | { kind: "ready"; devices: DeviceView[]; at: number; stale: boolean };

function classify(result: Extract<Call, { ok: false }>): Load {
  if (result.code === "PHONE_OWNER_ONLY" || result.code === "ACTION_FORBIDDEN") return { kind: "hidden" };
  if (result.code === "CONNECTED_NOT_ENROLLED") return { kind: "unavailable", reason: "notEnrolled" };
  if (result.code.startsWith("LICENSE_")) return { kind: "unavailable", reason: "noLicence" };
  if (result.code === "OFFLINE" || result.code === "PHONE_RELAY_UNAVAILABLE") return { kind: "offline", code: result.code };
  return { kind: "error", code: result.code };
}

const STATUS_ICON: Record<DeviceStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  approved: ShieldCheck,
  revoked: Ban,
};

function Fingerprint({ value }: { value: string | null }) {
  return (
    <bdi dir="ltr" className="font-mono text-base tracking-wider">
      {value ? value.split("-").join(" ") : "----"}
    </bdi>
  );
}

function Stamp({ status }: { status: DeviceStatus }) {
  const { t } = useI18n();
  const Icon = STATUS_ICON[status];
  return (
    <span data-status={status} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-sm font-medium">
      <Icon className="size-4" aria-hidden="true" />
      {t(`phones.status.${status}`)}
    </span>
  );
}

// The phone app is still in testing: this label and sentence sit next to the card title and in front of the pairing link.
function TestingNote() {
  const { t } = useI18n();
  return (
    <p data-testid="phone-pairing-testing" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span data-testid="phone-pairing-testing-label" className="inline-flex items-center rounded-md border border-border px-2 py-1 font-medium text-foreground">{t("phones.testing.label")}</span>
      <span>{t("phones.testing.note")}</span>
    </p>
  );
}

export function PhonePairingCard() {
  const { t, locale } = useI18n();
  const [load, setLoad] = React.useState<Load>({ kind: "loading" });
  const [pairOpen, setPairOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState<DeviceView | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const lastGood = React.useRef<{ devices: DeviceView[]; at: number } | null>(null);

  const refresh = React.useCallback(async () => {
    const result = await call("/api/connected/devices", "GET");
    if (result.ok) {
      const devices = Array.isArray(result.data.devices) ? (result.data.devices as DeviceView[]) : [];
      lastGood.current = { devices, at: Date.now() };
      setLoad({ kind: "ready", devices, at: Date.now(), stale: false });
      return devices;
    }
    const next = classify(result);
    if (lastGood.current && (next.kind === "offline" || next.kind === "error")) {
      setLoad({ kind: "ready", devices: lastGood.current.devices, at: lastGood.current.at, stale: true });
    } else {
      setLoad(next);
    }
    return null;
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the device list once on mount; state is set after the request answers
    void refresh();
  }, [refresh]);

  const act = async (deviceId: string, action: "approve" | "revoke") => {
    setActionError(null);
    const result = await call(`/api/connected/devices/${encodeURIComponent(deviceId)}/${action}`, "POST");
    if (!result.ok) setActionError(result.code);
    await refresh();
    return result.ok;
  };

  if (load.kind === "hidden") return null;

  const errorText = (code: string) => t(`phones.error.${code}`) === `phones.error.${code}` ? t("phones.error.generic") : t(`phones.error.${code}`);
  const devices = load.kind === "ready" ? load.devices : [];
  // Relative times are measured against the moment the list was last fetched (pure render; the list refreshes while open).
  const listedAt = load.kind === "ready" ? load.at : 0;
  const relative = (iso: string) => {
    const parts = relativeTimeParts(Date.parse(iso), listedAt);
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(parts.value, parts.unit);
  };

  return (
    <Card data-testid="phone-pairing-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5" aria-hidden="true" />
            {t("phones.title")}
          </CardTitle>
          <CardDescription>{t("phones.description")}</CardDescription>
          <TestingNote />
        </div>
        {load.kind === "ready" || load.kind === "offline" ? (
          <Button type="button" className={TARGET} onClick={() => setPairOpen(true)} disabled={load.kind === "offline"}>
            {t("phones.pair")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {load.kind === "loading" ? <StateView kind="loading" size="inline" testId="phones-loading" /> : null}
        {load.kind === "unavailable" ? (
          <p className="text-sm text-muted-foreground" data-testid="phones-unavailable">
            {t(`phones.unavailable.${load.reason}`)}
          </p>
        ) : null}
        {load.kind === "offline" ? (
          <StateView kind="offline" size="inline" description={t("phones.offline")}
            extraActions={<Button type="button" variant="outline" className={TARGET} onClick={() => void refresh()}>{t("phones.retry")}</Button>} />
        ) : null}
        {load.kind === "error" ? (
          <StateView kind="error" size="inline" description={t("phones.loadFailed")} digest={load.code} onRetry={() => void refresh()} />
        ) : null}
        {load.kind === "ready" && load.stale ? (
          <StateView kind="partial" size="inline" lastUpdated={load.at} onRefresh={() => void refresh()} />
        ) : null}
        {load.kind === "ready" && devices.length === 0 ? (
          <StateView kind="empty" size="panel" title={t("phones.empty.title")} description={t("phones.empty.description")} />
        ) : null}
        {actionError ? <p role="alert" className="text-sm text-destructive">{errorText(actionError)}</p> : null}
        {devices.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {devices.map((device, index) => (
              <li key={device.deviceId} data-testid="phone-row" className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 space-y-1 text-start">
                  <p className="font-medium">{device.name ?? t("phones.row.name", { number: String(index + 1) })}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("phones.row.fingerprint")}: <Fingerprint value={device.fingerprint} />
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {device.lastSeenAt ? t("phones.row.lastSeen", { when: relative(device.lastSeenAt) }) : t("phones.row.neverSeen")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Stamp status={device.status} />
                  <Button type="button" variant="outline" className={TARGET} onClick={() => setRemoving(device)}>
                    {t("phones.remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>

      <PairDialog
        open={pairOpen}
        devices={devices}
        onClose={() => { setPairOpen(false); void refresh(); }}
        refresh={refresh}
        act={act}
        errorText={errorText}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("phones.remove.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("phones.remove.body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={TARGET}>{t("phones.remove.cancel")}</AlertDialogCancel>
            <AlertDialogAction className={TARGET} onClick={() => { const id = removing?.deviceId; setRemoving(null); if (id) void act(id, "revoke"); }}>
              {t("phones.remove.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

type Pairing = { link: string; code: string; expiresAtMs: number; deviceId: string };

function PairDialog(props: {
  open: boolean;
  devices: DeviceView[];
  onClose: () => void;
  refresh: () => Promise<DeviceView[] | null>;
  act: (deviceId: string, action: "approve" | "revoke") => Promise<boolean>;
  errorText: (code: string) => string;
}) {
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const { t } = useI18n();
  return (
    <Dialog open={props.open} onOpenChange={(next) => { if (!next) props.onClose(); }}>
      <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); closeRef.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle>{t("phones.dialog.title")}</DialogTitle>
          <DialogDescription>{t("phones.dialog.instruction")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so every opening starts clean. */}
        <PairSession devices={props.devices} refresh={props.refresh} act={props.act} errorText={props.errorText} />
        <DialogFooter>
          <Button ref={closeRef} type="button" variant="outline" className={TARGET} data-testid="pair-close" onClick={props.onClose}>{t("phones.dialog.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PairSession(props: {
  devices: DeviceView[];
  refresh: () => Promise<DeviceView[] | null>;
  act: (deviceId: string, action: "approve" | "revoke") => Promise<boolean>;
  errorText: (code: string) => string;
}) {
  const { t } = useI18n();
  const { refresh } = props;
  const [pairing, setPairing] = React.useState<Pairing | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [copied, setCopied] = React.useState(false);

  // Asks the desktop for a new pairing. Sets state only after the answer arrives.
  const load = React.useCallback(async () => {
    const result = await call("/api/connected/devices/pairing", "POST");
    if (!result.ok) { setFailure(result.code); return; }
    const d = result.data;
    setNow(Date.now());
    setPairing({ link: String(d.link), code: String(d.code), expiresAtMs: Date.parse(String(d.expiresAt)), deviceId: String(d.deviceId) });
    void refresh();
  }, [refresh]);
  const create = () => { setFailure(null); setPairing(null); setCopied(false); void load(); };

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ask the desktop for a pairing once when the dialog opens; state is set after the answer arrives
    void load();
  }, [load]);

  const countdown = pairing ? pairingCountdown(pairing.expiresAtMs, now) : null;
  const pairingId = pairing?.deviceId;
  const expired = countdown?.expired ?? false;
  React.useEffect(() => {
    if (!pairingId || expired) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    return () => { window.clearInterval(tick); window.clearInterval(poll); };
  }, [pairingId, expired, refresh]);

  const device = pairing ? props.devices.find((value) => value.deviceId === pairing.deviceId) : undefined;

  return (
    <>
        {!pairing && !failure ? (
          <p className="flex items-center gap-2 text-sm" role="status"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t("phones.dialog.creating")}</p>
        ) : null}
        {failure ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-destructive">{props.errorText(failure)}</p>
            <Button type="button" variant="outline" className={TARGET} onClick={create}>{t("phones.retry")}</Button>
          </div>
        ) : null}
        {pairing && countdown ? (
          <div className="space-y-3">
            <div className="space-y-1">
              <TestingNote />
              <p className="text-sm font-medium">{t("phones.dialog.link")}</p>
              <p dir="ltr" data-testid="pairing-link" className="break-all rounded-md border border-border bg-muted p-2 text-start font-mono text-xs">{pairing.link}</p>
              <Button type="button" variant="outline" className={TARGET} disabled={countdown.expired}
                onClick={() => { void navigator.clipboard?.writeText(pairing.link).then(() => setCopied(true)).catch(() => undefined); }}>
                {copied ? <Check className="me-2 size-4" aria-hidden="true" /> : <Copy className="me-2 size-4" aria-hidden="true" />}
                {copied ? t("phones.dialog.copied") : t("phones.dialog.copy")}
              </Button>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("phones.dialog.code")}</p>
              <p dir="ltr" data-testid="pairing-code" className="break-words text-start font-mono text-xs">{pairing.code}</p>
            </div>
            {countdown.expired ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm">{t("phones.dialog.expired")}</p>
                <Button type="button" className={TARGET} onClick={create}>{t("phones.dialog.newLink")}</Button>
              </div>
            ) : (
              <p role="timer" data-testid="pairing-countdown" className="text-sm text-muted-foreground">
                {t("phones.dialog.expiresIn", { time: countdown.label })}
              </p>
            )}
            {device && device.status === "pending" ? (
              <div className="space-y-2 rounded-md border border-border p-3" data-testid="pairing-pending">
                <p className="text-sm font-medium">{t("phones.dialog.fingerprint")}</p>
                <p><Fingerprint value={device.fingerprint} /></p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className={TARGET} onClick={() => void props.act(device.deviceId, "approve")}>{t("phones.approve")}</Button>
                  <Button type="button" variant="outline" className={TARGET} onClick={() => void props.act(device.deviceId, "revoke")}>{t("phones.reject")}</Button>
                </div>
              </div>
            ) : null}
            {device && device.status === "approved" ? (
              <p role="status" className="flex items-center gap-2 text-sm"><ShieldCheck className="size-4" aria-hidden="true" />{t("phones.dialog.approved")}</p>
            ) : null}
            {!device && !countdown.expired ? (
              <p role="status" className="text-sm text-muted-foreground">{t("phones.dialog.waiting")}</p>
            ) : null}
          </div>
        ) : null}
    </>
  );
}
