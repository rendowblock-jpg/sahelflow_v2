/**
 * ZR Express (new platform, api.zrexpress.app) status mapping — pure module.
 *
 * ZR state names are company-configurable free text — NOT a fixed enum. The
 * table below is the DEFAULT tenant workflow vocabulary, copied verbatim from
 * the live-proven CodFlow mapper (cod-server/src/endpoints/webhooks/
 * zr-status-mapper.ts @ 00f18fa, Apache-2.0; captured live 2026-09-10 via
 * POST /workflows/search — 23 states — plus a real parcel payload with
 * state.name = "commande_recue").
 *
 * Matching is accent- and case-insensitive; the caller falls back to matching
 * `state.description` when `state.name` misses, so renamed tenants with French
 * display text still map.
 *
 * SahelFlow delivery-machine mapping (CodFlow status → DeliveryStatus):
 *   - delivered            → "delivered" (terminal)
 *   - returned             → "returned" (terminal)
 *   - out_for_delivery     → "out_for_delivery"
 *   - preparing            → "created"  (order received / call-center processing)
 *   - confirmed            → "created"  (still pre-pickup; no-op against created)
 *   - ready                → "created"  (waiting for pickup — not yet collected)
 *   - assigned             → "in_transit" (dispatched into the carrier network)
 *   - legacy "at hub"      → "at_hub"   (SahelFlow has a dedicated at-hub state)
 *
 * A state NOT in this table is UNMAPPED ({ status: null }): the caller keeps
 * the previous state, logs the event, and never guesses. The forward-only
 * carry-forward applied by the caller makes every non-advancing mapping a
 * no-op, so these can never regress an order (same discipline as the
 * Yalidine 36-status table).
 */
import type { DeliveryStatus } from "./types";
import { stripAccents } from "./zr-express-text";

export interface ZrV2StateVerdict {
  status: DeliveryStatus | null; // null = do not change state
  noop: boolean; // true = courier-internal progression noise
  terminal: boolean;
}

const DELIVERED: ZrV2StateVerdict = { status: "delivered", noop: false, terminal: true };
const RETURNED: ZrV2StateVerdict = { status: "returned", noop: false, terminal: true };
const OUT_FOR_DELIVERY: ZrV2StateVerdict = { status: "out_for_delivery", noop: false, terminal: false };
const CREATED: ZrV2StateVerdict = { status: "created", noop: false, terminal: false };
const IN_TRANSIT: ZrV2StateVerdict = { status: "in_transit", noop: false, terminal: false };
const AT_HUB: ZrV2StateVerdict = { status: "at_hub", noop: false, terminal: false };
const UNMAPPED: ZrV2StateVerdict = { status: null, noop: false, terminal: false };

/** Default workflow vocabulary (POST /workflows/search, live-verified) plus
 *  the legacy English aliases kept for tenants that customize names. */
const ZR_V2_DEFAULT_STATE_MAP_RAW: Record<string, ZrV2StateVerdict> = {
  // ── delivered family ──
  "livre": DELIVERED,
  "livre au client": DELIVERED,
  "encaisse": DELIVERED,
  "recouvert": DELIVERED,
  // ── returned family ──
  "retour_sous_traitant": RETURNED,
  "colis_recupere": RETURNED,
  "attente_recuperation_fournisseur": RETURNED,
  "reinjecte_dans_stock": RETURNED,
  "recupere_par_fournisseur": RETURNED,
  "remboursement_reinjecte": RETURNED,
  // ── out for delivery family ──
  "en_livraison": OUT_FOR_DELIVERY,
  "sortie_en_livraison": OUT_FOR_DELIVERY,
  // ── pre-delivery carrier progression (non-advancing no-ops once past) ──
  "commande_recue": CREATED,
  "en_traitement": CREATED,
  "appel_confirmation": CREATED,
  "commande_confirmee": CREATED,
  "en_preparation": CREATED,
  "pret_a_expedier": CREATED,
  "confirme_au_bureau": IN_TRANSIT,
  "confirme_chez_partenaire": IN_TRANSIT,
  "dispatch": IN_TRANSIT,
  "vers_wilaya": IN_TRANSIT,
  // ── legacy English aliases (kept for customized tenants) ──
  "out for delivery": OUT_FOR_DELIVERY,
  "in transit": IN_TRANSIT,
  "at hub": AT_HUB,
};

/** Normalized lookup keys (accent-stripped, lowercased) → verdict. */
const ZR_V2_DEFAULT_STATE_MAP: Record<string, ZrV2StateVerdict> = Object.fromEntries(
  Object.entries(ZR_V2_DEFAULT_STATE_MAP_RAW).map(([key, verdict]) => [
    stripAccents(key).toLowerCase(),
    verdict,
  ]),
);

/** The full default workflow vocabulary — exported for drift-guard tests. */
export const ZR_V2_DOCUMENTED_STATES = Object.keys(ZR_V2_DEFAULT_STATE_MAP_RAW);

/**
 * Map a ZR state name (or French display description fallback) to a verdict.
 *
 * Matching is case- and accent-insensitive on both sides. Returns UNMAPPED
 * when the state is not in the default vocabulary: the caller must log the
 * event and NOT change the order status.
 */
export function mapZrV2State(stateName: string | null | undefined): ZrV2StateVerdict {
  if (!stateName) return UNMAPPED;
  const normalized = stripAccents(stateName).toLowerCase().trim();
  return ZR_V2_DEFAULT_STATE_MAP[normalized] ?? UNMAPPED;
}
