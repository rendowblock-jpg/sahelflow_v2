import { describe, expect, it } from "vitest";

import { normalizeInboxMessageDirection } from "@/lib/inbox/message-direction";

describe("normalizeInboxMessageDirection", () => {
  it("preserves current canonical directions", () => {
    expect(normalizeInboxMessageDirection("inbound")).toBe("inbound");
    expect(normalizeInboxMessageDirection("outbound")).toBe("outbound");
    expect(normalizeInboxMessageDirection("system")).toBe("system");
  });

  it("maps retained legacy directions to the canonical sides", () => {
    expect(normalizeInboxMessageDirection("incoming")).toBe("inbound");
    expect(normalizeInboxMessageDirection("outgoing")).toBe("outbound");
  });
});
