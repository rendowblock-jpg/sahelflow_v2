import {
  STOREFRONT_RECEIPT_CIPHER_VERSION,
  storefrontReceiptAadValue,
  type StorefrontReceiptAad,
} from "../../../control-plane/storefront/receipt-protocol";

const encoder = new TextEncoder();

function bytesToBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

function exactBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encryptStorefrontCustomer(
  customer: unknown,
  recipientPublicKeyJwk: string,
  binding: StorefrontReceiptAad,
): Promise<Readonly<{ encryptedCustomer: string; wrappedCustomerKey: string }>> {
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(recipientPublicKeyJwk) as JsonWebKey;
  } catch {
    throw new TypeError("Storefront receipt key is invalid");
  }
  if (jwk.kty !== "RSA" || !jwk.n || !jwk.e) {
    throw new TypeError("Storefront receipt key is not RSA");
  }
  const serialized = JSON.stringify(customer);
  if (serialized === undefined) throw new TypeError("Storefront customer payload is not JSON serializable");
  const plaintext = encoder.encode(serialized);
  if (plaintext.byteLength > 32 * 1024) throw new RangeError("Storefront customer payload is too large");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const contentKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aadValue = storefrontReceiptAadValue(binding);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: exactBuffer(iv), additionalData: encoder.encode(aadValue), tagLength: 128 },
    contentKey,
    plaintext,
  );
  const rawContentKey = await crypto.subtle.exportKey("raw", contentKey);
  const wrappedCustomerKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    rawContentKey,
  );
  const sealed = {
    v: STOREFRONT_RECEIPT_CIPHER_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    aadDigest: await sha256Hex(aadValue),
  };
  plaintext.fill(0);
  new Uint8Array(rawContentKey).fill(0);
  return Object.freeze({
    encryptedCustomer: bytesToBase64(encoder.encode(JSON.stringify(sealed))),
    wrappedCustomerKey: bytesToBase64(wrappedCustomerKey),
  });
}
