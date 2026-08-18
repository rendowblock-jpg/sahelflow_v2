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
