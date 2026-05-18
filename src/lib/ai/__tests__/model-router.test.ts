import { describe, it, expect } from "vitest";
import { routeIntent, forceRoute } from "../models/router";
import { MODELS } from "../models/registry";
import type { IntentAnalysis } from "../models/classifier";

function makeIntent(partial: Partial<IntentAnalysis>): IntentAnalysis {
	return {
		primaryIntent: "business_query",
		confidence: 0.8,
		subIntents: [],
		complexity: "simple",
		requiresTools: false,
		requiresCreativity: false,
		requiresStructuredOutput: false,
		requiresDeepReasoning: false,
		language: "en",
		hasDarija: false,
		...partial,
	};
}

describe("AI Model Router", () => {
	describe("routeIntent — deterministic routing", () => {
		it("routes simple extraction to flash", () => {
			const decision = routeIntent(
				makeIntent({ primaryIntent: "extraction", complexity: "simple" }),
			);
			expect(decision.primary.id).toBe(MODELS.flash.id);
			expect(decision.strategy).toBe("preprocess_then_model");
			expect(decision.latencyEstimate).toBe("instant");
		});

		it("routes complex extraction to struct (non-Darija)", () => {
			const decision = routeIntent(
				makeIntent({ primaryIntent: "extraction", complexity: "moderate" }),
			);
			expect(decision.primary.id).toBe(MODELS.struct.id);
		});

		it("routes complex Darija extraction to brain", () => {
			const decision = routeIntent(
				makeIntent({
					primaryIntent: "extraction",
					complexity: "moderate",
					hasDarija: true,
				}),
			);
			expect(decision.primary.id).toBe(MODELS.brain.id);
			expect(decision.darijaOptimized).toBe(true);
		});

		it("routes tool execution to brain", () => {
			const decision = routeIntent(
				makeIntent({ primaryIntent: "tool_execution" }),
			);
			expect(decision.primary.id).toBe(MODELS.brain.id);
			expect(decision.fallback.id).toBe(MODELS.struct.id);
		});

		it("routes creative writing to craft", () => {
			const decision = routeIntent(
				makeIntent({ primaryIntent: "creative_writing" }),
			);
			expect(decision.primary.id).toBe(MODELS.craft.id);
			expect(decision.fallback.id).toBe(MODELS.brain.id);
			expect(decision.latencyEstimate).toBe("slow");
		});

		it("routes code generation to struct", () => {
			const decision = routeIntent(
				makeIntent({ primaryIntent: "code_generation" }),
			);
			expect(decision.primary.id).toBe(MODELS.struct.id);
		});

		it("routes data validation to struct", () => {
			const decision = routeIntent(
				makeIntent({ primaryIntent: "data_validation" }),
			);
			expect(decision.primary.id).toBe(MODELS.struct.id);
		});

		it("routes complex orchestration to brain (with chain)", () => {
			const decision = routeIntent(
				makeIntent({
					primaryIntent: "complex_orchestration",
					complexity: "complex",
					subIntents: ["extraction", "creative_writing"],
				}),
			);
			expect(decision.primary.id).toBe(MODELS.brain.id);
			expect(decision.strategy).toBe("chain");
			expect(decision.chain).toBeDefined();
			expect(decision.chain!.length).toBeGreaterThanOrEqual(2);
		});

		it("routes greetings to brain", () => {
			const decision = routeIntent(
				makeIntent({ primaryIntent: "simple_chat" }),
			);
			expect(decision.primary.id).toBe(MODELS.brain.id);
			expect(decision.latencyEstimate).toBe("fast");
		});

		it("routes deep business analysis to deep", () => {
			const decision = routeIntent(
				makeIntent({
					primaryIntent: "business_query",
					requiresDeepReasoning: true,
					requiresTools: false,
				}),
			);
			expect(decision.primary.id).toBe(MODELS.deep.id);
			expect(decision.fallback.id).toBe(MODELS.brain.id);
		});

		it("routes standard business query to brain", () => {
			const decision = routeIntent(
				makeIntent({
					primaryIntent: "business_query",
					requiresTools: true,
					requiresDeepReasoning: false,
				}),
			);
			expect(decision.primary.id).toBe(MODELS.brain.id);
		});

		it("sets darijaOptimized for Darija inputs", () => {
			const decision = routeIntent(makeIntent({ hasDarija: true }));
			expect(decision.darijaOptimized).toBe(true);
		});

		it("provides reasoning for all routes", () => {
			const decision = routeIntent(makeIntent({}));
			expect(typeof decision.reasoning).toBe("string");
			expect(decision.reasoning.length).toBeGreaterThan(0);
		});
	});

	describe("forceRoute", () => {
		it("forces a specific model", () => {
			const decision = forceRoute("deep");
			expect(decision.primary.id).toBe(MODELS.deep.id);
			expect(decision.fallback.id).toBe(MODELS.brain.id);
			expect(decision.strategy).toBe("single");
		});

		it("throws on unknown model ids", () => {
			expect(() => forceRoute("nonexistent")).toThrow("Unknown model ID");
		});
	});
});
