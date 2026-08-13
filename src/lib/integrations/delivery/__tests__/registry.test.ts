/**
 * Delivery adapter registry tests (T-INTEGRATIONS).
 *
 * Verifies getDeliveryAdapter / listDeliveryAdapters: known providers return
 * the right adapter, unknown providers throw with a helpful message.
 */
import { describe, it, expect } from "vitest";
import { getDeliveryAdapter, listDeliveryAdapters, PROVIDERS } from "../index";
import { yalidineAdapter } from "../yalidine";
import { maystroAdapter } from "../maystro";
import { zrExpressAdapter } from "../zr-express";
import { ecoTrackAdapter } from "../ecotrack";

describe("getDeliveryAdapter", () => {
  it("returns the Yalidine adapter", () => {
    expect(getDeliveryAdapter("yalidine")).toBe(yalidineAdapter);
  });

  it("returns the Maystro adapter", () => {
    expect(getDeliveryAdapter("maystro")).toBe(maystroAdapter);
  });

  it("returns the ZR Express adapter", () => {
    expect(getDeliveryAdapter("zrexpress")).toBe(zrExpressAdapter);
  });

  it("returns the EcoTrack adapter", () => {
    expect(getDeliveryAdapter("ecotrack")).toBe(ecoTrackAdapter);
  });

  it("throws on unknown provider", () => {
    expect(() => getDeliveryAdapter("fedex")).toThrow(/Unknown delivery provider/);
  });

  it("throws on empty string", () => {
    expect(() => getDeliveryAdapter("")).toThrow(/Unknown delivery provider/);
  });

  it("throws on case mismatch", () => {
    expect(() => getDeliveryAdapter("Yalidine")).toThrow(/Unknown delivery provider/);
  });

  it("returned adapters implement the shared contract", () => {
    const adapter = getDeliveryAdapter("yalidine");
    expect(typeof adapter.estimateCost).toBe("function");
    expect(typeof adapter.createShipment).toBe("function");
    expect(typeof adapter.syncTracking).toBe("function");
  });
});

describe("listDeliveryAdapters", () => {
  it("returns the four canonical adapters", () => {
    expect(listDeliveryAdapters().map((adapter) => adapter.id)).toEqual([
      "yalidine",
      "maystro",
      "zrexpress",
      "ecotrack",
    ]);
  });

  it("each adapter has complete metadata and methods", () => {
    for (const adapter of listDeliveryAdapters()) {
      expect(typeof adapter.id).toBe("string");
      expect(typeof adapter.name).toBe("string");
      expect(typeof adapter.logo).toBe("string");
      expect(typeof adapter.estimateCost).toBe("function");
      expect(typeof adapter.createShipment).toBe("function");
      expect(typeof adapter.syncTracking).toBe("function");
    }
  });
});

describe("PROVIDERS constant", () => {
  it("lists all four providers in canonical order", () => {
    expect(PROVIDERS).toEqual([
      "yalidine",
      "maystro",
      "zrexpress",
      "ecotrack",
    ]);
  });
});
