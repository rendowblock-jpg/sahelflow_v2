import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { deliveryCredentialBadge } from "../delivery-credentials-panel";

describe("delivery certification badge", () => {
  it("shows a checked connection instead of Certified when booking is only source-reviewed", () => {
    expect(deliveryCredentialBadge({
      connectionStatus: "certified",
      bookingStatus: "source_reviewed",
    })).toBe("connection_checked");
    expect(deliveryCredentialBadge({
      connectionStatus: "certified",
      bookingStatus: "certified",
    })).toBe("certified");

    const route = readFileSync(
      join(process.cwd(), "src/app/api/delivery/test-connection/route.ts"),
      "utf8",
    );
    expect(route).toContain("connectionChecked: result.ok");
    expect(route).toContain("certified: false");
    expect(route).not.toContain("certified: result.ok");
    expect(route).not.toContain("delivery.provider.certified");
  });
});
