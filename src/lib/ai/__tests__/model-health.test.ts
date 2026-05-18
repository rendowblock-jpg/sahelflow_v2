import { describe, it, expect, beforeEach } from "vitest";
import {
	isModelHealthy,
	recordSuccess,
	recordFailure,
	recordRateLimited,
	recordTimeout,
	getModelHealth,
	getAllHealth,
	resetHealth,
} from "../models/health";
import { getAllModels } from "../models/registry";

describe("AI Model Health Monitor", () => {
	beforeEach(() => {
		// Reset all health states before each test
		getAllModels().forEach((m) => resetHealth(m.id));
	});

	describe("recordSuccess", () => {
		it("marks model as available", () => {
			recordSuccess("brain", 100);
			expect(isModelHealthy("brain")).toBe(true);
		});

		it("resets consecutive failures", () => {
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			recordSuccess("brain", 100);
			expect(getModelHealth("brain").consecutiveFailures).toBe(0);
		});

		it("calculates rolling average latency", () => {
			recordSuccess("brain", 100);
			expect(getModelHealth("brain").avgLatencyMs).toBe(100);
			recordSuccess("brain", 200);
			const health = getModelHealth("brain");
			expect(health.avgLatencyMs).toBeGreaterThan(100);
			expect(health.avgLatencyMs).toBeLessThan(200);
		});
	});

	describe("recordFailure", () => {
		it("tracks consecutive failures", () => {
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			expect(getModelHealth("brain").consecutiveFailures).toBe(2);
		});

		it("opens circuit breaker after 3 failures", () => {
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			expect(isModelHealthy("brain")).toBe(false);
			expect(getModelHealth("brain").circuitBreakerOpenedAt).not.toBeNull();
		});
	});

	describe("recordRateLimited", () => {
		it("tracks rate limit events", () => {
			recordRateLimited("brain");
			expect(getModelHealth("brain").totalRateLimited).toBe(1);
		});
	});

	describe("recordTimeout", () => {
		it("tracks timeout events", () => {
			recordTimeout("brain");
			expect(getModelHealth("brain").totalTimeout).toBe(1);
		});
	});

	describe("isModelHealthy", () => {
		it("returns true for healthy model", () => {
			expect(isModelHealthy("brain")).toBe(true);
		});

		it("returns false when circuit breaker is open", () => {
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			expect(isModelHealthy("brain")).toBe(false);
		});

		it("allows half-open probe after recovery interval", () => {
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			// Simulate time passing (mock would be better but this tests logic)
			const health = getModelHealth("brain");
			health.circuitBreakerOpenedAt = Date.now() - 120_000; // 2 min ago
			expect(isModelHealthy("brain")).toBe(true);
		});
	});

	describe("getAllHealth", () => {
		it("returns health for all registered models", () => {
			const healths = getAllHealth();
			const modelIds = getAllModels().map((m) => m.id);
			expect(healths.length).toBe(modelIds.length);
			healths.forEach((h) => {
				expect(modelIds).toContain(h.modelId);
			});
		});
	});

	describe("resetHealth", () => {
		it("fully resets a model's health", () => {
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			recordFailure("brain", "5xx");
			resetHealth("brain");
			expect(isModelHealthy("brain")).toBe(true);
			expect(getModelHealth("brain").consecutiveFailures).toBe(0);
		});
	});
});
