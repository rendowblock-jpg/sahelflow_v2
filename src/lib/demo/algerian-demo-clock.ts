import "server-only";

export const ALGERIAN_DEMO_HISTORY_DAYS = 365;

/**
 * One clock authority for the rolling sample workspace.
 *
 * Production/demo use follows the current day. Tests and evidence may set
 * SF_DEMO_REFERENCE_NOW to freeze the exact same generator without introducing
 * random fixtures or time-dependent assertions.
 */
export function algerianDemoReferenceNow(): Date {
  const configured = process.env.SF_DEMO_REFERENCE_NOW?.trim();
  const value = configured ? new Date(configured) : new Date();
  if (Number.isNaN(value.getTime())) {
    throw new Error("SF_DEMO_REFERENCE_NOW must be a valid ISO date/time");
  }
  value.setSeconds(0, 0);
  return value;
}

export function demoDaysBefore(
  reference: Date,
  days: number,
  hour = 12,
  minute = 0,
): Date {
  const value = new Date(reference);
  value.setDate(value.getDate() - days);
  value.setHours(hour, minute, 0, 0);
  return value;
}

export function demoHoursAfter(value: Date, hours: number): Date {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

export function demoDaysAfter(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}
