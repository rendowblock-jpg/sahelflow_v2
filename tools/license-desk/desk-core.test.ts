import { describe, expect, it } from "vitest";

import { parseActivationInput } from "../../src/lib/license/activation-code";
import { validateSignedEntitlement } from "../../src/lib/license/entitlement";
import { encodeLicenseRequest } from "../../src/lib/license/request-code";
import {
  decodeRequestCode,
  DeskError,
  generateSigningKey,
  keyIdFromFileName,
  keyringVerdict,
  parsePrivateKey,
  publicKeyBase64,
  salesCsv,
  sellerMessage,
  signLicense,
} from "./desk-core";

const REQUEST = {
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
  deviceBinding: `sfdb1_${"3".repeat(64)}`,
  productMajor: 1,
  transferEpoch: 0,
  revocationEpoch: 1,
  recoveryEpoch: 3,
  currentLicenseId: "trial-0123456789",
};

describe("License Desk core", () => {
  it("decodes request codes exactly like the installation encodes them", async () => {
    const code = encodeLicenseRequest(REQUEST);
    await expect(decodeRequestCode(` ${code.slice(0, 30)}\n${code.slice(30)} `)).resolves.toEqual(
      REQUEST,
    );
    await expect(decodeRequestCode(code.replace(/.$/, "0"))).rejects.toBeInstanceOf(DeskError);
    await expect(decodeRequestCode("SFLA1.x.y")).rejects.toThrow(/SFLR1/);
  });

  it("issues a licence the installation accepts", async () => {
    const { privateKeyText, publicKey } = await generateSigningKey();
    const privateKey = parsePrivateKey(privateKeyText);
    const request = await decodeRequestCode(encodeLicenseRequest(REQUEST));
    const issued = await signLicense({
      request,
      extraShops: 1,
      keyId: "permanent-2026-10",
      privateKey,
      issuedAt: new Date("2026-10-08T00:00:00Z"),
    });
    expect(issued.claims.shopSlots).toBe(6);
    const result = await validateSignedEntitlement(
      parseActivationInput(issued.activationCode),
      {
        workspaceId: REQUEST.workspaceId,
        installationId: REQUEST.installationId,
        deviceBinding: REQUEST.deviceBinding,
        appVersion: "1.0.0-internal.42",
        minimumRevocationEpoch: 1,
        now: new Date("2026-10-09T00:00:00Z"),
      },
      { trial: {}, permanent: { "permanent-2026-10": publicKey } },
    );
    expect(result.status).toBe("valid");
    expect(await publicKeyBase64(privateKey)).toBe(publicKey);
  });

  it("reads keygen key files and their key ids", () => {
    expect(parsePrivateKey(`${"AQ".repeat(21)}A=\n`)).toHaveLength(32);
    expect(parsePrivateKey("ab".repeat(32))).toHaveLength(32);
    expect(() => parsePrivateKey("not a key")).toThrow(DeskError);
    expect(keyIdFromFileName("permanent-2026-10.private")).toBe("permanent-2026-10");
    expect(keyIdFromFileName("notes.txt")).toBeNull();
  });

  it("checks the key against the keyring the app was built with", () => {
    expect(keyringVerdict('{"permanent-2026-10":"PUB"}', "permanent-2026-10", "PUB")).toBe("match");
    expect(keyringVerdict('{"a":"X"}{"permanent-2026-10":"PUB"}', "permanent-2026-10", "PUB")).toBe(
      "match",
    );
    expect(keyringVerdict('{"other":"PUB"}', "permanent-2026-10", "PUB")).toBe("missing");
    expect(keyringVerdict('{"permanent-2026-10":"OLD"}', "permanent-2026-10", "PUB")).toBe("different");
    expect(keyringVerdict("nope", "k", "PUB")).toBe("unreadable");
  });

  it("exports a spreadsheet-safe sales ledger", () => {
    const csv = salesCsv([
      {
        issuedAt: "2026-10-08",
        licenseId: "perm-1",
        installation: "2222",
        customer: '=HYPERLINK("x")',
        phone: "+213555",
        paymentReference: "CCP-1",
        extraShops: 0,
        totalDzd: 35000,
        supportEndsAt: "2031-10-08",
      },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"'+213555"`);
  });

  it("writes the seller's reply in their language with the full code", () => {
    expect(sellerMessage("ar", "SFLA1.abc.def", 5)).toContain("SFLA1.abc.def");
    expect(sellerMessage("fr", "SFLA1.abc.def", 6)).toContain("6 boutiques");
  });
});
