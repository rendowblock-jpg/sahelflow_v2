/**
 * Shared Meta Ads conversion model — pure module.
 *
 * Contract transcribed verbatim from the live-proven CodFlow engine
 * (cod-server/src/workflows/conversion-model.ts + capi-helpers.ts @ 00f18fa,
 * Apache-2.0), with CodFlow's workflow-ID concept mapped onto SahelFlow's
 * deterministic outbox effect key.
 *
 * One centralized business contract across:
 * - Storefront checkout (Pixel + CAPI)
 * - Merchant call-center phone confirmation (dashboard status update)
 * - Courier logistics delivery (pull + reconcile tracking truth)
 * - CAPI engine execution, validation, and idempotency claims
 */

export type ConversionStage = "checkout" | "confirmed" | "delivered";
export type MetaEventName = "Lead" | "Purchase";
export type ConversionMode = "Purchase" | "Purchase_Confirmed" | "Purchase_Delivered" | "Lead";

export const CONVERSION_MODES: readonly ConversionMode[] = [
  "Purchase",
  "Purchase_Confirmed",
  "Purchase_Delivered",
  "Lead",
];

export interface ConversionDecision {
  shouldFire: boolean;
  eventName?: MetaEventName;
  stage?: ConversionStage;
  reason?: string;
}

/**
 * Maps the merchant's chosen tracking configuration to the business stage.
 *
 * | Configuration        | Business stage       | Meta event |
 * |----------------------|----------------------|------------|
 * | Lead                 | Checkout             | Lead       |
 * | Purchase             | Checkout             | Purchase   |
 * | Purchase_Confirmed   | Phone confirmation   | Purchase   |
 * | Purchase_Delivered   | Delivery/payment     | Purchase   |
 */
export function resolveConversionForStage(
  mode: ConversionMode | null | undefined,
  stage: ConversionStage,
): ConversionDecision {
  const resolvedMode: ConversionMode = mode ?? "Purchase";

  switch (stage) {
    case "checkout":
      if (resolvedMode === "Purchase") {
        return { shouldFire: true, eventName: "Purchase", stage: "checkout" };
      }
      if (resolvedMode === "Lead") {
        return { shouldFire: true, eventName: "Lead", stage: "checkout" };
      }
      return {
        shouldFire: false,
        reason: `Conversion mode is '${resolvedMode}' — checkout stage does not fire a conversion event.`,
      };

    case "confirmed":
      if (resolvedMode === "Purchase_Confirmed") {
        return { shouldFire: true, eventName: "Purchase", stage: "confirmed" };
      }
      return {
        shouldFire: false,
        reason: `Conversion mode is '${resolvedMode}' — phone confirmation stage does not fire a conversion event.`,
      };

    case "delivered":
      if (resolvedMode === "Purchase_Delivered") {
        return { shouldFire: true, eventName: "Purchase", stage: "delivered" };
      }
      return {
        shouldFire: false,
        reason: `Conversion mode is '${resolvedMode}' — delivery stage does not fire a conversion event.`,
      };

    default:
      return { shouldFire: false, reason: `Unknown stage: ${String(stage)}` };
  }
}

/** Southern wilayas with 5-10 day delivery — fire at out_for_delivery there to stay inside Meta's 7-day window. */
export const LONG_HAUL_WILAYA_CODES = new Set([1, 8, 11, 33, 37, 44]);

/** Deterministic whether the delivery-stage trigger fires for this transition. */
export function shouldTriggerCapiConfirmed(newStatus: string): boolean {
  return newStatus === "confirmed";
}

export function shouldTriggerCapiPurchase(
  newStatus: string,
  wilayaCode: number | null | undefined,
): boolean {
  if (newStatus === "delivered") return true;
  if (
    newStatus === "out_for_delivery" &&
    wilayaCode != null &&
    LONG_HAUL_WILAYA_CODES.has(wilayaCode)
  ) {
    return true;
  }
  return false;
}

export interface CapiDispatchConfig {
  enabled: boolean;
  accessToken: string;
  conversionEvent: ConversionMode;
  testMode: boolean;
  testEventCode: string | null;
}

export type CapiSkipReason =
  | "tracking-disabled"
  | "no-access-token"
  | "conversion-event-mismatch";

export type CapiDispatch =
  | { send: true; testEventCode: string | null }
  | { send: false; reason: CapiSkipReason; message: string };

/**
 * Single gate for every CAPI send: tracking must be enabled, carry an access
 * token, and the merchant must have chosen `eventName` as the conversion
 * event for the given business stage.
 */
export function resolveCapiDispatch(
  config: CapiDispatchConfig | null | undefined,
  eventName: MetaEventName,
  stage?: ConversionStage,
): CapiDispatch {
  if (!config?.enabled) {
    return { send: false, reason: "tracking-disabled", message: "Tracking disabled in store settings" };
  }
  if (!config.accessToken) {
    return {
      send: false,
      reason: "no-access-token",
      message: "No CAPI access token — configure it in Settings → Meta Pixel",
    };
  }

  if (stage) {
    const decision = resolveConversionForStage(config.conversionEvent, stage);
    if (!decision.shouldFire || decision.eventName !== eventName) {
      return {
        send: false,
        reason: "conversion-event-mismatch",
        message:
          decision.reason ??
          `Conversion event is set to ${config.conversionEvent} — ${eventName} not sent at stage ${stage}`,
      };
    }
  } else {
    const allowed =
      (eventName === "Purchase" &&
        (config.conversionEvent === "Purchase" ||
          config.conversionEvent === "Purchase_Confirmed" ||
          config.conversionEvent === "Purchase_Delivered")) ||
      (eventName === "Lead" && config.conversionEvent === "Lead");

    if (!allowed) {
      return {
        send: false,
        reason: "conversion-event-mismatch",
        message: `Conversion event is set to ${config.conversionEvent} — ${eventName} not sent`,
      };
    }
  }

  return { send: true, testEventCode: config.testMode ? config.testEventCode : null };
}

/** Meta's hard limit on event_time — older events are audited skips. */
export const SEVEN_DAYS_SECONDS = 7 * 24 * 3600;

/** Deterministic claim key: any trigger source targeting the same business conversion produces the same key. */
export function getCapiEffectKey(
  orderId: string,
  stage: ConversionStage,
  eventName: MetaEventName,
): string {
  return `meta-capi:${orderId}:${stage}:${eventName}`;
}

/** In-flight lease window (upstream: 10 minutes). */
export const CAPI_LEASE_MS = 10 * 60 * 1000;

/** Retry matrix: 5 attempts, 30 s exponential backoff. */
export const CAPI_MAX_ATTEMPTS = 5;
export const CAPI_RETRY_BASE_MS = 30_000;

export function capiRetryDelayMs(attempt: number): number {
  return CAPI_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}
