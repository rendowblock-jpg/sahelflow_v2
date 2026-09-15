import { describe, expect, it } from "vitest";

import {
  ZR_V2_DOCUMENTED_STATES,
  mapZrV2State,
} from "../zr-express-v2-status";

describe("ZR Express v2 status mapping (CodFlow-extracted contract)", () => {
  it("maps the delivered family to the terminal delivered state", () => {
    for (const state of ["livre", "livre au client", "encaisse", "recouvert"]) {
      expect(mapZrV2State(state)).toMatchObject({ status: "delivered", terminal: true });
    }
  });

  it("maps the returned family to the terminal returned state", () => {
    for (const state of [
      "retour_sous_traitant",
      "colis_recupere",
      "attente_recuperation_fournisseur",
      "reinjecte_dans_stock",
      "recupere_par_fournisseur",
      "remboursement_reinjecte",
    ]) {
      expect(mapZrV2State(state)).toMatchObject({ status: "returned", terminal: true });
    }
  });

  it("maps the out-for-delivery family", () => {
    expect(mapZrV2State("en_livraison")).toMatchObject({ status: "out_for_delivery" });
    expect(mapZrV2State("sortie_en_livraison")).toMatchObject({ status: "out_for_delivery" });
  });

  it("lands the pre-delivery progression on SahelFlow machine states without regressions", () => {
    // preparing/confirmed/ready → created (pre-pickup, non-advancing among themselves)
    for (const state of [
      "commande_recue",
      "en_traitement",
      "appel_confirmation",
      "commande_confirmee",
      "en_preparation",
      "pret_a_expedier",
    ]) {
      expect(mapZrV2State(state)).toMatchObject({ status: "created", terminal: false });
    }
    // assigned family → in_transit (dispatched into the carrier network)
    for (const state of [
      "confirme_au_bureau",
      "confirme_chez_partenaire",
      "dispatch",
      "vers_wilaya",
    ]) {
      expect(mapZrV2State(state)).toMatchObject({ status: "in_transit", terminal: false });
    }
  });

  it("maps the legacy English aliases", () => {
    expect(mapZrV2State("out for delivery")).toMatchObject({ status: "out_for_delivery" });
    expect(mapZrV2State("in transit")).toMatchObject({ status: "in_transit" });
    expect(mapZrV2State("at hub")).toMatchObject({ status: "at_hub" });
  });

  it("matches accent- and case-insensitively (ZR stores accent-free text)", () => {
    expect(mapZrV2State("LIVRÉ")).toMatchObject({ status: "delivered" });
    expect(mapZrV2State("Livre Au Client")).toMatchObject({ status: "delivered" });
    expect(mapZrV2State("  COMMANDE_RECUE  ")).toMatchObject({ status: "created" });
  });

  it("returns UNMAPPED (null status) for unknown tenant-configured states — never guesses", () => {
    expect(mapZrV2State("etat_invente_par_le_tenant")).toMatchObject({
      status: null,
      terminal: false,
    });
    expect(mapZrV2State("")).toMatchObject({ status: null });
    expect(mapZrV2State(null)).toMatchObject({ status: null });
    expect(mapZrV2State(undefined)).toMatchObject({ status: null });
  });

  it("carries the full default workflow vocabulary for drift-guarding", () => {
    expect(ZR_V2_DOCUMENTED_STATES).toContain("livre");
    expect(ZR_V2_DOCUMENTED_STATES).toContain("remboursement_reinjecte");
    expect(ZR_V2_DOCUMENTED_STATES).toContain("vers_wilaya");
    // 4 delivered + 6 returned + 2 out-for-delivery + 6 pre-delivery
    // progression + 4 assigned + 3 legacy English aliases.
    expect(ZR_V2_DOCUMENTED_STATES.length).toBe(25);
  });
});
