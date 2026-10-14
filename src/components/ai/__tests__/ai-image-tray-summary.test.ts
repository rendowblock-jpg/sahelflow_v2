import { describe, expect, it } from "vitest";

import { screenshotSummary } from "@/components/ai/ai-image-tray";

describe("screenshotSummary", () => {
  it("lists missing phone and wilaya and does not paste the raw invalid values", () => {
    const summary = screenshotSummary({
      order: {
        customerName: "Ahmed",
        phone: "12345",
        wilaya: "Narnia",
        items: [{ productName: "Robe", quantity: 1 }],
      },
      method: "gemini",
      confidence: 0.9,
      isComplete: false,
      missingFields: ["phone", "wilaya"],
    });
    expect(summary).toContain("missing: phone, wilaya");
    expect(summary).not.toContain("12345");
    expect(summary).not.toContain("Narnia");
    expect(summary).not.toMatch(/^phone:/m);
    expect(summary).not.toMatch(/^wilaya:/m);
  });

  it("pastes a canonical phone and official wilaya", () => {
    const summary = screenshotSummary({
      order: {
        phone: "0555123456",
        wilaya: "Alger",
        items: [{ productName: "Robe", quantity: 1 }],
      },
      method: "gemini",
      confidence: 0.9,
      isComplete: true,
    });
    expect(summary).toContain("phone: 0555123456");
    expect(summary).toContain("wilaya: Alger");
    expect(summary).not.toContain("missing:");
  });
});
