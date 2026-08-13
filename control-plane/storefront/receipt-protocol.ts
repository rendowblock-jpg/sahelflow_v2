const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const STOREFRONT_RECEIPT_CIPHER_VERSION = 1 as const;

export type StorefrontReceiptAad = Readonly<{
  storefrontId: string;
  releaseId: string;
  idempotencyKey: string;
  wilayaCode: string;
  deliveryMode: "home" | "desk";
}>;

export type StorefrontCustomerCiphertext = Readonly<{
  v: typeof STOREFRONT_RECEIPT_CIPHER_VERSION;
  iv: string;
  ciphertext: string;
  aadDigest: string;
}>;

export function storefrontReceiptAadValue(input: StorefrontReceiptAad): string {
  return [
    "sahelflow-storefront-receipt-v1",
    input.storefrontId,
    input.releaseId,
    input.idempotencyKey,
    input.wilayaCode,
    input.deliveryMode,
  ].join("\n");
}

function decodedLength(value: string): number {
  try {
    return atob(value).length;
  } catch {
    return -1;
  }
}

export function parseStorefrontCustomerCiphertext(
  value: string,
): StorefrontCustomerCiphertext | null {
  if (!BASE64.test(value) || value.length < 32 || value.length > 64 * 1024) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(value)) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const sealed = parsed as Record<string, unknown>;
  if (
    Object.keys(sealed).length !== 4 ||
    sealed.v !== STOREFRONT_RECEIPT_CIPHER_VERSION ||
    typeof sealed.iv !== "string" || !BASE64.test(sealed.iv) || decodedLength(sealed.iv) !== 12 ||
    typeof sealed.ciphertext !== "string" || !BASE64.test(sealed.ciphertext) ||
    decodedLength(sealed.ciphertext) < 17 || decodedLength(sealed.ciphertext) > 48 * 1024 ||
    typeof sealed.aadDigest !== "string" || !/^[0-9a-f]{64}$/.test(sealed.aadDigest)
  ) return null;
  return {
    v: STOREFRONT_RECEIPT_CIPHER_VERSION,
    iv: sealed.iv,
    ciphertext: sealed.ciphertext,
    aadDigest: sealed.aadDigest,
  };
}
