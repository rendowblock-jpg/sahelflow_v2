import {
  DEFAULT_RISK_CONFIG,
  type RiskEngineConfig,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

/**
 * Normalize persisted Risk Engine settings into the current runtime schema.
 *
 * Older SahelFlow builds stored a different nested shape:
 * - thresholds: { medium, high, critical }
 * - weights: customerReturnRate/customerLoyalty/newCustomer/orderFrequency/
 *   wilayaRisk/orderValue/contactQuality
 * - autoActions: string actions instead of current booleans
 *
 * Setting rows survive application upgrades, so a shallow object spread is not
 * sufficient: a legacy nested object can replace the entire current default
 * object and leave required fields undefined. Keep reads durable-state pure and
 * translate the old shape in memory instead of silently rewriting the row.
 */
export function normalizeRiskConfig(value: unknown): RiskEngineConfig {
  const source = record(value);
  const weights = record(source.weights);
  const thresholds = record(source.thresholds);
  const autoActions = record(source.autoActions);

  const legacyThresholdShape =
    thresholds.low === undefined && thresholds.critical !== undefined;
  const thresholdCandidate = legacyThresholdShape
    ? {
        low: thresholds.medium,
        medium: thresholds.high,
        high: thresholds.critical,
      }
    : {
        low: thresholds.low,
        medium: thresholds.medium,
        high: thresholds.high,
      };

  const normalizedThresholds = {
    low: boundedNumber(
      thresholdCandidate.low,
      DEFAULT_RISK_CONFIG.thresholds.low,
      0,
      100,
    ),
    medium: boundedNumber(
      thresholdCandidate.medium,
      DEFAULT_RISK_CONFIG.thresholds.medium,
      0,
      100,
    ),
    high: boundedNumber(
      thresholdCandidate.high,
      DEFAULT_RISK_CONFIG.thresholds.high,
      0,
      100,
    ),
  };
  const thresholdsAreAscending =
    normalizedThresholds.low < normalizedThresholds.medium &&
    normalizedThresholds.medium < normalizedThresholds.high;

  return {
    weights: {
      customerHistory: boundedNumber(
        firstDefined(weights.customerHistory, weights.customerReturnRate),
        DEFAULT_RISK_CONFIG.weights.customerHistory,
        0,
        2,
      ),
      geography: boundedNumber(
        firstDefined(weights.geography, weights.wilayaRisk),
        DEFAULT_RISK_CONFIG.weights.geography,
        0,
        2,
      ),
      orderValue: boundedNumber(
        weights.orderValue,
        DEFAULT_RISK_CONFIG.weights.orderValue,
        0,
        2,
      ),
      contactQuality: boundedNumber(
        weights.contactQuality,
        DEFAULT_RISK_CONFIG.weights.contactQuality,
        0,
        2,
      ),
      behavior: boundedNumber(
        firstDefined(weights.behavior, weights.orderFrequency),
        DEFAULT_RISK_CONFIG.weights.behavior,
        0,
        2,
      ),
    },
    thresholds: thresholdsAreAscending
      ? normalizedThresholds
      : { ...DEFAULT_RISK_CONFIG.thresholds },
    autoActions: {
      autoConfirmLow: booleanValue(
        autoActions.autoConfirmLow,
        DEFAULT_RISK_CONFIG.autoActions.autoConfirmLow,
      ),
      autoHoldCritical: booleanValue(
        autoActions.autoHoldCritical,
        DEFAULT_RISK_CONFIG.autoActions.autoHoldCritical,
      ),
      autoFlagBlacklist: booleanValue(
        autoActions.autoFlagBlacklist,
        DEFAULT_RISK_CONFIG.autoActions.autoFlagBlacklist,
      ),
    },
    autoBlacklistReturnRate: boundedNumber(
      source.autoBlacklistReturnRate,
      DEFAULT_RISK_CONFIG.autoBlacklistReturnRate,
      0,
      1,
    ),
  };
}
