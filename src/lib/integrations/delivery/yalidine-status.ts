/**
 * Yalidine status mapping — pure module.
 *
 * Yalidine status strings are a system-wide fixed French enum, not free text.
 * The table below is copied verbatim from the live-proven CodFlow mapper
 * (cod-server/src/endpoints/webhooks/yalidine-status-mapper.ts @ 00f18fa,
 * Apache-2.0; verified 2026-09-07 against the official 34+-status docs and
 * 272 live history events across 20 parcels).
 *
 * Semantics:
 *   - Terminal verdicts close the delivery (delivered / returned). "Annulé"
 *     maps to "failed": SahelFlow's delivery machine has no cancelled state,
 *     and a cancelled shipment will never deliver.
 *   - "Sorti en livraison" → out_for_delivery.
 *   - "Tentative échouée" → out_for_delivery + attempts:"increment": the
 *     parcel stays with the courier; the failure reason rides the event
 *     details.
 *   - Transit/waiting/alert states are deliberate NO-OPs (status:null +
 *     noop:true): they must NEVER move an order backward — live-proven
 *     regression where "Ramassé" regressed already-dispatched orders.
 *   - Return-TO-CENTER states stay no-ops on purpose: the parcel can still
 *     end "Livré" (client retrieves it at the desk), so only definitive
 *     outcomes map.
 *   - "Echèc livraison" is always-final (live-observed) → returned.
 *
 * A string NOT in this table is UNMAPPED ({ status:null, noop:false }) —
 * callers keep the previous state and never guess.
 */
import type { DeliveryStatus } from "./types";

export interface YalidineStatusVerdict {
  status: DeliveryStatus | null; // null = do not change state
  noop: boolean; // true = courier-internal transit noise
  attempts: "none" | "increment";
  terminal: boolean;
}

const DELIVERED: YalidineStatusVerdict = {
  status: "delivered",
  noop: false,
  attempts: "none",
  terminal: true,
};
// SahelFlow's delivery machine has no cancelled state: a cancelled shipment
// will never deliver, so it lands on "failed".
const FAILED: YalidineStatusVerdict = {
  status: "failed",
  noop: false,
  attempts: "none",
  terminal: true,
};
const RETURNED: YalidineStatusVerdict = {
  status: "returned",
  noop: false,
  attempts: "none",
  terminal: true,
};
const OUT_FOR_DELIVERY: YalidineStatusVerdict = {
  status: "out_for_delivery",
  noop: false,
  attempts: "none",
  terminal: false,
};
const FAILED_ATTEMPT: YalidineStatusVerdict = {
  status: "out_for_delivery",
  noop: false,
  attempts: "increment",
  terminal: false,
};
const NOOP: YalidineStatusVerdict = {
  status: null,
  noop: true,
  attempts: "none",
  terminal: false,
};
const UNMAPPED: YalidineStatusVerdict = {
  status: null,
  noop: false,
  attempts: "none",
  terminal: false,
};

const YALIDINE_STATUS_TABLE: Record<string, YalidineStatusVerdict> = {
  // ── Terminal: delivered ──
  "Livré": DELIVERED,

  // ── Terminal: cancelled in Yalidine's terms → failed here ──
  "Annulé": FAILED,

  // ── Terminal: returned ──
  "Retourné au vendeur": RETURNED,
  "Retour vers vendeur": RETURNED,
  "Retour non retiré": RETURNED,
  "Colis abandonné": RETURNED,
  "Echange échoué": RETURNED,
  // "Echèc livraison" is always-final (live-observed): the delivery
  // definitively failed and the parcel heads back to the sender.
  "Echèc livraison": RETURNED,

  // ── Out for delivery ──
  "Sorti en livraison": OUT_FOR_DELIVERY,

  // ── Failed delivery attempt: parcel stays with the courier ──
  "Tentative échouée": FAILED_ATTEMPT,

  // ── Transit / waiting / alerts — deliberate no-ops; never move an order
  //    backward ("Ramassé" once regressed dispatched orders) ──
  "Pas encore expédié": NOOP,
  "A vérifier": NOOP,
  "En préparation": NOOP,
  "Pas encore ramassé": NOOP,
  "Prêt à expédier": NOOP,
  "En passation": NOOP,
  "Ramassé": NOOP,
  "Bloqué": NOOP,
  "Débloqué": NOOP,
  "Transfert": NOOP,
  "Expédié": NOOP,
  "Centre": NOOP,
  "En localisation": NOOP,
  "Vers Wilaya": NOOP,
  "En transit": NOOP,
  "Reçu à Wilaya": NOOP,
  "En attente du client": NOOP,
  "Prêt pour livreur": NOOP,
  "En attente": NOOP,
  "En alerte": NOOP,
  "Alerte résolue": NOOP,
  // Return-TO-CENTER transit stays a no-op: the parcel can still end "Livré"
  // (client retrieves it); only definitive outcomes map.
  "Retour vers centre": NOOP,
  "Retourné au centre": NOOP,
  "Retour transfert": NOOP,
  "Retour groupé": NOOP,
  "Retour à retirer": NOOP,
};

/** The full documented enum — exported for exhaustive drift-guard tests. */
export const YALIDINE_DOCUMENTED_STATUSES = Object.keys(YALIDINE_STATUS_TABLE);

/**
 * Map a Yalidine status string to a verdict.
 *
 * Exact match first, then case-insensitive fallback (safety net — Yalidine
 * sends exact French strings). Unknown strings return UNMAPPED: the caller
 * leaves the state untouched and never guesses.
 */
export function mapYalidineStatus(raw: string): YalidineStatusVerdict {
  const normalized = raw.trim();
  if (normalized in YALIDINE_STATUS_TABLE) {
    return YALIDINE_STATUS_TABLE[normalized] ?? UNMAPPED;
  }

  const lower = normalized.toLowerCase();
  for (const [key, verdict] of Object.entries(YALIDINE_STATUS_TABLE)) {
    if (key.toLowerCase() === lower) {
      return verdict;
    }
  }

  return UNMAPPED;
}
