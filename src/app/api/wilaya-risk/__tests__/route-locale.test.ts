import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ assessOrderRisk: vi.fn() }));

vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/db", () => ({ db: {}, shopContext: {} }));
vi.mock("@/lib/wilaya-risk/engine", () => ({
  assessOrderRisk: harness.assessOrderRisk,
  listWilayaRisks: vi.fn(),
  seedWilayaRiskProfiles: vi.fn(),
}));

import { GET } from "../route";

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/wilaya-risk?${query}`));
}

describe("GET /api/wilaya-risk locale", () => {
  beforeEach(() => harness.assessOrderRisk.mockReset().mockResolvedValue({ level: 3 }));

  it("passes a supported locale to the engine", async () => {
    await get("wilaya=Oran&locale=ar");
    expect(harness.assessOrderRisk.mock.calls[0]?.[2]).toBe("ar");
  });

  it("falls back to French for a missing or unknown locale", async () => {
    await get("wilaya=Oran");
    await get("wilaya=Oran&locale=xx");
    expect(harness.assessOrderRisk.mock.calls.map((call) => call[2])).toEqual(["fr", "fr"]);
  });
});
