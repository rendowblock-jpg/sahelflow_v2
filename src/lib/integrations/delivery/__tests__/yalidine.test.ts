/**
 * Yalidine adapter contract pins — corrected against the live-proven CodFlow
 * Yalidine integration (github.com/bighadj22/codflow @ 00f18fa, Apache-2.0).
 *
 * This file pins the PURE units: adapter metadata, the verbatim 36-status
 * table (yalidine-status.ts) and the geo-name matching helpers
 * (yalidine-geo.ts). Adapter/HTTP behavior is pinned in yalidine-deep.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  mapYalidineStatus,
  YALIDINE_DOCUMENTED_STATUSES,
} from "../yalidine-status";
import {
  normalizeGeoName,
  isNearVariant,
  matchCommuneName,
} from "../yalidine-geo";
import { yalidineAdapter } from "../yalidine";

const RETURNED_FAMILY = [
  "Retourné au vendeur",
  "Retour vers vendeur",
  "Retour non retiré",
  "Colis abandonné",
  "Echange échoué",
  "Echèc livraison",
];

const TRANSIT_NOOPS = [
  "Pas encore expédié",
  "A vérifier",
  "En préparation",
  "Pas encore ramassé",
  "Prêt à expédier",
  "En passation",
  "Ramassé",
  "Bloqué",
  "Débloqué",
  "Transfert",
  "Expédié",
  "Centre",
  "En localisation",
  "Vers Wilaya",
  "En transit",
  "Reçu à Wilaya",
  "En attente du client",
  "Prêt pour livreur",
  "En attente",
  "En alerte",
  "Alerte résolue",
  "Retour vers centre",
  "Retourné au centre",
  "Retour transfert",
  "Retour groupé",
  "Retour à retirer",
];

describe("Yalidine delivery adapter", () => {
  describe("metadata", () => {
    it("has correct id, name, and logo", () => {
      expect(yalidineAdapter.id).toBe("yalidine");
      expect(yalidineAdapter.name).toBeTruthy();
      expect(yalidineAdapter.logo).toBeTruthy();
    });

    it("exposes estimateCost, createShipment, syncTracking as functions", () => {
      expect(typeof yalidineAdapter.estimateCost).toBe("function");
      expect(typeof yalidineAdapter.createShipment).toBe("function");
      expect(typeof yalidineAdapter.syncTracking).toBe("function");
    });
  });
});

describe("mapYalidineStatus — the live-proven 36-status table", () => {
  it("maps Livré → delivered (terminal)", () => {
    expect(mapYalidineStatus("Livré")).toEqual({
      status: "delivered",
      noop: false,
      attempts: "none",
      terminal: true,
    });
  });

  it("maps Annulé → failed (terminal): no cancelled state, cancelled never delivers", () => {
    expect(mapYalidineStatus("Annulé")).toEqual({
      status: "failed",
      noop: false,
      attempts: "none",
      terminal: true,
    });
  });

  for (const raw of RETURNED_FAMILY) {
    it(`maps return-family "${raw}" → returned (terminal)`, () => {
      expect(mapYalidineStatus(raw)).toEqual({
        status: "returned",
        noop: false,
        attempts: "none",
        terminal: true,
      });
    });
  }

  it("maps Sorti en livraison → out_for_delivery (not terminal)", () => {
    expect(mapYalidineStatus("Sorti en livraison")).toEqual({
      status: "out_for_delivery",
      noop: false,
      attempts: "none",
      terminal: false,
    });
  });

  it("maps Tentative échouée → out_for_delivery with attempts increment", () => {
    expect(mapYalidineStatus("Tentative échouée")).toEqual({
      status: "out_for_delivery",
      noop: false,
      attempts: "increment",
      terminal: false,
    });
  });

  for (const raw of TRANSIT_NOOPS) {
    it(`maps transit "${raw}" → deliberate no-op`, () => {
      expect(mapYalidineStatus(raw)).toEqual({
        status: null,
        noop: true,
        attempts: "none",
        terminal: false,
      });
    });
  }

  it("falls back to case-insensitive matching", () => {
    expect(mapYalidineStatus("livré").status).toBe("delivered");
    expect(mapYalidineStatus("ANNULÉ").status).toBe("failed");
    expect(mapYalidineStatus("sorti en livraison").status).toBe(
      "out_for_delivery",
    );
  });

  it("trims surrounding whitespace before exact matching", () => {
    expect(mapYalidineStatus("  Livré  ").status).toBe("delivered");
    expect(mapYalidineStatus("\tRamassé\n").noop).toBe(true);
  });

  it("leaves unknown strings UNMAPPED (never guesses)", () => {
    expect(mapYalidineStatus("Non livré")).toEqual({
      status: null,
      noop: false,
      attempts: "none",
      terminal: false,
    });
    expect(mapYalidineStatus("Zombie status")).toEqual({
      status: null,
      noop: false,
      attempts: "none",
      terminal: false,
    });
  });

  it("leaves empty strings UNMAPPED", () => {
    expect(mapYalidineStatus("")).toEqual({
      status: null,
      noop: false,
      attempts: "none",
      terminal: false,
    });
  });

  it("carries exactly the 36 documented statuses", () => {
    expect(YALIDINE_DOCUMENTED_STATUSES).toHaveLength(36);
    expect(new Set(YALIDINE_DOCUMENTED_STATUSES)).toEqual(
      new Set([
        "Livré",
        "Annulé",
        ...RETURNED_FAMILY,
        "Sorti en livraison",
        "Tentative échouée",
        ...TRANSIT_NOOPS,
      ]),
    );
  });
});

describe("yalidine-geo — commune name matching (CodFlow port)", () => {
  it("normalizeGeoName strips accents, case, spaces, hyphens, apostrophes, periods", () => {
    expect(normalizeGeoName("Béchar")).toBe("bechar");
    expect(normalizeGeoName("Aïn Taya")).toBe("aintaya");
    expect(normalizeGeoName("L'Arbaa")).toBe("larbaa");
    expect(normalizeGeoName("El-Bayadh.")).toBe("elbayadh");
    expect(normalizeGeoName("Draâ Errich")).toBe("draaerrich");
  });

  it("isNearVariant accepts a single insertion (Aghbal ↔ Aghabal)", () => {
    expect(isNearVariant("aghbal", "aghabal")).toBe(true);
    expect(isNearVariant("aghabal", "aghbal")).toBe(true);
  });

  it("isNearVariant accepts a single same-length substitution (Abou El Hassen ↔ Abou El Hassan)", () => {
    expect(isNearVariant("abouelhassen", "abouelhassan")).toBe(true);
  });

  it("isNearVariant rejects length difference > 1", () => {
    expect(isNearVariant("aghbal", "aghabaalou")).toBe(false);
  });

  it("isNearVariant rejects a different 3-char prefix", () => {
    expect(isNearVariant("bechar", "rechar")).toBe(false);
  });

  it("isNearVariant rejects two or more edits inside a shared prefix", () => {
    expect(isNearVariant("hydraa", "hydrix")).toBe(false);
  });

  it("matchCommuneName phase 1 — exact trim match", () => {
    const list = [
      { _id: 1, name: "Hydra" },
      { _id: 2, name: "Bab Ezzouar" },
    ];
    expect(matchCommuneName(list, " Bab Ezzouar ")).toEqual({
      _id: 2,
      name: "Bab Ezzouar",
    });
  });

  it("matchCommuneName phase 2 — normalized equality (hyphens/punctuation)", () => {
    const list = [{ _id: 5, name: "Bab Ezzouar" }];
    expect(matchCommuneName(list, "bab-ezzouar")?.name).toBe("Bab Ezzouar");
    expect(matchCommuneName(list, "bab ezzouar.")?.name).toBe("Bab Ezzouar");
  });

  it("matchCommuneName phase 2 — accent-insensitive (Bechar ↔ Béchar)", () => {
    const list = [{ _id: 7, name: "Béchar" }];
    expect(matchCommuneName(list, "Bechar")?.name).toBe("Béchar");
  });

  it("matchCommuneName phase 3 — near-variant single-edit spelling", () => {
    const list = [{ _id: 9, name: "Aghabal" }];
    expect(matchCommuneName(list, "Aghbal")?.name).toBe("Aghabal");
  });

  it("matchCommuneName returns null when nothing matches", () => {
    const list = [
      { _id: 1, name: "Hydra" },
      { _id: 2, name: "Bab Ezzouar" },
    ];
    expect(matchCommuneName(list, "Inconnue-sur-Mer")).toBeNull();
  });
});
