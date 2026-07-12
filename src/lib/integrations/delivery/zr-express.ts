/**
 * ZR Express adapter — full implementation (legacy/Procolis API).
 *
 * Sources: CourierDZ PHP SDK, DZ-Woo-Agency plugin, DZBuild docs.
 * Official docs: https://zrexpress.com/ZREXPRESS_WEB/FR/Developpement.awp
 *
 * Auth: two custom headers — `token` + `key` (both from the ZR Express dashboard).
 * Credentials: delivery_zrexpress_api_id (token) + delivery_zrexpress_api_key (key).
 *
 * Endpoints (base: https://procolis.com/api_v1/):
 *   GET  /token              → test credentials
 *   POST /tarification       → get the full per-wilaya pricing table (empty body)
 *   POST /add_colis          → create parcel(s) — body {"Colis": [{...}]}
 *   POST /lire               → read/track parcel(s) — body {"Colis": [{"Tracking": "..."}]}
 *
 * Gotchas handled:
 *   - Wilaya codes are 2-digit strings ("01"–"48", classic 48-wilaya scheme).
 *   - Commune is a free-text NAME (not an ID).
 *   - `Total` = COD amount the customer pays.
 *   - `Tracking` must be unique (duplicates return MessageRetour: "Double Tracking").
 *   - `Confrimee=1` creates the parcel directly in "pret a expedier" status.
 *   - All create/read bodies are wrapped in {"Colis": [...]} (bulk-friendly).
 *   - Phone numbers: strip +213/213 prefixes.
 *   - /lire is a POST (not GET).
 *
 * Limitations:
 *   - Cancellation NOT supported via API → cancelShipment returns "not supported".
 *   - Label/bordereau NOT supported via API.
 *   - Status strings (situation) are French and not fully documented. We map
 *     the known ones and default to "pending" for unknown values.
 *   - The new ZR Express platform (api.zrexpress.app, API Key + Tenant ID) is
 *     not yet publicly documented. This adapter targets the legacy/Procolis
 *     API, which most merchants still use. A future PR can add a new-platform
 *     adapter when docs are available.
 */
import { env } from "@/lib/env";
import "server-only";


import type {
  DeliveryAdapter,
  DeliveryCredentials,
  DeliveryCostEstimate,
  ShipmentRequest,
  ShipmentResult,
  TrackingEvent,
  TrackingInfo,
  DeliveryStatus,
  CancelShipmentResult,
} from "./types";
import { retryFetch } from "./retry";

const ZR_BASE =
  env.zrExpressApiBase || "https://procolis.com/api_v1";

const FETCH_TIMEOUT_MS = 15000;

// In-memory wilaya pricing cache: wilayaId → { home: number, stopdesk: number }
const pricingCache = new Map<string, { home: number; stopdesk: number }>();

function authHeaders(creds: DeliveryCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    token: creds.apiId ?? "", // token = apiId in our credential naming
    key: creds.apiKey ?? "", // key = apiKey in our credential naming
  };
}

/** Normalize a phone number: strip +213, 213, leading 0, spaces. */
function normalizePhone(phone: string): string {
  let p = phone.replace(/[\s\-()]/g, "");
  if (p.startsWith("+213")) p = "0" + p.slice(4);
  else if (p.startsWith("213")) p = "0" + p.slice(3);
  return p;
}

/** Map ZR Express's French situation strings to our normalized DeliveryStatus. */
function mapStatus(situation: string): DeliveryStatus {
  const s = situation.toLowerCase().trim();
  // D-S2: "Non livré" must be checked BEFORE the "livré" branch —
  // "non livré".includes("livré") is true, so without this guard failed
  // deliveries are silently mapped to "delivered" (same bug class as the
  // fixed DHD I3). Yalidine + DHD already have this guard; ZR Express did not.
  if (s.includes("non livré") || s.includes("non livre")) return "failed";
  if (s.includes("livré") || s === "delivre" || s === "delivered") return "delivered";
  if (s.includes("retour") && !s.includes("pret")) return "returned";
  if (s.includes("refus")) return "refused";
  if (s.includes("échec") || s.includes("echec") || s.includes("no reponse") || s.includes("no response")) return "failed";
  if (s.includes("expédié") || s.includes("expedie") || s.includes("transit") || s.includes("voyage")) return "in_transit";
  if (s.includes("livraison") || s.includes("en livraison")) return "out_for_delivery";
  if (s.includes("ramass") || s.includes("picked")) return "picked_up";
  if (s.includes("pret a expedier") || s.includes("pret")) return "created";
  if (s.includes("créé") || s.includes("cree") || s.includes("created")) return "created";
  if (s.includes("annul") || s.includes("cancel")) return "returned"; // cancelled = returned to seller
  if (s.includes("boite") || s.includes("stopdesk")) return "at_hub";
  if (s.includes("report") || s.includes("postpon")) return "pending";
  return "pending";
}

/** Resolve a wilaya name to a 2-digit ZR Express wilaya code ("01"–"48"). */
function getWilayaCode(wilaya: string): string | null {
  // Map common Algerian wilaya names to their 2-digit codes (classic 48 scheme).
  // This is a static lookup; the codes are stable.
  const WILAYA_CODES: Record<string, string> = {
    "adrar": "01", "chlef": "02", "laghouat": "03", "oum el bouaghi": "04",
    "batna": "05", "béjaïa": "06", "biskra": "07", "béchar": "08",
    "blida": "09", "bouira": "10", "tamanrasset": "11", "tébessa": "12",
    "tlemcen": "13", "tiaret": "14", "tizi ouzou": "15", "alger": "16",
    "djelfa": "17", "jijel": "18", "sétif": "19", "saïda": "20",
    "skikda": "21", "sidi bel abbès": "22", "annaba": "23", "guelma": "24",
    "constantine": "25", "médéa": "26", "mostaganem": "27", "m'sila": "28",
    "mascara": "29", "ouargla": "30", "oran": "31", "el bayadh": "32",
    "illizi": "33", "bordj bou arréridj": "34", "boumerdès": "35", "el tarf": "36",
    "tindouf": "37", "tissemsilt": "38", "el oued": "39", "khenchela": "40",
    "souk ahras": "41", "tipaza": "42", "mila": "43", "aïn défla": "44",
    "naâma": "45", "aïn témouchent": "46", "ghardaïa": "47", "relizane": "48",
  };
  const key = wilaya.toLowerCase().trim();
  // Try exact match, then try without accents
  if (WILAYA_CODES[key]) return WILAYA_CODES[key]!;
  const normalized = key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (WILAYA_CODES[normalized]) return WILAYA_CODES[normalized]!;
  // Try matching just the first word (e.g. "Aïn Défla" → "ain défla")
  for (const [name, code] of Object.entries(WILAYA_CODES)) {
    if (name.startsWith(normalized.split(" ")[0]!)) return code;
  }
  return null;
}

/** Fetch the full per-wilaya pricing table and cache it. */
async function loadPricingTable(
  creds: DeliveryCredentials,
): Promise<void> {
  if (pricingCache.size > 0) return; // already loaded

  try {
    const res = await retryFetch(
      `${ZR_BASE}/tarification`,
      {
        method: "POST",
        headers: authHeaders(creds),
        body: JSON.stringify({}),
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return;
    const data = (await res.json()) as Array<{
      IDWilaya: string;
      TarifLivraison?: number;
      TarifStopDesk?: number;
      tarif?: number;
      price?: number;
    }>;
    for (const row of data) {
      const id = String(row.IDWilaya).padStart(2, "0");
      pricingCache.set(id, {
        home: row.TarifLivraison ?? row.tarif ?? row.price ?? 0,
        stopdesk: row.TarifStopDesk ?? row.tarif ?? row.price ?? 0,
      });
    }
  } catch {
    // leave cache empty
  }
}

export const zrExpressAdapter: DeliveryAdapter = {
  id: "zrexpress",
  name: "ZR Express",
  logo: "📦",

  async estimateCost(
    params: { wilaya: string; commune?: string; weight: number; codAmount: number },
    creds: DeliveryCredentials,
  ): Promise<DeliveryCostEstimate> {
    if (!creds.apiId || !creds.apiKey) {
      return {
        provider: "zrexpress",
        cost: 0,
        available: false,
        error: "Identifiants ZR Express manquants. Configurez-les dans Paramètres → Transporteurs.",
      };
    }

    const wilayaCode = getWilayaCode(params.wilaya);
    if (!wilayaCode) {
      return {
        provider: "zrexpress",
        cost: 0,
        available: false,
        error: `Wilaya "${params.wilaya}" non reconnue. Code 2-digit requis (01-48).`,
      };
    }

    await loadPricingTable(creds);
    const pricing = pricingCache.get(wilayaCode);
    if (!pricing) {
      return {
        provider: "zrexpress",
        cost: 0,
        available: false,
        error: `Tarif non disponible pour la wilaya "${params.wilaya}" (code ${wilayaCode}).`,
      };
    }

    return {
      provider: "zrexpress",
      cost: pricing.home,
      available: true,
    };
  },

  async createShipment(
    request: ShipmentRequest,
    creds: DeliveryCredentials,
  ): Promise<ShipmentResult> {
    if (!creds.apiId || !creds.apiKey) {
      return { success: false, trackingId: "", cost: 0, error: "Identifiants ZR Express manquants." };
    }

    const wilayaCode = getWilayaCode(request.customer.wilaya);
    if (!wilayaCode) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: `Wilaya "${request.customer.wilaya}" non reconnue.`,
      };
    }

    // Build the product description string (free-text)
    const tProduit = request.items
      .map((i) => `${i.quantity}x ${i.name}`)
      .join(", ");

    // Generate a unique tracking reference
    const tracking = `SF-${request.orderNumber}`;

    const body = {
      Colis: [
        {
          Tracking: tracking,
          TypeLivraison: 0, // 0 = Domicile, 1 = Stopdesk
          TypeColis: request.isExchange ? 1 : 0, // 0 = normal, 1 = échange
          Confrimee: 1, // create directly in "pret a expedier"
          Client: request.customer.name,
          MobileA: normalizePhone(request.customer.phone),
          MobileB: "",
          Adresse: request.customer.address,
          IDWilaya: wilayaCode,
          Commune: request.customer.commune, // free-text name
          Total: request.totalPrice, // COD amount
          Note: request.notes ?? "",
          TProduit: tProduit,
          id_Externe: request.orderNumber,
          Source: "SahelFlow",
        },
      ],
    };

    try {
      const res = await retryFetch(
        `${ZR_BASE}/add_colis`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify(body),
        },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `ZR Express API ${res.status}: ${errBody.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as {
        Colis: Array<{
          MessageRetour: string;
          Tracking?: string;
          suivi?: string;
        }>;
      };

      const result = data.Colis?.[0];
      if (!result) {
        return { success: false, trackingId: "", cost: 0, error: "Réponse ZR Express vide." };
      }

      if (result.MessageRetour !== "Good") {
        return {
          success: false,
          trackingId: "",
          cost: 0,
          error: `ZR Express: ${result.MessageRetour}`,
        };
      }

      // Get the delivery cost from the pricing table
      const estimate = await zrExpressAdapter.estimateCost(
        {
          wilaya: request.customer.wilaya,
          commune: request.customer.commune,
          weight: request.weight,
          codAmount: request.totalPrice,
        },
        creds,
      );

      return {
        success: true,
        trackingId: result.Tracking ?? result.suivi ?? tracking,
        cost: estimate.cost,
      };
    } catch (err) {
      return {
        success: false,
        trackingId: "",
        cost: 0,
        error: err instanceof Error ? err.message : "Erreur de connexion",
      };
    }
  },

  async syncTracking(
    trackingId: string,
    creds: DeliveryCredentials,
  ): Promise<TrackingInfo> {
    if (!creds.apiId || !creds.apiKey) {
      throw new Error("Identifiants ZR Express manquants.");
    }

    try {
      const res = await retryFetch(
        `${ZR_BASE}/lire`,
        {
          method: "POST",
          headers: authHeaders(creds),
          body: JSON.stringify({
            Colis: [{ Tracking: trackingId }],
          }),
        },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        throw new Error(`ZR Express API ${res.status}`);
      }

      const data = (await res.json()) as {
        Colis: Array<{
          Tracking: string;
          situation?: string;
          statut?: string;
          status?: string;
          Client?: string;
          Total?: number;
        }> | null;
      };

      if (!data || !data.Colis || data.Colis.length === 0) {
        throw new Error(`Colis "${trackingId}" introuvable.`);
      }

      const colis = data.Colis[0]!;
      const situation = colis.situation ?? colis.statut ?? colis.status ?? "";
      const status = mapStatus(situation);

      const events: TrackingEvent[] = [
        {
          status,
          timestamp: new Date().toISOString(),
          details: situation,
        },
      ];

      return {
        trackingId,
        status,
        events,
        deliveryCompany: "ZR Express",
      };
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Erreur de connexion ZR Express",
      );
    }
  },

  async cancelShipment(
    _trackingId: string,
    _creds: DeliveryCredentials,
  ): Promise<CancelShipmentResult> {
    // W3-11: ZR Express does not support cancellation via the legacy/Procolis
    // API. The seller must cancel from the ZR Express dashboard.
    //
    // Previously this returned a bare { success: false, error: "..." } which
    // the UI surfaced as a generic error toast — leaving the seller unsure
    // of what to do next. The new structured result tells the UI to render
    // an "Open Dashboard" button so the seller has an actionable next step
    // instead of a dead-end error.
    //
    // We keep the `error` field (with the original French "pas supportée"
    // message) for backward-compat with existing tests/UIs that read
    // `result.error`. The new `action`/`dashboardUrl`/`message` fields are
    // the structured contract the UI uses to render the dashboard link.
    const dashboardUrl = "https://zrexpress.com/ZREXPRESS_WEB/FR/";
    const message =
      "L'annulation via l'API n'est pas supportée par ZR Express. " +
      "Annulez depuis le tableau de bord ZR Express.";
    return {
      success: false,
      cancelled: false,
      action: "open_dashboard",
      dashboardUrl,
      message,
      // Backward-compat: keep the original error string so existing tests
      // + any caller that reads `result.error` still see the familiar text.
      error: message,
    };
  },
};
