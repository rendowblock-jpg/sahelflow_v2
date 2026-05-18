/**
 * SahelFlow AI Model Router
 * Maps classified intents to the optimal model(s) for execution.
 *
 * Routing Rules:
 * 1. Simple extraction → Sahara-Flash (8B) — sub-second response
 * 2. Business query + tools → Sahara-Brain (Scout) — primary agent
 * 3. Complex Darija decoding → Sahara-Brain first, Deep fallback
 * 4. Creative writing → Sahara-Craft (70B)
 * 5. Structured JSON → Sahara-Struct (Qwen3)
 * 6. Deep reasoning (no tools) → Sahara-Deep (120B)
 * 7. Complex multi-step → Chain: Flash → Brain → Craft
 */

import type { IntentAnalysis } from "./classifier";
import { MODELS } from "./registry";
import type { ModelProfile } from "./registry";

export interface RouteDecision {
	/** The primary model to use */
	primary: ModelProfile;
	/** Fallback model if primary fails */
	fallback: ModelProfile;
	/** Chain of models for complex orchestration */
	chain?: ModelProfile[];
	/** Execution strategy */
	strategy: "single" | "chain" | "preprocess_then_model";
	/** Human-readable routing reason */
	reasoning: string;
	/** Estimated latency tier */
	latencyEstimate: "instant" | "fast" | "normal" | "slow";
	/** Whether this route uses the Darija-optimized model path */
	darijaOptimized: boolean;
}

/**
 * Route a classified intent to the best model configuration.
 * Deterministic — same input always routes the same way.
 */
export function routeIntent(intent: IntentAnalysis): RouteDecision {
	const {
		primaryIntent,
		complexity,
		requiresTools,
		requiresCreativity,
		requiresStructuredOutput,
		requiresDeepReasoning,
		hasDarija,
	} = intent;

	// ── GREETINGS ── Brain for Darija, Craft fallback for warmth
	if (primaryIntent === "simple_chat") {
		return {
			primary: MODELS.brain,
			fallback: MODELS.craft,
			strategy: "single",
			reasoning: "Simple greeting — Brain (Darija-native), Craft fallback for warmer tone",
			latencyEstimate: "fast",
			darijaOptimized: hasDarija,
		};
	}

	// ── SIMPLE EXTRACTION ── Flash model, Struct fallback (keeps speed + adds tools/JSON)
	if (primaryIntent === "extraction" && complexity === "simple") {
		return {
			primary: MODELS.flash,
			fallback: MODELS.struct,
			strategy: "preprocess_then_model",
			reasoning:
				"Simple extraction — Flash (sub-200ms), Struct fallback (fast + structured output + tools)",
			latencyEstimate: "instant",
			darijaOptimized: hasDarija,
		};
	}

	// ── COMPLEX EXTRACTION ── Brain for Darija nuance, Struct/Brain for JSON output
	if (
		primaryIntent === "extraction" &&
		(complexity === "moderate" || complexity === "complex")
	) {
		if (hasDarija) {
			return {
				primary: MODELS.brain,
				fallback: MODELS.struct,
				strategy: "single",
				reasoning:
					"Complex Darija extraction — Brain (Darija-5), Struct fallback (structured + tools)",
				latencyEstimate: "normal",
				darijaOptimized: true,
			};
		}
		return {
			primary: MODELS.struct,
			fallback: MODELS.brain,
			strategy: "single",
			reasoning:
				"Complex structured extraction — Struct (96% JSON), Brain fallback (Darija/tools)",
			latencyEstimate: "fast",
			darijaOptimized: false,
		};
	}

	// ── CREATIVE WRITING ── Craft model, Brain fallback (also Darija-5, can write authentically)
	if (primaryIntent === "creative_writing") {
		return {
			primary: MODELS.craft,
			fallback: MODELS.brain,
			strategy: "single",
			reasoning: "Creative writing — Craft (authentic Darija tone), Brain fallback (Darija-5, tool-aware)",
			latencyEstimate: "slow",
			darijaOptimized: hasDarija,
		};
	}

	// ── DATA VALIDATION / STRUCTURED OUTPUT ── Struct model, Brain fallback (tools + Darija context)
	if (
		primaryIntent === "data_validation" ||
		primaryIntent === "code_generation"
	) {
		return {
			primary: MODELS.struct,
			fallback: MODELS.deep,
			strategy: "single",
			reasoning:
				"Structured output — Struct (96% JSON), Deep fallback (deep reasoning, no tools)",
			latencyEstimate: "fast",
			darijaOptimized: false,
		};
	}

	// ── VISION ANALYSIS ── Not yet implemented, fallback to Brain
	if (primaryIntent === "vision_analysis") {
		return {
			primary: MODELS.brain,
			fallback: MODELS.deep,
			strategy: "single",
			reasoning:
				"Vision analysis — fallback to Brain (vision model coming soon)",
			latencyEstimate: "normal",
			darijaOptimized: false,
		};
	}

	// ── COMPLEX ORCHESTRATION ── Model chain
	if (primaryIntent === "complex_orchestration") {
		const chain: ModelProfile[] = [];

		if (intent.subIntents.includes("extraction")) {
			chain.push(MODELS.flash);
		}

		chain.push(MODELS.brain);

		if (requiresCreativity || intent.subIntents.includes("creative_writing")) {
			chain.push(MODELS.craft);
		}

		return {
			primary: MODELS.brain,
			fallback: MODELS.deep,
			chain: chain.length > 1 ? chain : undefined,
			strategy: "chain",
			reasoning: `Complex multi-step: ${chain.map((m) => m.displayName).join(" → ")}`,
			latencyEstimate: "slow",
			darijaOptimized: hasDarija,
		};
	}

	// ── TOOL EXECUTION ── Brain primary, Struct fallback (also tool-capable + JSON)
	if (primaryIntent === "tool_execution") {
		// If structured output is needed too, Brain handles both (it supports tools + JSON)
		if (requiresStructuredOutput) {
			return {
				primary: MODELS.brain,
				fallback: MODELS.struct,
				strategy: "single",
				reasoning:
					"Tool execution + structured output — Brain (parallel tools), Struct fallback (tools + JSON)",
				latencyEstimate: "normal",
				darijaOptimized: hasDarija,
			};
		}

		return {
			primary: MODELS.brain,
			fallback: MODELS.struct,
			strategy: "single",
			reasoning: "Tool execution — Brain (parallel tools), Struct fallback (tools + structured)",
			latencyEstimate: "normal",
			darijaOptimized: hasDarija,
		};
	}

	// ── BUSINESS QUERY ── Brain for data+tools, Deep for pure reasoning, Struct for structured
	if (primaryIntent === "business_query") {
		if (requiresDeepReasoning && !requiresTools) {
			return {
				primary: MODELS.deep,
				fallback: MODELS.brain,
				strategy: "single",
				reasoning:
					"Deep analysis (no tools) — Deep (120B reasoning), Brain fallback (Darija-5, tools if needed)",
				latencyEstimate: "normal",
				darijaOptimized: hasDarija,
			};
		}
		return {
			primary: MODELS.brain,
			fallback: MODELS.struct,
			strategy: "single",
			reasoning: "Business query — Brain (tools + data), Struct fallback (tools + structured output)",
			latencyEstimate: "normal",
			darijaOptimized: hasDarija,
		};
	}

	// ── DEFAULT ── Brain, Struct fallback (safer than Deep for general cases — has tools)
	return {
		primary: MODELS.brain,
		fallback: MODELS.struct,
		strategy: "single",
		reasoning: "Default — Brain (general agent), Struct fallback (tools + structured output)",
		latencyEstimate: "normal",
		darijaOptimized: hasDarija,
	};
}

/**
 * Force-route to a specific model (for testing/debugging/agent override).
 */
/**
 * Get the appropriate fallback for any model based on its role.
 * Flash → Struct (speed + tools), Struct → Brain (tools + Darija),
 * Brain → Struct (tools), Deep → Brain (Darija), Craft → Brain (Darija).
 */
function getModelFallback(model: ModelProfile): ModelProfile {
	switch (model.id) {
		case "flash":
			return MODELS.struct;
		case "struct":
			return MODELS.brain;
		case "brain":
			return MODELS.struct;
		case "deep":
			return MODELS.brain;
		case "craft":
			return MODELS.brain;
		default:
			return MODELS.brain;
	}
}

export function forceRoute(modelId: string): RouteDecision {
	const model = MODELS[modelId];
	if (!model) {
		throw new Error(`Unknown model ID: ${modelId}`);
	}
	return {
		primary: model,
		fallback: getModelFallback(model),
		strategy: "single",
		reasoning: `Forced route to ${model.displayName} (override)`,
		latencyEstimate:
			model.speed === "ultra" || model.speed === "fast" ? "fast" : "normal",
		darijaOptimized: model.darijaLevel >= 4,
	};
}
