/**
 * SahelFlow AI Model Health Monitor
 * Tracks model availability, rate limits, and circuit breaker state.
 *
 * Pattern: Circuit breaker + exponential backoff recovery.
 * If a model fails 3 times consecutively, it's marked unhealthy.
 * After 60s, a probe is sent. If it succeeds, health is restored.
 */

import type { ModelProfile } from "./registry";
import { MODELS, getAllModels } from "./registry";
import { callLLM } from "@/lib/agents/groq";

// ===== HEALTH STATE =====

export interface ModelHealth {
	modelId: string;
	available: boolean;
	lastCheckedAt: number; // timestamp ms
	lastSuccessAt: number | null;
	lastFailureAt: number | null;
	consecutiveFailures: number;
	totalRequests: number;
	totalFailures: number;
	totalRateLimited: number;
	totalTimeout: number;
	avgLatencyMs: number;
	/** When the model was marked unhealthy (circuit breaker open) */
	circuitBreakerOpenedAt: number | null;
}

type HealthRecord = Record<string, ModelHealth>;

const healthStore: HealthRecord = {};

// Circuit breaker config
const FAILURE_THRESHOLD = 3;
const RECOVERY_INTERVAL_MS = 60_000; // 60 seconds

function initHealth(modelId: string): ModelHealth {
	const now = Date.now();
	return {
		modelId,
		available: true,
		lastCheckedAt: now,
		lastSuccessAt: now,
		lastFailureAt: null,
		consecutiveFailures: 0,
		totalRequests: 0,
		totalFailures: 0,
		totalRateLimited: 0,
		totalTimeout: 0,
		avgLatencyMs: 0,
		circuitBreakerOpenedAt: null,
	};
}

function getHealth(modelId: string): ModelHealth {
	if (!healthStore[modelId]) {
		healthStore[modelId] = initHealth(modelId);
	}
	return healthStore[modelId];
}

// ===== CIRCUIT BREAKER =====

function shouldAllowRequest(health: ModelHealth): boolean {
	if (health.available) return true;

	// Circuit breaker is open — check if recovery time has passed
	if (health.circuitBreakerOpenedAt) {
		const elapsed = Date.now() - health.circuitBreakerOpenedAt;
		if (elapsed >= RECOVERY_INTERVAL_MS) {
			// Transition to half-open: allow one probe
			return true;
		}
	}

	return false;
}

function markSuccess(health: ModelHealth, latencyMs: number): void {
	health.available = true;
	health.consecutiveFailures = 0;
	health.lastSuccessAt = Date.now();
	health.circuitBreakerOpenedAt = null;
	health.totalRequests++;

	// Rolling average latency (exponential moving average)
	const alpha = 0.3;
	health.avgLatencyMs =
		health.avgLatencyMs === 0
			? latencyMs
			: Math.round(health.avgLatencyMs * (1 - alpha) + latencyMs * alpha);
}

function markFailure(
	health: ModelHealth,
	errorType: "5xx" | "timeout" | "rate_limited" | "other",
): void {
	health.totalRequests++;
	health.totalFailures++;
	health.consecutiveFailures++;
	health.lastFailureAt = Date.now();

	if (errorType === "rate_limited") {
		health.totalRateLimited++;
	} else if (errorType === "timeout") {
		health.totalTimeout++;
	}

	if (health.consecutiveFailures >= FAILURE_THRESHOLD) {
		health.available = false;
		health.circuitBreakerOpenedAt = Date.now();
	}
}

// ===== PUBLIC API =====

/**
 * Check if a model is healthy enough to receive requests.
 */
export function isModelHealthy(modelId: string): boolean {
	const health = getHealth(modelId);
	return shouldAllowRequest(health);
}

/**
 * Check if a model is in circuit breaker recovery (half-open).
 */
export function isModelRecovering(modelId: string): boolean {
	const health = getHealth(modelId);
	return !health.available && health.circuitBreakerOpenedAt !== null;
}

/**
 * Get health for all models.
 */
export function getAllHealth(): ModelHealth[] {
	return Object.values(MODELS).map((m) => getHealth(m.id));
}

/**
 * Get health for a specific model.
 */
export function getModelHealth(modelId: string): ModelHealth {
	return getHealth(modelId);
}

/**
 * Record a successful request.
 */
export function recordSuccess(modelId: string, latencyMs: number): void {
	markSuccess(getHealth(modelId), latencyMs);
}

/**
 * Record a failed request.
 */
export function recordFailure(
	modelId: string,
	errorType: "5xx" | "timeout" | "rate_limited" | "other",
): void {
	markFailure(getHealth(modelId), errorType);
}

/**
 * Record a rate limit hit (429).
 */
export function recordRateLimited(modelId: string): void {
	recordFailure(modelId, "rate_limited");
}

/**
 * Record a timeout.
 */
export function recordTimeout(modelId: string): void {
	recordFailure(modelId, "timeout");
}

// ===== PROBE / HEALTH CHECK =====

/**
 * Send a lightweight probe to a model to test availability.
 * Used for circuit breaker recovery.
 */
export async function probeModel(
	model: ModelProfile,
): Promise<{ available: boolean; latencyMs: number }> {
	const start = Date.now();
	try {
		await callLLM(
			[
				{
					role: "user",
					content: 'Reply with "ok" only. No additional text.',
				},
			],
			{
				model: model.groqModel,
				maxTokens: 10,
				temperature: 0,
			},
		);
		const latency = Date.now() - start;
		recordSuccess(model.id, latency);
		return { available: true, latencyMs: latency };
	} catch {
		const latency = Date.now() - start;
		recordFailure(model.id, "5xx");
		return { available: false, latencyMs: latency };
	}
}

/**
 * Probe all models and update health store.
 */
export async function probeAllModels(): Promise<ModelHealth[]> {
	await Promise.allSettled(getAllModels().map((m) => probeModel(m)));
	return getAllHealth();
}

/**
 * Get a summary string for logging.
 */
export function getHealthSummary(): string {
	const healths = getAllHealth();
	return healths
		.map(
			(h) =>
				`${h.modelId}:${h.available ? "✅" : "❌"}(` +
				`fail=${h.consecutiveFailures}/${h.totalFailures},` +
				`lat=${h.avgLatencyMs}ms)`,
		)
		.join(" | ");
}

/**
 * Reset health for a model (useful after manual intervention).
 */
export function resetHealth(modelId: string): void {
	healthStore[modelId] = initHealth(modelId);
}
