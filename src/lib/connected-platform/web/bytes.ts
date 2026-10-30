// Byte helpers that need no Node API: tables instead of Buffer/atob so the same
// code runs in a browser, a worker and the desktop.

const STANDARD = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeTable(alphabet: string): Int16Array {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < alphabet.length; index += 1) table[alphabet.charCodeAt(index)] = index;
  return table;
}

const STANDARD_TABLE = decodeTable(STANDARD);
const URL_TABLE = decodeTable(URL_SAFE);
const UTF8_STRICT = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const UTF8_ENCODER = new TextEncoder();

function encode(bytes: Uint8Array, alphabet: string, pad: boolean): string {
  let out = "";
  const full = bytes.length - (bytes.length % 3);
  for (let index = 0; index < full; index += 3) {
    const n = ((bytes[index] ?? 0) << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    out +=
      alphabet.charAt(n >> 18) +
      alphabet.charAt((n >> 12) & 63) +
      alphabet.charAt((n >> 6) & 63) +
      alphabet.charAt(n & 63);
  }
  const rest = bytes.length - full;
  if (rest === 1) {
    const n = (bytes[full] ?? 0) << 16;
    out += alphabet.charAt(n >> 18) + alphabet.charAt((n >> 12) & 63) + (pad ? "==" : "");
  } else if (rest === 2) {
    const n = ((bytes[full] ?? 0) << 16) | ((bytes[full + 1] ?? 0) << 8);
    out +=
      alphabet.charAt(n >> 18) +
      alphabet.charAt((n >> 12) & 63) +
      alphabet.charAt((n >> 6) & 63) +
      (pad ? "=" : "");
  }
  return out;
}

// Strict and canonical: no whitespace, no foreign alphabet, no stray padding and
// no non-zero trailing bits, so one byte string has exactly one text form.
function decode(value: unknown, table: Int16Array, padded: boolean): Uint8Array | null {
  if (typeof value !== "string") return null;
  let end = value.length;
  if (padded) {
    if (end % 4 !== 0) return null;
    if (end > 0 && value.charCodeAt(end - 1) === 61) end -= 1;
    if (end > 0 && value.charCodeAt(end - 1) === 61) end -= 1;
  } else if (end % 4 === 1) {
    return null;
  }
  const remainder = end & 3;
  const out = new Uint8Array((end >> 2) * 3 + (remainder === 0 ? 0 : remainder - 1));
  let written = 0;
  let accumulator = 0;
  let bits = 0;
  for (let index = 0; index < end; index += 1) {
    const code = value.charCodeAt(index);
    const sextet = code < 128 ? (table[code] ?? -1) : -1;
    if (sextet < 0) return null;
    accumulator = (accumulator << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written] = (accumulator >> bits) & 255;
      written += 1;
      accumulator &= (1 << bits) - 1;
    }
  }
  return accumulator === 0 ? out : null;
}

export function base64Encode(bytes: Uint8Array): string {
  return encode(bytes, STANDARD, true);
}

export function base64Decode(value: string): Uint8Array | null {
  return decode(value, STANDARD_TABLE, true);
}

export function base64UrlEncode(bytes: Uint8Array): string {
  return encode(bytes, URL_SAFE, false);
}

export function base64UrlDecode(value: string): Uint8Array | null {
  return decode(value, URL_TABLE, false);
}

export function utf8Encode(text: string): Uint8Array {
  return UTF8_ENCODER.encode(text);
}

// null on invalid UTF-8; a leading BOM is kept so bytes round-trip.
export function utf8Decode(bytes: Uint8Array): string | null {
  try {
    return UTF8_STRICT.decode(bytes);
  } catch {
    return null;
  }
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Compares the whole of the longer input so timing does not reveal where they differ.
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += (byte < 16 ? "0" : "") + byte.toString(16);
  return out;
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

// WebCrypto wants a plain ArrayBuffer; a copy also detaches us from shared memory.
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function getSubtle(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}
