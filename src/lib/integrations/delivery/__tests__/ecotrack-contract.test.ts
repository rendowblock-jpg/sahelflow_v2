import { describe, expect, it } from "vitest";

import {
  ECOTRACK_BUSINESS_ERRORS,
  ECOTRACK_RECONCILE_MAX_PAGES,
  ECOTRACK_RATE_LIMIT_MESSAGE,
  ECOTRACK_V1_CREATE_PATH,
  buildEcotrackBulkBody,
  buildEcotrackCreateQuery,
  flattenErrorBag,
  isEcotrackV1CreateUrl,
  parseEcotrackBulkTrackingResponse,
  parseEcotrackFailure,
} from "../ecotrack-contract";

describe("EcoTrack v1 dialect detection", () => {
  it("matches the canonical create path on any HTTPS tenant origin", () => {
    expect(isEcotrackV1CreateUrl("https://packers.ecotrack.dz/api/v1/create/order")).toBe(true);
    expect(isEcotrackV1CreateUrl("https://ecotrack.dz/api/v1/create/order")).toBe(true);
  });

  it("rejects non-v1 shapes (NOEST-profile URLs stay on the historical dialect)", () => {
    expect(isEcotrackV1CreateUrl("https://app.noest-dz.com/api/public/create/order")).toBe(false);
    expect(isEcotrackV1CreateUrl("https://packers.ecotrack.dz/api/v1/get/orders")).toBe(false);
    expect(isEcotrackV1CreateUrl("http://packers.ecotrack.dz/api/v1/create/order")).toBe(false);
    expect(isEcotrackV1CreateUrl("not a url")).toBe(false);
    expect(isEcotrackV1CreateUrl(undefined)).toBe(false);
    expect(isEcotrackV1CreateUrl(null)).toBe(false);
    expect(isEcotrackV1CreateUrl("   ")).toBe(false);
  });

  it("pins the contract constants", () => {
    expect(ECOTRACK_V1_CREATE_PATH).toBe("/api/v1/create/order");
    expect(ECOTRACK_RATE_LIMIT_MESSAGE).toBe("Too Many Attempts.");
    expect(ECOTRACK_RECONCILE_MAX_PAGES).toBe(10);
    expect(Object.keys(ECOTRACK_BUSINESS_ERRORS).sort()).toEqual([
      "10001",
      "10002",
      "10003",
    ]);
  });
});

describe("buildEcotrackCreateQuery (query-param create contract)", () => {
  it("carries every required field and defaults type to 1 (Livraison)", () => {
    const params = buildEcotrackCreateQuery({
      nomClient: "Client Test",
      telephone: "0551234500",
      adresse: "1 rue",
      codeWilaya: 16,
      commune: "Hydra",
      montant: 2500,
    });
    expect(Object.fromEntries(params)).toEqual({
      nom_client: "Client Test",
      telephone: "0551234500",
      adresse: "1 rue",
      code_wilaya: "16",
      commune: "Hydra",
      montant: "2500",
      type: "1",
    });
  });

  it("carries the optional fields only when present, with stop-desk as 1/0", () => {
    const params = buildEcotrackCreateQuery({
      nomClient: "Client Test",
      telephone: "0551234500",
      adresse: "1 rue",
      codeWilaya: 16,
      commune: "Hydra",
      montant: 2500,
      type: 4,
      telephone2: "0661234500",
      reference: "ORDER-1",
      codePostal: "16005",
      stopDesk: true,
      produit: "Widget x2",
      remarque: "fragile",
      weight: 2,
      fragile: true,
    });
    const entries = Object.fromEntries(params);
    expect(entries.type).toBe("4");
    expect(entries.telephone_2).toBe("0661234500");
    expect(entries.reference).toBe("ORDER-1");
    expect(entries.code_postal).toBe("16005");
    expect(entries.stop_desk).toBe("1");
    expect(entries.fragile).toBe("1");
    expect(entries.weight).toBe("2");
    // Absent optional fields stay absent.
    expect(entries.stock).toBeUndefined();
    expect(entries.boutique).toBeUndefined();
    expect(entries.gps_link).toBeUndefined();
  });
});

describe("buildEcotrackBulkBody (index-string keying quirk)", () => {
  it("keys orders by INDEX STRING, never a JSON array", () => {
    const body = buildEcotrackBulkBody([
      { nom_client: "A" },
      { nom_client: "B" },
    ]);
    expect(body).toEqual({
      orders: {
        "0": { nom_client: "A" },
        "1": { nom_client: "B" },
      },
    });
    expect(Array.isArray(body.orders)).toBe(false);
  });

  it("returns an empty keyed object for no orders", () => {
    expect(buildEcotrackBulkBody([])).toEqual({ orders: {} });
  });
});

describe("parseEcotrackBulkTrackingResponse (defensive, match-to-requested-only)", () => {
  it("absorbs array rows carrying a tracking field, matching requested only", () => {
    const entries = parseEcotrackBulkTrackingResponse(
      [
        { tracking: "TRK-1", status: "en_livraison" },
        { tracking: "TRK-OTHER", status: "livre" },
      ],
      ["TRK-1"],
    );
    expect(entries).toEqual([
      { tracking: "TRK-1", status: "en_livraison", activity: undefined },
    ]);
  });

  it("absorbs object-keyed payloads with or without a data wrapper", () => {
    const direct = parseEcotrackBulkTrackingResponse(
      { "TRK-1": { status: "livre" } },
      ["TRK-1"],
    );
    expect(direct).toEqual([{ tracking: "TRK-1", status: "livre", activity: undefined }]);

    const wrapped = parseEcotrackBulkTrackingResponse(
      { data: { "TRK-2": { status: "annule", activity: [{ status: "returned" }] } } },
      ["TRK-2"],
    );
    expect(wrapped).toEqual([
      { tracking: "TRK-2", status: "annule", activity: [{ status: "returned" }] },
    ]);
  });

  it("never attaches a row positionally — unrequested trackings are dropped", () => {
    const entries = parseEcotrackBulkTrackingResponse(
      [{ tracking: "UNKNOWN-1", status: "livre" }],
      ["REQUESTED-1"],
    );
    expect(entries).toEqual([]);
  });

  it("tolerates null, scalar and empty payloads", () => {
    expect(parseEcotrackBulkTrackingResponse(null, ["TRK-1"])).toEqual([]);
    expect(parseEcotrackBulkTrackingResponse("oops", ["TRK-1"])).toEqual([]);
    expect(parseEcotrackBulkTrackingResponse({}, ["TRK-1"])).toEqual([]);
  });
});

describe("parseEcotrackFailure (the three recorded failure styles)", () => {
  it("types the 50/min rate limit from the status or the exact Laravel message", () => {
    expect(parseEcotrackFailure(429, {})).toMatchObject({ kind: "rate_limit" });
    expect(
      parseEcotrackFailure(200, { message: ECOTRACK_RATE_LIMIT_MESSAGE }),
    ).toMatchObject({ kind: "rate_limit" });
  });

  it("types HTTP-200 business failures with the recorded code names", () => {
    for (const [code, name] of Object.entries(ECOTRACK_BUSINESS_ERRORS)) {
      const failure = parseEcotrackFailure(200, { success: false, error: Number(code) });
      expect(failure.kind).toBe("business");
      expect(failure.errorCode).toBe(Number(code));
      expect(failure.message).toContain(`EcoTrack ${code}`);
      expect(failure.message).toContain(name!);
    }
  });

  it("flattens Laravel 422 validation bags", () => {
    const failure = parseEcotrackFailure(422, {
      message: "The given data was invalid.",
      errors: { telephone: ["Le téléphone est invalide"], commune: ["La commune est requise"] },
    });
    expect(failure.kind).toBe("validation");
    expect(failure.message).toContain("telephone: Le téléphone est invalide");
    expect(failure.message).toContain("commune: La commune est requise");
  });

  it("falls back to a plain http failure", () => {
    const failure = parseEcotrackFailure(500, null);
    expect(failure.kind).toBe("http");
    expect(failure.message).toContain("HTTP 500");
  });
});

describe("flattenErrorBag (both recorded shapes)", () => {
  it("flattens Laravel Record<field, string|string[]> bags", () => {
    expect(flattenErrorBag({ tel: ["bad"], name: ["required", "short"] })).toBe(
      "tel: bad | name: required, short",
    );
  });

  it("flattens ZR-style ASP.NET error arrays", () => {
    expect(
      flattenErrorBag([
        { code: "NameRequired", description: "Name is required" },
        { code: "DescriptionRequired", description: "Description is required" },
      ]),
    ).toBe("Name is required | Description is required");
  });

  it("returns null for empty or absent bags", () => {
    expect(flattenErrorBag(undefined)).toBeNull();
    expect(flattenErrorBag([])).toBeNull();
    expect(flattenErrorBag({})).toBeNull();
  });
});
