/**
 * One CSV field escaper for every export path (S03c-18).
 *
 * Spreadsheet formula injection (SEC-010): a text value that starts with
 * `=`, `+`, `-`, `@`, TAB or CR can be evaluated by Excel/LibreOffice, so
 * free text gets a leading apostrophe. The guard used to touch EVERY such
 * value, which also rewrote legitimate data: phone numbers written
 * `+213555123456` and negative amounts such as `-1500` came out as `'+213...`
 * and `'-1500`.
 *
 * A value that is strictly numeric or phone-shaped (an optional sign followed
 * by digits, spaces and dots) cannot contain a function call, a cell
 * reference, a pipe or a second operator, so it is left untouched. Anything
 * else that starts with a trigger character is still neutralised.
 */

/** Characters a spreadsheet may treat as the start of a formula. */
const FORMULA_TRIGGER = /^[=+@\t\r-]/;

/** Optional sign, then digits, spaces and dots only: `+213 555 12 34 56`, `-1500`, `-12.5`. */
const NUMERIC_OR_PHONE = /^[+-]?[0-9][0-9 .]*$/;

/** Prefix an apostrophe to a value a spreadsheet could execute as a formula. */
export function neutralizeCsvFormula(value: string): string {
  if (!FORMULA_TRIGGER.test(value)) return value;
  if (NUMERIC_OR_PHONE.test(value)) return value;
  return `'${value}`;
}

/** Neutralise formulas, then quote per RFC 4180 when the field needs it. */
export function csvEscapeField(value: string): string {
  const sanitized = neutralizeCsvFormula(value);
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}
