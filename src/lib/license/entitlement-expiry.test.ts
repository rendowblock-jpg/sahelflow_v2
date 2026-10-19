import { describe, expect, it } from "vitest";

import { entitlementHasExpired, readEntitlementExpiry } from "./entitlement-expiry";

describe("readEntitlementExpiry", () => {
  it("treats null and undefined as 'does not expire'", () => {
    expect(readEntitlementExpiry(null)).toBeNull();
    expect(readEntitlementExpiry(undefined)).toBeNull();
  });

  it("reads the instants the licensing service really issues", () => {
    expect(readEntitlementExpiry("2026-10-26T09:00:00.000Z")).toBe(Date.UTC(2026, 9, 26, 9, 0, 0));
    expect(readEntitlementExpiry("2026-10-26T09:00:00Z")).toBe(Date.UTC(2026, 9, 26, 9, 0, 0));
    expect(readEntitlementExpiry(new Date(Date.UTC(2030, 0, 1)).toISOString())).toBe(Date.UTC(2030, 0, 1));
  });

  it("honours an explicit offset", () => {
    expect(readEntitlementExpiry("2026-10-26T10:00:00+01:00")).toBe(Date.UTC(2026, 9, 26, 9, 0, 0));
    expect(readEntitlementExpiry("2026-10-26T08:00:00-01:00")).toBe(Date.UTC(2026, 9, 26, 9, 0, 0));
  });

  it("refuses text that is not a date, including the empty string", () => {
    for (const bad of ["", " ", "not a date", "tomorrow", "26/10/2026", "Oct 26 2026", "NaN", "null"]) {
      expect(() => readEntitlementExpiry(bad), JSON.stringify(bad)).toThrow(/invalid entitlement expiry/);
    }
  });

  it("refuses values that are not strings", () => {
    for (const bad of [0, 1_800_000_000_000, true, false, {}, [], Number.NaN]) {
      expect(() => readEntitlementExpiry(bad)).toThrow(/invalid entitlement expiry/);
    }
  });

  it("refuses an incomplete instant: a date alone, or no zone", () => {
    for (const bad of ["2026-10-26", "2026-10-26T09:00:00", "2026-10-26T09:00Z", "2026-10-26 09:00:00Z"]) {
      expect(() => readEntitlementExpiry(bad), bad).toThrow(/invalid entitlement expiry/);
    }
  });

  it("refuses moments that do not exist on the calendar", () => {
    for (const bad of [
      "2026-02-31T00:00:00Z",
      "2027-02-29T00:00:00Z",
      "2026-04-31T00:00:00Z",
      "2026-13-01T00:00:00Z",
      "2026-00-10T00:00:00Z",
      "2026-10-00T00:00:00Z",
      "2026-10-26T24:00:00Z",
      "2026-10-26T09:60:00Z",
      "2026-10-26T09:00:60Z",
      "2026-10-26T09:00:00+24:00",
      "2026-10-26T09:00:00+01:60",
    ]) {
      expect(() => readEntitlementExpiry(bad), bad).toThrow(/invalid entitlement expiry/);
    }
  });

  it("knows leap years", () => {
    expect(readEntitlementExpiry("2028-02-29T00:00:00Z")).toBe(Date.UTC(2028, 1, 29));
    expect(readEntitlementExpiry("2000-02-29T00:00:00Z")).toBe(Date.UTC(2000, 1, 29));
    expect(() => readEntitlementExpiry("2100-02-29T00:00:00Z")).toThrow(/invalid entitlement expiry/);
    expect(() => readEntitlementExpiry("2027-02-29T00:00:00Z")).toThrow(/invalid entitlement expiry/);
  });
});

describe("entitlementHasExpired", () => {
  const now = Date.UTC(2026, 9, 19, 12, 0, 0);

  it("is false for a licence that never expires", () => {
    expect(entitlementHasExpired(null, now)).toBe(false);
  });

  it("is false before the expiry and true at and after it", () => {
    expect(entitlementHasExpired("2026-10-19T12:00:01Z", now)).toBe(false);
    expect(entitlementHasExpired("2026-10-19T12:00:00Z", now)).toBe(true);
    expect(entitlementHasExpired("2026-10-19T11:59:59Z", now)).toBe(true);
  });

  it("throws, rather than answering 'not expired', for an unreadable expiry", () => {
    expect(() => entitlementHasExpired("not a date", now)).toThrow(/invalid entitlement expiry/);
    expect(() => entitlementHasExpired("", now)).toThrow(/invalid entitlement expiry/);
  });
});
