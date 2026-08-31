"use client";

/**
 * Per-wilaya delivery fee preview for the courier assignment card (R3-d,
 * d4 fix #8). Reuses the permission-governed POST /api/delivery/estimate
 * route (provider "fees" capability, enforced server-side) instead of adding
 * a new endpoint.
 *
 * The quote uses the SAME weight basis as POST /api/delivery/create — total
 * item quantity with a floor of 1 — so the preview matches what booking will
 * record. DeliveryCostEstimate is home-delivery based for every registry
 * adapter (yalidine home_delivery, maystro delivery_type=1, zrexpress
 * pricing.home, ecotrack home tariff); the contract does not expose a desk
 * fee, so no desk/home split is displayed.
 *
 * Degrade gracefully: no wilaya, missing credentials, capability gating,
 * unavailable tariff or any error hides the preview. A fee preview must
 * never block or gate shipment creation.
 */

import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface FeeQuote {
  fee: number | null;
  wilaya: string | null;
  /** Provider the quote was fetched for (hides stale quotes after a switch). */
  provider: string;
}

interface OrderShippingContext {
  wilaya: string | null;
  commune: string | null;
  codAmount: number;
  weight: number;
}

interface ProjectedOrderBody {
  order?: {
    wilaya?: string | null;
    commune?: string | null;
    totalPrice?: number | null;
    items?: Array<{ quantity?: number | null }>;
  } | null;
}

const EMPTY_QUOTE: FeeQuote = { fee: null, wilaya: null, provider: "" };

export function useDeliveryFeeQuote(params: {
  orderId: string;
  provider: string;
  /** Only fetch while the courier select is actually shown. */
  enabled: boolean;
}): { fee: number | null; wilaya: string | null; isFetching: boolean } {
  const { orderId, provider, enabled } = params;
  const [shipping, setShipping] = useState<OrderShippingContext | null>(null);
  const [quote, setQuote] = useState<FeeQuote>(EMPTY_QUOTE);
  const [isFetching, setIsFetching] = useState(false);

  // Lazily load the order shipping context (wilaya/commune/COD amount/weight)
  // through the trusted-actor order projection. Contact/financials redactions
  // yield null values, which simply keep the preview hidden.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderId)}`,
          { headers: { Accept: "application/json" } },
        );
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as ProjectedOrderBody;
        const order = body.order;
        if (!order || cancelled) return;
        const weight = Math.max(
          1,
          (order.items ?? []).reduce(
            (sum, item) => sum + (item.quantity ?? 0),
            0,
          ),
        );
        setShipping({
          wilaya:
            typeof order.wilaya === "string" && order.wilaya.trim()
              ? order.wilaya
              : null,
          commune:
            typeof order.commune === "string" && order.commune.trim()
              ? order.commune
              : null,
          codAmount:
            typeof order.totalPrice === "number" ? order.totalPrice : 0,
          weight,
        });
      } catch {
        // Preview stays hidden — never surface fee-loading noise.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, orderId]);

  // Debounce provider switches so quick selector scrolling fires one quote.
  const debouncedProvider = useDebouncedValue(provider, 400);

  useEffect(() => {
    if (!enabled || !shipping?.wilaya || !debouncedProvider) return;
    const wilaya = shipping.wilaya;
    let cancelled = false;
    void (async () => {
      setIsFetching(true);
      try {
        const response = await fetch("/api/delivery/estimate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            provider: debouncedProvider,
            wilaya,
            commune: shipping.commune ?? undefined,
            weight: shipping.weight,
            codAmount: shipping.codAmount,
          }),
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as {
          cost?: number;
          available?: boolean;
        };
        if (cancelled) return;
        if (
          data.available === true &&
          typeof data.cost === "number" &&
          Number.isFinite(data.cost) &&
          data.cost >= 0
        ) {
          setQuote({ fee: data.cost, wilaya, provider: debouncedProvider });
        } else {
          setQuote(EMPTY_QUOTE);
        }
      } catch {
        if (!cancelled) setQuote(EMPTY_QUOTE);
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, debouncedProvider, shipping]);

  // Derive the visible quote: hidden while disabled, before the order context
  // loads, or while a newly selected provider's estimate is in flight.
  if (!enabled || !shipping || quote.provider !== provider) {
    return { fee: null, wilaya: null, isFetching };
  }
  return { fee: quote.fee, wilaya: quote.wilaya, isFetching };
}
