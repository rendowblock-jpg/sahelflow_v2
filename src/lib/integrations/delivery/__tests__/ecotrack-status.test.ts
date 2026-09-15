import { describe, expect, it } from "vitest";

import {
  ECOTRACK_DOCUMENTED_ACTIVITY_KEYS,
  ECOTRACK_DOCUMENTED_STATUS_KEYS,
  mapEcotrackActivityKey,
  mapEcotrackStatusKey,
} from "../ecotrack-status";

describe("EcoTrack status mapping (CodFlow-extracted contract)", () => {
  it("maps the dispatched family onto pre-dispatch machine states", () => {
    for (const key of [
      "prete_a_expedier",
      "prete_a_preparer",
      "en_preparation_stock",
      "en_preparation",
    ]) {
      expect(mapEcotrackStatusKey(key)).toBe("created");
    }
    expect(mapEcotrackStatusKey("en_ramassage")).toBe("picked_up");
    expect(mapEcotrackStatusKey("vers_hub")).toBe("in_transit");
    expect(mapEcotrackStatusKey("en_hub")).toBe("at_hub");
    expect(mapEcotrackStatusKey("vers_wilaya")).toBe("in_transit");
  });

  it("maps en_livraison to out_for_delivery", () => {
    expect(mapEcotrackStatusKey("en_livraison")).toBe("out_for_delivery");
  });

  it("maps the delivered family to the terminal delivered state", () => {
    for (const key of [
      "livre_non_encaisse",
      "encaisse_non_paye",
      "paiements_prets",
      "paye_et_archive",
    ]) {
      expect(mapEcotrackStatusKey(key)).toBe("delivered");
    }
  });

  it("keeps suspendu a log-only no-op (a suspension can resume)", () => {
    expect(mapEcotrackStatusKey("suspendu")).toBeNull();
  });

  it("maps the returned family to the terminal returned state", () => {
    for (const key of [
      "retour_chez_livreur",
      "retour_transit_entrepot",
      "retour_en_traitement",
      "retour_recu",
      "retour_archive",
    ]) {
      expect(mapEcotrackStatusKey(key)).toBe("returned");
    }
  });

  it("lands annule on failed — the machine has no cancelled state", () => {
    expect(mapEcotrackStatusKey("annule")).toBe("failed");
  });

  it("maps the activity keys through the same machine", () => {
    expect(mapEcotrackActivityKey("order_information_received_by_carrier")).toBe("created");
    expect(mapEcotrackActivityKey("notification_on_order")).toBeNull();
    expect(mapEcotrackActivityKey("picked")).toBe("picked_up");
    expect(mapEcotrackActivityKey("accepted_by_carrier")).toBe("in_transit");
    expect(mapEcotrackActivityKey("dispatched_to_driver")).toBe("out_for_delivery");
    expect(mapEcotrackActivityKey("attempt_delivery")).toBe("out_for_delivery");
    expect(mapEcotrackActivityKey("return_asked")).toBe("returned");
    expect(mapEcotrackActivityKey("return_in_transit")).toBe("returned");
    expect(mapEcotrackActivityKey("Return_received")).toBe("returned");
    expect(mapEcotrackActivityKey("livred")).toBe("delivered");
    expect(mapEcotrackActivityKey("encaissed")).toBe("delivered");
    expect(mapEcotrackActivityKey("payed")).toBe("delivered");
  });

  it("returns undefined for unknown keys — never guesses", () => {
    expect(mapEcotrackStatusKey("status_invente")).toBeUndefined();
    expect(mapEcotrackActivityKey("activity_invente")).toBeUndefined();
    expect(mapEcotrackStatusKey("")).toBeUndefined();
    expect(mapEcotrackStatusKey(null)).toBeUndefined();
    expect(mapEcotrackActivityKey(undefined)).toBeUndefined();
  });

  it("matches case-insensitively for capitalized activity keys", () => {
    expect(mapEcotrackActivityKey("return_received")).toBe("returned");
  });

  it("exposes the full documented key space for drift-guarding", () => {
    expect(ECOTRACK_DOCUMENTED_STATUS_KEYS).toContain("annule");
    expect(ECOTRACK_DOCUMENTED_STATUS_KEYS).toContain("suspendu");
    expect(ECOTRACK_DOCUMENTED_STATUS_KEYS).toContain("paye_et_archive");
    expect(ECOTRACK_DOCUMENTED_STATUS_KEYS.length).toBe(20);
    expect(ECOTRACK_DOCUMENTED_ACTIVITY_KEYS).toContain("notification_on_order");
    expect(ECOTRACK_DOCUMENTED_ACTIVITY_KEYS).toContain("payed");
    expect(ECOTRACK_DOCUMENTED_ACTIVITY_KEYS.length).toBe(12);
  });
});
