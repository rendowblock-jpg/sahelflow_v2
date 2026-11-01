import { describe, expect, it } from "vitest";

import { parseIngressStatusFilter } from "@/lib/whatsapp/ingress-status-filter";
import {
  afterFailedCheck,
  CHECK_FAILED_AFTER,
  checkFailed,
  RECOVERY_REQUEST_PATH,
  RECOVERY_STATUSES,
} from "../recovery-load";

describe("recovery dock request", () => {
  it("asks for the three problem states, by name, in one request", () => {
    const url = new URL(RECOVERY_REQUEST_PATH, "http://localhost");
    expect(url.pathname).toBe("/api/whatsapp/inbound");
    expect(url.searchParams.get("status")?.split(",")).toEqual([...RECOVERY_STATUSES]);
    expect(url.searchParams.get("limit")).toBe("50");
  });

  it("every state it asks for is one the server accepts", () => {
    expect(parseIngressStatusFilter(RECOVERY_STATUSES.join(","))).toEqual({
      in: [...RECOVERY_STATUSES],
    });
  });
});

describe("failed checks in a row", () => {
  it("one miss is a blink, the second is told", () => {
    expect(checkFailed(0)).toBe(false);
    expect(checkFailed(afterFailedCheck(0))).toBe(false);
    expect(checkFailed(afterFailedCheck(afterFailedCheck(0)))).toBe(true);
  });

  it("the count never runs past the limit and never goes below zero", () => {
    let count = 0;
    for (let i = 0; i < 10; i += 1) count = afterFailedCheck(count);
    expect(count).toBe(CHECK_FAILED_AFTER);
    expect(afterFailedCheck(-5)).toBe(1);
  });
});

describe("parseIngressStatusFilter", () => {
  const cases: Array<[string, string | null, unknown]> = [
    ["no parameter", null, undefined],
    ["empty parameter", "", undefined],
    ["one state", "dead_letter", "dead_letter"],
    ["a list", "retrying,quarantined", { in: ["retrying", "quarantined"] }],
    ["spaces and repeats", " retrying , retrying", "retrying"],
  ];
  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(parseIngressStatusFilter(input)).toEqual(expected);
    });
  }

  it("refuses an unknown state anywhere in the list", () => {
    expect(() => parseIngressStatusFilter("retrying,nope")).toThrow();
    expect(() => parseIngressStatusFilter("nope")).toThrow();
    expect(() => parseIngressStatusFilter(" , ")).toThrow();
  });
});
