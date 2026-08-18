import { describe, expect, it } from "vitest";

import { deriveWhatsAppPairingPhase } from "@/components/inbox/whatsapp-pairing-state";

describe("deriveWhatsAppPairingPhase", () => {
  it("treats an unreachable sidecar as unavailable regardless of stale status", () => {
    expect(
      deriveWhatsAppPairingPhase({
        status: "qr",
        hasQr: true,
        sidecarReachable: false,
      }),
    ).toBe("unavailable");
  });

  it("only declares QR ready when the sidecar confirms a current QR", () => {
    expect(
      deriveWhatsAppPairingPhase({
        status: "qr",
        hasQr: false,
        sidecarReachable: true,
      }),
    ).toBe("waiting-qr");
    expect(
      deriveWhatsAppPairingPhase({
        status: "qr",
        hasQr: true,
        sidecarReachable: true,
      }),
    ).toBe("qr-ready");
  });

  it("promotes connected state independently of QR state", () => {
    expect(
      deriveWhatsAppPairingPhase({
        status: "connected",
        hasQr: false,
        sidecarReachable: true,
      }),
    ).toBe("connected");
  });
});
