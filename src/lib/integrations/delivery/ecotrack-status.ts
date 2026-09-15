/**
 * EcoTrack status mapping — pure module.
 *
 * The carrier key tables below are copied verbatim from the live-proven
 * CodFlow integration (cod-server/src/endpoints/delivery-companies/providers/
 * ecotrack/status-mapping.ts @ 00f18fa, Apache-2.0), remapped onto SahelFlow's
 * delivery machine. Rule kept from upstream: unmapped values return undefined
 * and are surfaced raw by callers — NEVER guessed into a status.
 *
 * SahelFlow delivery-machine mapping (CodFlow status → DeliveryStatus):
 *   - dispatched (prete_a_expedier / prete_a_preparer / en_preparation_stock /
 *     en_preparation) → "created"   (pre-dispatch progression)
 *   - en_ramassage   → "picked_up" (courier collection in progress)
 *   - vers_hub / vers_wilaya → "in_transit"; en_hub → "at_hub"
 *   - en_livraison   → "out_for_delivery"
 *   - delivered family (livre_non_encaisse / encaisse_non_paye /
 *     paiements_prets / paye_et_archive) → "delivered" (terminal)
 *   - suspendu       → null (log-only: a suspension can resume, so it must
 *     never move an order — the forward-only carry-forward keeps it a no-op)
 *   - returned family (retour_chez_livreur / retour_transit_entrepot /
 *     retour_en_traitement / retour_recu / retour_archive) → "returned" (terminal)
 *   - annule         → "failed": SahelFlow's machine has no cancelled state,
 *     and a cancelled shipment will never deliver (the same rationale locked
 *     upstream for Yalidine's "Annulé" during EX-1).
 *
 * Activity keys (get/tracking/info rows) map through the same machine; a
 * null verdict means a known NON-status event (notification_on_order) — an
 * event to log, never a status signal.
 */
import type { DeliveryStatus } from "./types";

/** Map an EcoTrack status enum key (get/orders rows, get/orders/status). */
const ECOTRACK_STATUS_MAP: Record<string, DeliveryStatus | null> = {
  prete_a_expedier: "created",
  prete_a_preparer: "created",
  en_preparation_stock: "created",
  en_preparation: "created",
  en_ramassage: "picked_up",
  vers_hub: "in_transit",
  en_hub: "at_hub",
  vers_wilaya: "in_transit",
  en_livraison: "out_for_delivery",
  livre_non_encaisse: "delivered",
  encaisse_non_paye: "delivered",
  paiements_prets: "delivered",
  paye_et_archive: "delivered",
  suspendu: null, // suspension can resume — log-only, never move an order
  retour_chez_livreur: "returned",
  retour_transit_entrepot: "returned",
  retour_en_traitement: "returned",
  retour_recu: "returned",
  retour_archive: "returned",
  annule: "failed",
};

/** Map an EcoTrack activity key (get/tracking/info rows). */
const ECOTRACK_ACTIVITY_MAP: Record<string, DeliveryStatus | null> = {
  order_information_received_by_carrier: "created",
  notification_on_order: null, // remark notification — not a status signal
  picked: "picked_up",
  accepted_by_carrier: "in_transit",
  dispatched_to_driver: "out_for_delivery",
  attempt_delivery: "out_for_delivery",
  return_asked: "returned",
  return_in_transit: "returned",
  Return_received: "returned",
  livred: "delivered",
  encaissed: "delivered",
  payed: "delivered",
};

/** Normalized (lowercased) fallback tables for case-insensitive matching. */
const ECOTRACK_STATUS_MAP_LOWER = Object.fromEntries(
  Object.entries(ECOTRACK_STATUS_MAP).map(([key, verdict]) => [key.toLowerCase(), verdict]),
) as Record<string, DeliveryStatus | null>;

const ECOTRACK_ACTIVITY_MAP_LOWER = Object.fromEntries(
  Object.entries(ECOTRACK_ACTIVITY_MAP).map(([key, verdict]) => [key.toLowerCase(), verdict]),
) as Record<string, DeliveryStatus | null>;

/**
 * Map an EcoTrack status enum key to the SahelFlow machine.
 *   - DeliveryStatus: the mapped state.
 *   - null: a known key that must never change state.
 *   - undefined: unknown key — surface raw, never guess.
 */
export function mapEcotrackStatusKey(
  statusKey: string | null | undefined,
): DeliveryStatus | null | undefined {
  if (!statusKey) return undefined;
  if (statusKey in ECOTRACK_STATUS_MAP) return ECOTRACK_STATUS_MAP[statusKey];
  return ECOTRACK_STATUS_MAP_LOWER[statusKey.toLowerCase()];
}

/**
 * Map an EcoTrack activity key to the SahelFlow machine (same verdict shape
 * as mapEcotrackStatusKey; undefined = unknown key — log raw, never guess).
 */
export function mapEcotrackActivityKey(
  activityKey: string | null | undefined,
): DeliveryStatus | null | undefined {
  if (!activityKey) return undefined;
  if (activityKey in ECOTRACK_ACTIVITY_MAP) return ECOTRACK_ACTIVITY_MAP[activityKey];
  return ECOTRACK_ACTIVITY_MAP_LOWER[activityKey.toLowerCase()];
}

/** The full documented key space — exported for exhaustive drift-guard tests. */
export const ECOTRACK_DOCUMENTED_STATUS_KEYS = Object.keys(ECOTRACK_STATUS_MAP);
export const ECOTRACK_DOCUMENTED_ACTIVITY_KEYS = Object.keys(ECOTRACK_ACTIVITY_MAP);
