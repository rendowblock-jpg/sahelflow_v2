import type { WhatsAppStatus } from "@/lib/whatsapp/types";

export type WhatsAppPairingPhase =
  | "starting"
  | "waiting-qr"
  | "qr-ready"
  | "connected"
  | "disconnected"
  | "unavailable";

export interface WhatsAppPairingSnapshot {
  status: WhatsAppStatus | null;
  hasQr: boolean;
  sidecarReachable: boolean | null;
}

export function deriveWhatsAppPairingPhase(
  snapshot: WhatsAppPairingSnapshot,
): WhatsAppPairingPhase {
  if (snapshot.sidecarReachable === false) return "unavailable";
  if (snapshot.status === "connected") return "connected";
  if (snapshot.status === "qr" && snapshot.hasQr) return "qr-ready";
  if (snapshot.status === "connecting" || snapshot.status === "qr") {
    return "waiting-qr";
  }
  if (snapshot.status === "disconnected") return "disconnected";
  return "starting";
}

export function isWhatsAppStatus(value: unknown): value is WhatsAppStatus {
  return (
    value === "disconnected" ||
    value === "connecting" ||
    value === "qr" ||
    value === "connected"
  );
}

const UNREACHABLE: WhatsAppPairingSnapshot = {
  status: "disconnected",
  hasQr: false,
  sidecarReachable: false,
};

/**
 * One reading of the /api/whatsapp/status answer for every consumer. The route answers 200 with
 * `sidecarReachable: false` when the helper is off; that is never "connected", whatever else the body
 * says. A failed request (old 503, 401, network proxy) reads the same way.
 */
export function parseWhatsAppStatusResponse(
  ok: boolean,
  data: unknown,
): WhatsAppPairingSnapshot {
  if (!ok) return { ...UNREACHABLE };
  const body =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  if (body.sidecarReachable === false) return { ...UNREACHABLE };
  return {
    status: isWhatsAppStatus(body.status) ? body.status : null,
    hasQr: body.hasQr === true,
    sidecarReachable: true,
  };
}

/** The onboarding checklist asks one thing: does the helper say it is reachable AND connected? */
export function isWhatsAppReportedConnected(data: unknown): boolean {
  return (
    deriveWhatsAppPairingPhase(parseWhatsAppStatusResponse(true, data)) ===
    "connected"
  );
}
