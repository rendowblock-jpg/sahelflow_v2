/**
 * Pure logic of the browser order form. No DOM here, so it is unit-tested in Node and
 * checked against the app's own rules (phone) instead of being trusted.
 */

export type Mode = "home" | "desk";
/** Per wilaya code: [home fee, desk fee]; null means that mode is not offered there. */
export type FeeTable = Record<string, [number | null, number | null]>;

export function asciiDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}

/** Same result as the app's normalizeDZPhone for ASCII input; also reads Arabic-Indic digits. */
export function normalizePhone(raw: string): string {
  const digits = asciiDigits(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  let national: string;
  if (digits.startsWith("00213")) national = digits.slice(5);
  else if (digits.startsWith("213")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits;
  return `0${national}`;
}

/** "0555123456" -> "05 55 12 34 56", the way Algerians write a number. */
export function formatPhone(national: string): string {
  return national.replace(/\D/g, "").replace(/(\d{2})(?=\d)/g, "$1 ");
}

export function isValidPhone(raw: string): boolean {
  return /^0[5-7]\d{8}$/.test(normalizePhone(raw));
}

export function feeFor(fees: FeeTable, wilaya: string, mode: Mode): number | null {
  const row = fees[wilaya];
  if (!row) return null;
  const value = mode === "home" ? row[0] : row[1];
  return typeof value === "number" ? value : null;
}

export function availableModes(fees: FeeTable, wilaya: string): Mode[] {
  return (["home", "desk"] as const).filter((mode) => feeFor(fees, wilaya, mode) !== null);
}

export function totals(unit: number, quantity: number, fee: number | null): { subtotal: number; shipping: number | null; total: number } {
  const subtotal = unit * quantity;
  return { subtotal, shipping: fee, total: subtotal + (fee ?? 0) };
}

export function clampQuantity(wanted: number, remaining: number, hardMax = 50): number {
  const max = Math.max(1, Math.min(remaining, hardMax));
  if (!Number.isFinite(wanted)) return 1;
  return Math.min(max, Math.max(1, Math.trunc(wanted)));
}

/** "ck_" + 24 hex characters: satisfies the Worker's idempotency key pattern. */
export function newIdempotencyKey(bytes: Uint8Array): string {
  let hex = "";
  for (let index = 0; index < 12; index += 1) hex += (bytes[index] ?? 0).toString(16).padStart(2, "0");
  return `ck_${hex}`;
}

/** What makes two submits "the same order": a retry must resend the stored request, not a new one. */
export function orderSignature(parts: readonly (string | number)[]): string {
  return parts.join("\u241f");
}

export type FieldErrors = Partial<Record<"name" | "phone" | "wilaya" | "commune" | "address" | "mode", true>>;

export function validate(values: { name: string; phone: string; wilaya: string; commune: string; address: string; mode: Mode | null }): FieldErrors {
  const errors: FieldErrors = {};
  if (values.name.trim().length < 2) errors.name = true;
  if (!isValidPhone(values.phone)) errors.phone = true;
  if (!values.wilaya) errors.wilaya = true;
  if (!values.commune) errors.commune = true;
  // A stop-desk buyer collects at the courier's desk and has no street address to give.
  if (values.mode !== "desk" && values.address.trim().length < 5) errors.address = true;
  if (!values.mode) errors.mode = true;
  return errors;
}

/** The short reference a buyer can quote on WhatsApp. */
export function shortRef(receiptId: string): string {
  return receiptId.replace(/^rcpt_/, "").slice(-8).toUpperCase();
}
