import { describe, expect, it } from "vitest";

import { classifyPrRisk } from "../classify-pr-risk";

describe("WhatsApp packaged runtime risk classification", () => {
  it("forces Windows standalone and installed MSI proof for sidecar runtime code", () => {
    for (const path of [
      "sidecars/whatsapp/whatsapp.ts",
      "sidecars/whatsapp/protected-storage-key.ts",
      "sidecars/whatsapp/protected-auth-state.ts",
      "sidecars/whatsapp/inbound-spool-crypto.ts",
    ]) {
      expect(classifyPrRisk([path]), path).toMatchObject({
        runQuality: true,
        runTauri: false,
        runWindowsStandalone: true,
        runWindowsRust: false,
        runInstalledMsi: true,
        runPhase5: true,
        runPhase67: true,
      });
    }
  });

  it("does not force Windows artifacts for sidecar docs or tests alone", () => {
    expect(
      classifyPrRisk([
        "sidecars/whatsapp/README.md",
        "sidecars/whatsapp/protected-auth-state.test.ts",
      ]),
    ).toMatchObject({
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });
});
