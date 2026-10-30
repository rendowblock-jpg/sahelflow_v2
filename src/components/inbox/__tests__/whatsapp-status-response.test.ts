import { describe, expect, it } from "vitest";

import {
  deriveWhatsAppPairingPhase,
  isWhatsAppReportedConnected,
  parseWhatsAppStatusResponse,
} from "../whatsapp-pairing-state";

// One reading of the /api/whatsapp/status answer for every consumer. The rule that matters: a body that says
// sidecarReachable:false is NEVER "connected", whatever else it says and whatever the HTTP status is.
const cases: Array<{
  name: string;
  ok: boolean;
  body: unknown;
  snapshot: { status: string | null; hasQr: boolean; sidecarReachable: boolean | null };
  phase: string;
}> = [
  { name: "200 helper off", ok: true, body: { status: "disconnected", user: null, hasQr: false, sidecarReachable: false }, snapshot: { status: "disconnected", hasQr: false, sidecarReachable: false }, phase: "unavailable" },
  { name: "200 unreachable but the body claims connected", ok: true, body: { status: "connected", hasQr: false, sidecarReachable: false }, snapshot: { status: "disconnected", hasQr: false, sidecarReachable: false }, phase: "unavailable" },
  { name: "200 unreachable but the body claims a QR", ok: true, body: { status: "qr", hasQr: true, sidecarReachable: false }, snapshot: { status: "disconnected", hasQr: false, sidecarReachable: false }, phase: "unavailable" },
  { name: "old 503 answer", ok: false, body: { status: "disconnected", sidecarReachable: false }, snapshot: { status: "disconnected", hasQr: false, sidecarReachable: false }, phase: "unavailable" },
  { name: "any failure with an unreadable body", ok: false, body: null, snapshot: { status: "disconnected", hasQr: false, sidecarReachable: false }, phase: "unavailable" },
  { name: "failure that claims connected", ok: false, body: { status: "connected" }, snapshot: { status: "disconnected", hasQr: false, sidecarReachable: false }, phase: "unavailable" },
  { name: "reachable and connected", ok: true, body: { status: "connected", hasQr: false, sidecarReachable: true }, snapshot: { status: "connected", hasQr: false, sidecarReachable: true }, phase: "connected" },
  { name: "connected, field missing (older helper)", ok: true, body: { status: "connected" }, snapshot: { status: "connected", hasQr: false, sidecarReachable: true }, phase: "connected" },
  { name: "QR ready", ok: true, body: { status: "qr", hasQr: true, sidecarReachable: true }, snapshot: { status: "qr", hasQr: true, sidecarReachable: true }, phase: "qr-ready" },
  { name: "unknown status word", ok: true, body: { status: "weird", sidecarReachable: true }, snapshot: { status: null, hasQr: false, sidecarReachable: true }, phase: "starting" },
  { name: "200 with a non-object body", ok: true, body: "oops", snapshot: { status: null, hasQr: false, sidecarReachable: true }, phase: "starting" },
];

describe("parseWhatsAppStatusResponse", () => {
  it.each(cases)("$name", ({ ok, body, snapshot, phase }) => {
    const parsed = parseWhatsAppStatusResponse(ok, body);
    expect(parsed).toEqual(snapshot);
    expect(deriveWhatsAppPairingPhase(parsed)).toBe(phase);
  });
});

describe("isWhatsAppReportedConnected (the onboarding checklist)", () => {
  it("is true only for a reachable helper that says connected", () => {
    expect(isWhatsAppReportedConnected({ status: "connected", sidecarReachable: true })).toBe(true);
    expect(isWhatsAppReportedConnected({ status: "connected" })).toBe(true);
  });
  it("is false for 200 + sidecarReachable:false, even if it says connected", () => {
    expect(isWhatsAppReportedConnected({ status: "connected", sidecarReachable: false })).toBe(false);
    expect(isWhatsAppReportedConnected({ status: "disconnected", sidecarReachable: false })).toBe(false);
  });
  it("is false for anything unreadable", () => {
    expect(isWhatsAppReportedConnected(null)).toBe(false);
    expect(isWhatsAppReportedConnected("connected")).toBe(false);
    expect(isWhatsAppReportedConnected({})).toBe(false);
  });
});
