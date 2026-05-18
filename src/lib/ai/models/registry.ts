/**
 * SahelFlow Multi-Model AI Registry
 * Defines all 5 specialized Groq models with their capabilities, limits, and roles.
 *
 * All models are available on Groq free tier. Rate limits are per Groq
 * Developer plan (as of 2026-04-30).
 */

// ===== MODEL DEFINITIONS =====

export interface ModelProfile {
	id: string;
	/** Display name shown in the UI (debug mode) */
	displayName: string;
	/** Groq API model identifier */
	groqModel: string;
	/** One-line description of purpose */
	purpose: string;
	/** What this model excels at */
	strengths: string[];
	/** Speed classification */
	speed: "ultra" | "fast" | "medium" | "slow";
	/** Daily request budget — helps the router decide */
	requestBudget: "high" | "medium" | "low";
	/** Maximum tokens per request */
	maxTokens: number;
	/** Default temperature */
	defaultTemp: number;
	/** Supports tool calling */
	supportsTools: boolean;
	/** Supports parallel tool calls (multiple tools in one request) */
	supportsParallelTools: boolean;
	/** Reliability for structured JSON output (0-1) */
	jsonReliability: number;
	/** Algerian Darija / Franco-Arab understanding (0-5) */
	darijaLevel: number;
	/** Rate limits */
	limits: {
		rpm: number;
		rpd: number;
		tpm: number;
		tpd: number;
	};
}

/** The 5 specialized models that power SahelFlow AI */
export const MODELS: Record<string, ModelProfile> = {
	flash: {
		id: "flash",
		displayName: "Sahara-Flash",
		groqModel: "llama-3.1-8b-instant",
		purpose: "Ultra-fast first-pass classifier and simple extractor",
		strengths: [
			"Pattern matching",
			"Phone number extraction",
			"Simple keyword detection",
			"Intent classification",
			"Sub-200ms responses",
		],
		speed: "ultra",
		requestBudget: "high",
		maxTokens: 1024,
		defaultTemp: 0.1,
		supportsTools: true,
		supportsParallelTools: false,
		jsonReliability: 0.85,
		darijaLevel: 2,
		limits: { rpm: 30, rpd: 14400, tpm: 6000, tpd: 500000 },
	},

	brain: {
		id: "brain",
		displayName: "Sahara-Brain",
		groqModel: "meta-llama/llama-4-scout-17b-16e-instruct",
		purpose: "Primary AI agent — tool calling, business logic, multi-turn chat",
		strengths: [
			"Tool calling with 24+ tools",
			"Business analysis and insights",
			"Multi-step reasoning",
			"Multilingual (Darija/French/Arabic/English)",
			"Dashboard query execution",
		],
		speed: "fast",
		requestBudget: "high",
		maxTokens: 4096,
		defaultTemp: 0.3,
		supportsTools: true,
		supportsParallelTools: true,
		jsonReliability: 0.9,
		darijaLevel: 5,
		limits: { rpm: 30, rpd: 1000, tpm: 30000, tpd: 500000 },
	},

	deep: {
		id: "deep",
		displayName: "Sahara-Deep",
		groqModel: "openai/gpt-oss-120b",
		purpose:
			"Deep reasoning engine — risk analysis, forecasting, complex logic",
		strengths: [
			"Deep semantic analysis",
			"Multi-variable reasoning",
			"Customer risk profiling",
			"Business forecasting",
			"Complex Darija/Franco decoding",
		],
		speed: "medium",
		requestBudget: "medium",
		maxTokens: 4096,
		defaultTemp: 0.2,
		supportsTools: false, // ⚠️ Does NOT support tool calling on Groq
		supportsParallelTools: false,
		jsonReliability: 0.92,
		darijaLevel: 5,
		limits: { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 },
	},

	struct: {
		id: "struct",
		displayName: "Sahara-Struct",
		groqModel: "qwen/qwen3-32b",
		purpose:
			"Structured output engine — JSON generation, data validation, schema compliance",
		strengths: [
			"Precise JSON schema output",
			"Data validation and normalization",
			"SQL query generation",
			"Type-safe structured responses",
			"Highest RPM (60) for high-volume",
		],
		speed: "fast",
		requestBudget: "high",
		maxTokens: 4096,
		defaultTemp: 0.05,
		supportsTools: true,
		supportsParallelTools: false, // Unknown — safe default
		jsonReliability: 0.96,
		darijaLevel: 2,
		limits: { rpm: 60, rpd: 1000, tpm: 6000, tpd: 500000 },
	},

	craft: {
		id: "craft",
		displayName: "Sahara-Craft",
		groqModel: "llama-3.3-70b-versatile",
		purpose:
			"Creative engine — marketing copy, WhatsApp templates, promotional text",
		strengths: [
			"Marketing copywriting",
			"WhatsApp template generation",
			"Authentic Darija/Arabic tone",
			"Promotional message drafting",
			"Upsell suggestion text",
		],
		speed: "slow",
		requestBudget: "low",
		maxTokens: 4096,
		defaultTemp: 0.7,
		supportsTools: true,
		supportsParallelTools: false, // Unknown — safe default
		jsonReliability: 0.78,
		darijaLevel: 4,
		limits: { rpm: 30, rpd: 1000, tpm: 12000, tpd: 100000 },
	},
};

// ===== MODEL SELECTION HELPERS =====

/** Get a model profile by its internal ID */
export function getModel(id: string): ModelProfile | undefined {
	return MODELS[id];
}

/** Get a model profile by its Groq API model name */
export function getModelByGroqName(
	groqModel: string,
): ModelProfile | undefined {
	return Object.values(MODELS).find((m) => m.groqModel === groqModel);
}

/** All model IDs as an array */
export function getAllModelIds(): string[] {
	return Object.keys(MODELS);
}

/** All model profiles as an array */
export function getAllModels(): ModelProfile[] {
	return Object.values(MODELS);
}

/** Checks if a model ID exists in the registry */
export function isValidModelId(id: string): boolean {
	return id in MODELS;
}

/** Get the default/fallback model (Sahara-Brain) */
export function getDefaultModel(): ModelProfile {
	return MODELS.brain;
}

/** Get the fastest model for simple tasks */
export function getFastestModel(): ModelProfile {
	return MODELS.flash;
}

/** Get the most creative model for writing tasks */
export function getCreativeModel(): ModelProfile {
	return MODELS.craft;
}

/** Get the best model for structured JSON */
export function getStructuredModel(): ModelProfile {
	return MODELS.struct;
}

/** Get the model with the best Darija understanding */
export function getDarijaModel(): ModelProfile {
	return MODELS.brain; // Brain has level 5, Deep also 5 but no tools
}

/** Get models that support tool calling (for agent execution) */
export function getToolCapableModels(): ModelProfile[] {
	return Object.values(MODELS).filter((m) => m.supportsTools);
}

/** Get models that support parallel tool calls */
export function getParallelToolModels(): ModelProfile[] {
	return Object.values(MODELS).filter((m) => m.supportsParallelTools);
}
