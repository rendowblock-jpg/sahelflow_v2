import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  deriveInstallationKey,
  type InstallationKeyContext,
} from "@/lib/crypto/key-hierarchy";
import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import {
  createProtectedValueKeyDescriptor,
  isProtectedValueEnvelope,
  openProtectedString,
  sealProtectedString,
  type ShopRecordProtectedValueBinding,
} from "@/lib/crypto/protected-value";

const ROOT = Buffer.alloc(32, 0x11);
const WORKSPACE = "10".repeat(16);
const INSTALLATION = "20".repeat(16);
const SHOP_INCARCATION = "30".repeat(16);

function installationContext(
  purpose: InstallationKeyContext["purpose"],
  installationId = INSTALLATION,
): InstallationKeyContext {
  return {
    workspaceId: WORKSPACE,
    installationId,
    purpose,
    version: 1,
  };
}

function binding(
  overrides: Partial<ShopRecordProtectedValueBinding> = {},
): ShopRecordProtectedValueBinding {
  return {
    scope: "shop-record",
    workspaceId: WORKSPACE,
    shopId: "shop-algiers",
    shopIncarnationId: SHOP_INCARCATION,
    recordType: "Customer",
    recordId: "customer-42",
    field: "name",
    ...overrides,
  };
}

function flipCiphertext(encoded: string): string {
  const envelope = JSON.parse(encoded) as { ciphertext: string };
  const ciphertext = Buffer.from(envelope.ciphertext, "base64");
  ciphertext[0] = (ciphertext[0] ?? 0) ^ 0x01;
  envelope.ciphertext = ciphertext.toString("base64");
  return JSON.stringify(envelope);
}

describe("installation key hierarchy", () => {
  it("derives deterministic versioned descriptors", () => {
    const context = installationContext("shop-data-key-wrap");
    const first = deriveInstallationKey(ROOT, context);
    const second = deriveInstallationKey(ROOT, context);

    expect(second.descriptor).toEqual(first.descriptor);
    expect(second.key.equals(first.key)).toBe(true);
    expect(first.descriptor.keyId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("separates purpose, installation, and version", () => {
    const data = deriveInstallationKey(
      ROOT,
      installationContext("shop-data-key-wrap"),
    );
    const blindIndex = deriveInstallationKey(
      ROOT,
      installationContext("shop-blind-index-key-wrap"),
    );
    const replacementInstall = deriveInstallationKey(
      ROOT,
      installationContext("shop-data-key-wrap", "40".repeat(16)),
    );
    const versionTwo = deriveInstallationKey(ROOT, {
      ...installationContext("shop-data-key-wrap"),
      version: 2,
    });

    for (const candidate of [blindIndex, replacementInstall, versionTwo]) {
      expect(candidate.key.equals(data.key)).toBe(false);
      expect(candidate.descriptor.keyId).not.toBe(data.descriptor.keyId);
    }
  });

  it("rejects malformed roots and identities", () => {
    expect(() =>
      deriveInstallationKey(
        Buffer.alloc(16),
        installationContext("control-integrity"),
      ),
    ).toThrow(/256-bit/);
    expect(() =>
      deriveInstallationKey(ROOT, {
        ...installationContext("control-integrity"),
        workspaceId: "not-an-identity",
      }),
    ).toThrow(/Workspace ID/);
  });
});

describe("protected value envelope", () => {
  const key = randomBytes(32);
  const descriptor = createProtectedValueKeyDescriptor(key, "shop-data", 1);

  it("round-trips multilingual seller data under exact record context", () => {
    const plaintext = "Client أمينة — livraison à Oran, 2 500 DA";
    const encoded = sealProtectedString(plaintext, key, descriptor, binding());

    expect(isProtectedValueEnvelope(encoded)).toBe(true);
    expect(openProtectedString(encoded, key, descriptor, binding())).toBe(plaintext);
  });

  it("uses random nonces for repeated plaintext", () => {
    const first = sealProtectedString("same", key, descriptor, binding());
    const second = sealProtectedString("same", key, descriptor, binding());

    expect(first).not.toBe(second);
    expect(openProtectedString(first, key, descriptor, binding())).toBe("same");
    expect(openProtectedString(second, key, descriptor, binding())).toBe("same");
  });

  it("rejects record, field, shop and incarnation substitution", () => {
    const encoded = sealProtectedString("secret", key, descriptor, binding());

    for (const changed of [
      binding({ recordId: "customer-43" }),
      binding({ field: "phone" }),
      binding({ shopId: "shop-oran" }),
      binding({ shopIncarnationId: "50".repeat(16) }),
    ]) {
      expect(() => openProtectedString(encoded, key, descriptor, changed)).toThrowError(
        expect.objectContaining({ code: "PROTECTED_DATA_CONTEXT_MISMATCH" }),
      );
    }
  });

  it("rejects wrong keys and purposes before decryption", () => {
    const encoded = sealProtectedString("secret", key, descriptor, binding());
    const wrongKey = randomBytes(32);
    const wrongDescriptor = createProtectedValueKeyDescriptor(
      wrongKey,
      "shop-data",
      1,
    );
    const wrongPurpose = createProtectedValueKeyDescriptor(
      key,
      "shop-secret",
      1,
    );

    expect(() =>
      openProtectedString(encoded, wrongKey, wrongDescriptor, binding()),
    ).toThrowError(expect.objectContaining({ code: "PROTECTED_DATA_KEY_MISMATCH" }));
    expect(() =>
      openProtectedString(encoded, key, wrongPurpose, binding()),
    ).toThrowError(expect.objectContaining({ code: "PROTECTED_DATA_KEY_MISMATCH" }));
  });

  it("rejects tampering with a typed authentication failure", () => {
    const encoded = sealProtectedString("secret", key, descriptor, binding());

    expect(() =>
      openProtectedString(flipCiphertext(encoded), key, descriptor, binding()),
    ).toThrowError(
      expect.objectContaining({ code: "PROTECTED_DATA_AUTHENTICATION_FAILED" }),
    );
  });

  it("rejects malformed and extension-field envelopes", () => {
    const encoded = sealProtectedString("secret", key, descriptor, binding());
    const withUnknownField = JSON.parse(encoded) as Record<string, unknown>;
    withUnknownField.untrusted = true;

    expect(isProtectedValueEnvelope("not-json")).toBe(false);
    expect(() =>
      openProtectedString("not-json", key, descriptor, binding()),
    ).toThrowError(expect.objectContaining({ code: "PROTECTED_DATA_FORMAT_INVALID" }));
    expect(() => isProtectedValueEnvelope(JSON.stringify(withUnknownField))).toThrowError(
      expect.objectContaining({ code: "PROTECTED_DATA_FORMAT_INVALID" }),
    );
    expect(() =>
      openProtectedString(JSON.stringify(withUnknownField), key, descriptor, binding()),
    ).toThrowError(expect.objectContaining({ code: "PROTECTED_DATA_FORMAT_INVALID" }));
  });

  it("fails closed when migration probes a malformed canonical declaration", () => {
    const malformed = JSON.stringify({
      format: "sahelflow-protected-value",
      version: 1,
      algorithm: "aes-256-gcm",
      key: descriptor,
      bindingSha256: "00".repeat(32),
      iv: Buffer.alloc(12).toString("base64"),
      ciphertext: "",
    });

    expect(() => isProtectedValueEnvelope(malformed)).toThrowError(
      expect.objectContaining({ code: "PROTECTED_DATA_FORMAT_INVALID" }),
    );
  });

  it("uses one typed corruption base class", () => {
    const encoded = sealProtectedString("secret", key, descriptor, binding());

    try {
      openProtectedString(flipCiphertext(encoded), key, descriptor, binding());
      throw new Error("expected corruption failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ProtectedDataCorruptionError);
    }
  });
});
