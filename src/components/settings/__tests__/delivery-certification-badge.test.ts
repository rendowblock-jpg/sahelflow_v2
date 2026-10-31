import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  deliveryCredentialBadge,
  deliveryIsExperimental,
} from "../delivery-credentials-panel";

describe("delivery certification badge", () => {
  it("shows a checked connection instead of Certified when booking is only source-reviewed", () => {
    expect(deliveryCredentialBadge({
      connectionStatus: "certified",
      bookingStatus: "source_reviewed",
      registryStatus: "live",
    })).toBe("connection_checked");
    expect(deliveryCredentialBadge({
      connectionStatus: "certified",
      bookingStatus: "certified",
      registryStatus: "live",
    })).toBe("certified");
    // The registry has the last word: a stored "certified" does not show while the courier is only in testing.
    expect(deliveryCredentialBadge({
      connectionStatus: "certified",
      bookingStatus: "certified",
      registryStatus: "testing",
    })).toBe("connection_checked");

    const route = readFileSync(
      join(process.cwd(), "src/app/api/delivery/test-connection/route.ts"),
      "utf8",
    );
    expect(route).toContain("connectionChecked: result.ok");
    expect(route).toContain("certified: false");
    expect(route).not.toContain("certified: result.ok");
    expect(route).not.toContain("delivery.provider.certified");
  });

  it("marks a courier whose booking is only source-reviewed as experimental, and not a live-certified one", () => {
    expect(deliveryIsExperimental({ bookingStatus: "source_reviewed" })).toBe(true);
    expect(deliveryIsExperimental({ bookingStatus: "certified" })).toBe(false);
    expect(deliveryIsExperimental({ bookingStatus: undefined })).toBe(false);
  });

  it("renders the experimental badge and its hint in the panel, with the keys in all three languages", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/components/settings/delivery-credentials-panel.tsx"),
      "utf8",
    );
    expect(panel).toContain('t("integrations.experimental")');
    expect(panel).toContain('t("integrations.experimentalHint")');
    for (const locale of ["ar", "fr", "en"]) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), `src/lib/i18n/locales/${locale}.json`), "utf8"),
      ) as Record<string, string>;
      expect(messages["integrations.experimental"], locale).toBeTruthy();
      expect(messages["integrations.experimentalHint"], locale).toBeTruthy();
    }
  });
});
