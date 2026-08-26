import { describe, expect, it } from "vitest";

import {
  nativeDeliverySchema,
  notificationPreferenceSchema,
  notificationQuerySchema,
} from "../contracts";
import { isSafeNotificationLink } from "../native-client";

describe("notification input contracts", () => {
  it("bounds filters, pages, retention, and paired quiet hours", () => {
    expect(notificationQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(() => notificationQuerySchema.parse({ limit: "51" })).toThrow();
    expect(() =>
      notificationPreferenceSchema.parse({ quietStartMinute: 1320 }),
    ).toThrow();
    expect(
      notificationPreferenceSchema.parse({
        quietStartMinute: 1320,
        quietEndMinute: 480,
        retentionDays: 90,
      }),
    ).toMatchObject({ quietStartMinute: 1320, quietEndMinute: 480 });
  });

  it("accepts only reviewed PII-free native completion reason codes", () => {
    expect(
      nativeDeliverySchema.parse({
        action: "complete",
        state: "suppressed",
        reasonCode: "foreground",
      }),
    ).toMatchObject({ state: "suppressed", reasonCode: "foreground" });
    expect(() =>
      nativeDeliverySchema.parse({
        action: "complete",
        state: "failed",
        reasonCode: "customer-phone-0555",
      }),
    ).toThrow();
  });

  it("allows only exact Inbox conversation deep links", () => {
    expect(isSafeNotificationLink("/inbox?conversation=abc_123")).toBe(true);
    expect(isSafeNotificationLink("https://example.com/inbox?conversation=x")).toBe(false);
    expect(isSafeNotificationLink("/orders/abc")).toBe(false);
    expect(isSafeNotificationLink("/inbox?conversation=x&next=https://evil.test")).toBe(false);
  });
});
