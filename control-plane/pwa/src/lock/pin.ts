import { base64Decode, base64Encode, timingSafeEqualBytes, utf8Encode } from "../../../../src/lib/connected-platform/web";
import { toArrayBuffer } from "../../../../src/lib/connected-platform/web/bytes";
import { isValidPin } from "./state";

// The pin is a screen lock, not a vault: only a salted hash is stored, and the
// real protection of the keys is that they are not extractable.
export type PinRecord = Readonly<{ v: 1; salt: string; hash: string; iterations: number }>;
export const DEFAULT_ITERATIONS = 210_000;
type Options = Readonly<{ iterations?: number }>;

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toArrayBuffer(utf8Encode(pin)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: toArrayBuffer(salt), iterations }, key, 256));
}
export async function createPinRecord(pin: string, options: Options = {}): Promise<PinRecord> {
  if (!isValidPin(pin)) throw new Error("invalid_pin");
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { v: 1, salt: base64Encode(salt), hash: base64Encode(await derive(pin, salt, iterations)), iterations };
}
export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const salt = base64Decode(record.salt); const want = base64Decode(record.hash);
  if (!salt || !want) return false;
  return timingSafeEqualBytes(await derive(pin, salt, record.iterations), want);
}
