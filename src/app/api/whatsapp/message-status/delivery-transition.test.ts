import { describe, expect, it } from "vitest";

import { allowedPriorDeliveryStates } from "./route";

describe("late WhatsApp error receipts", () => {
  it("does not move a sent or delivered message into a retryable failed state", () => {
    const priors = allowedPriorDeliveryStates("failed");
    expect(priors).toEqual([null, "sending"]);
    expect(priors).not.toContain("sent");
    expect(priors).not.toContain("delivered");
    expect(priors).not.toContain("read");
    expect(allowedPriorDeliveryStates("delivered")).toContain("sent");
  });
});
