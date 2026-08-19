import "server-only";

export const ALGERIAN_DEMO_HISTORY_DAYS = 365;

/**
 * One clock authority for the rolling sample workspace.
 *
 * Production/demo use follows the current day. Tests and evidence may set
 * SF_DEMO_REFERENCE_NOW to freeze the exact same generator without introducing
 * random fixtures or time-dependent assertions. A date-only freeze represents a
 * completed business day, so `2025-01-01` means the end of that local date rather
 * than midnight before that day's sample business-hour events.
 */
export function algerianDemoReferenceNow(): Date {
  const configured = process.env.SF_DEMO_REFERENCE_NOW?.trim();
  let value: Date;

  if (configured && /^\d{4}-\d{2}-\d{2}$/.test(configured)) {
    const [year, month, day] = configured.split("-").map(Number);
    value = new Date(year!, month! - 1, day!, 23, 59, 0, 0);
  } else {
    value = configured ? new Date(configured) : new Date();
  }

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
