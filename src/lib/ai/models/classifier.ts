/**
 * SahelFlow AI Intent Classifier
 * Zero-latency rule-based classification that determines which model(s)
 * should handle a given request. No LLM call needed for routing.
 *
 * Supports multilingual input: English, French, Arabic, Darija/Franco-Arab.
 */

// ===== INTENT TYPES =====

export type IntentType =
	| "extraction"
	| "business_query"
	| "tool_execution"
	| "creative_writing"
	| "data_validation"
	| "code_generation"
	| "vision_analysis"
	| "complex_orchestration"
	| "simple_chat";

export interface IntentAnalysis {
	/** Primary detected intent */
	primaryIntent: IntentType;
	/** Confidence score 0-1 */
	confidence: number;
	/** Secondary intents that might need chaining */
	subIntents: IntentType[];
	/** Task complexity */
	complexity: "simple" | "moderate" | "complex";
	/** Whether the task needs tool calling */
	requiresTools: boolean;
	/** Whether the task needs creative text generation */
	requiresCreativity: boolean;
	/** Whether the task needs precise structured output */
	requiresStructuredOutput: boolean;
	/** Whether deep reasoning is needed */
	requiresDeepReasoning: boolean;
	/** Detected language(s) in input */
	language: "en" | "fr" | "ar" | "darija" | "mixed" | "unknown";
	/** Whether the input contains substantial Darija/Franco-Arab */
	hasDarija: boolean;
}

// ===== KEYWORD DICTIONARIES =====

const INTENT_KEYWORDS: Record<IntentType, string[]> = {
	extraction: [
		"extract",
		"parse",
		"محتوى الرسالة",
		"رقم الهاتف",
		"اسم",
		"wilaya",
		"commande",
		"طلبية",
	],
	business_query: [
		"stats",
		"revenue",
		"orders",
		"dashboard",
		"performance",
		"how am i doing",
		"report",
		"تحليل",
		"إحصائيات",
		"chiffre",
		"ventes",
		"bilan",
	],
	tool_execution: [
		"create order",
		"create product",
		"update",
		"delete",
		"ship",
		"confirm",
		"block",
		"toggle",
		"ajouter",
		"حذف",
		"تعديل",
		"envoyer",
		"créer",
		"confirmer",
	],
	creative_writing: [
		"write",
		"template",
		"message",
		"draft",
		"copy",
		"promo",
		"a3mlili",
		"كتب",
		"رسالة",
		"modèle",
		"rédiger",
		"communication",
	],
	data_validation: [
		"validate",
		"check",
		"verify",
		"format",
		"structure",
		"schema",
		"is this correct",
		"صحيح",
		"vérifier",
	],
	code_generation: [
		"sql",
		"query",
		"json",
		"code",
		"script",
		"automation",
		"function",
	],
	vision_analysis: [
		"image",
		"picture",
		"photo",
		"screenshot",
		"visual",
		"صورة",
	],
	complex_orchestration: [
		"analyze and create",
		"extract and write",
		"find and update",
		"complex",
		"multi-step",
		"workflow",
		"orchestrate",
	],
	simple_chat: [
		"hello",
		"hi",
		"bonjour",
		"salut",
		"مرحبا",
		"hey",
		"comment ça va",
		"كيف حالك",
	],
};

// Darija / Franco-Arab vocabulary markers
const DARIJA_MARKERS = [
	"بغيت",
	"حاب",
	"شحال",
	"بزاف",
	"صح",
	"خي",
	"مرحبا",
	"واش",
	"كيفاه",
	"نچي",
	"رايح",
	"نشري",
	"3andi",
	"bghit",
	"hab",
	"chhal",
	"bzaf",
	"sah",
	"khi",
	"wach",
	"kifah",
	"nji",
	"rayeh",
	"nchri",
];

// ===== CLASSIFICATION ENGINE =====

/**
 * Classify user input intent without any LLM call.
 * Returns in < 1ms — used for zero-latency routing.
 */
export function classifyIntent(
	input: string,
	context?: { hasImage?: boolean; conversationHistory?: string },
): IntentAnalysis {
	const lowerInput = input.toLowerCase();
	const scores: Record<IntentType, number> = {
		extraction: 0,
		business_query: 0,
		tool_execution: 0,
		creative_writing: 0,
		data_validation: 0,
		code_generation: 0,
		vision_analysis: 0,
		complex_orchestration: 0,
		simple_chat: 0,
	};

	// Keyword scoring
	for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
		for (const kw of keywords) {
			if (lowerInput.includes(kw.toLowerCase())) {
				scores[intent as IntentType] += 1;
			}
		}
	}

	// Boost extraction for typical WhatsApp order patterns
	if (/^(05|06|07|213)/.test(input) || /wilaya|ولاية|commune/i.test(input)) {
		scores.extraction += 2;
	}

	// Boost extraction for product + quantity patterns
	if (/\d+\s*x?\s*[a-zA-Z]+/i.test(input) && scores.extraction === 0) {
		scores.extraction += 1;
	}

	// Vision boost
	if (context?.hasImage) {
		scores.vision_analysis += 5;
	}

	// Detect complexity
	const wordCount = input.split(/\s+/).length;
	const hasMultipleActions =
		scores.tool_execution > 0 &&
		(scores.creative_writing > 0 || scores.extraction > 0);

	if (hasMultipleActions || wordCount > 40) {
		scores.complex_orchestration += 2;
	}

	// Detect language
	const hasArabic = /[\u0600-\u06FF]/.test(input);
	const hasFrancoArab =
		/[a-zA-Z][235789]|[235789][a-zA-Z]/.test(input) && /[a-zA-Z]/.test(input);
	const hasFrench =
		/\b(le|la|les|je|tu|il|nous|vous|et|ou|mais|donc|pour|dans|sur|avec|sans|comment|quel|combien|pourquoi|comment|merci|svp)\b/i.test(
			input,
		);
	const hasEnglish =
		/\b(the|a|an|i|you|he|she|we|they|and|or|but|so|for|in|on|with|without|how|what|which|why|thank|please)\b/i.test(
			input,
		);

	// Darija detection
	let darijaScore = 0;
	for (const marker of DARIJA_MARKERS) {
		if (lowerInput.includes(marker.toLowerCase())) {
			darijaScore += 1;
		}
	}
	const hasDarija = darijaScore >= 2 || (hasArabic && hasFrancoArab);

	// Language classification
	let language: IntentAnalysis["language"] = "unknown";
	if (hasDarija) language = "darija";
	else if (hasArabic && hasFrench) language = "mixed";
	else if (hasArabic) language = "ar";
	else if (hasFrench && hasEnglish) language = "mixed";
	else if (hasFrench) language = "fr";
	else if (hasEnglish) language = "en";

	// Simple extraction shortcut: if it's just contact info, skip classification
	const isSimpleExtraction =
		scores.extraction >= 2 &&
		wordCount < 15 &&
		!scores.tool_execution &&
		!scores.business_query;

	if (isSimpleExtraction) {
		return {
			primaryIntent: "extraction",
			confidence: 0.9,
			subIntents: [],
			complexity: "simple",
			requiresTools: false,
			requiresCreativity: false,
			requiresStructuredOutput: true,
			requiresDeepReasoning: false,
			language,
			hasDarija,
		};
	}

	// Determine primary intent
	const sortedIntents = Object.entries(scores).sort((a, b) => b[1] - a[1]);
	const [topIntent, topScore] = sortedIntents[0];
	const [, secondScore] = sortedIntents[1] || ["", 0];

	let primaryIntent = topIntent as IntentType;
	let confidence =
		topScore > 0 ? Math.min(topScore / Math.max(secondScore, 1), 1) : 0;

	// Low confidence defaults
	if (topScore === 0) {
		primaryIntent = "simple_chat";
		confidence = 0.5;
	} else if (confidence < 0.4 && scores.tool_execution > 0) {
		primaryIntent = "tool_execution";
		confidence = 0.6;
	} else if (confidence < 0.3) {
		primaryIntent = "business_query";
		confidence = 0.5;
	}

	// Complexity
	const complexity: IntentAnalysis["complexity"] =
		wordCount > 50 || hasMultipleActions
			? "complex"
			: wordCount > 25
				? "moderate"
				: "simple";

	return {
		primaryIntent,
		confidence: Math.round(confidence * 100) / 100,
		subIntents: sortedIntents
			.slice(1, 3)
			.filter(([, s]) => s > 0)
			.map(([i]) => i as IntentType),
		complexity,
		requiresTools: scores.tool_execution > 0 || scores.business_query > 0,
		requiresCreativity: scores.creative_writing > 0,
		requiresStructuredOutput:
			scores.extraction > 0 ||
			scores.data_validation > 0 ||
			scores.code_generation > 0,
		requiresDeepReasoning:
			scores.business_query > 1 || complexity === "complex",
		language,
		hasDarija,
	};
}

/**
 * Quick check: does this input need the heavy models, or can Flash handle it?
 * Used for pre-routing before the full classifier.
 */
export function isFlashWorthy(input: string): boolean {
	const lower = input.toLowerCase().trim();

	// Very short messages with phone numbers
	if (lower.length < 30 && /(05|06|07)\d{8}/.test(lower)) return true;

	// Just a name + wilaya
	if (lower.length < 40 && /wilaya?\s*\d{1,2}/i.test(lower)) return true;

	// Simple product requests
	if (/^(i want|je veux|بغيت|bghit)/i.test(lower) && lower.length < 50)
		return true;

	// Simple availability check
	if (/available|disponible|available/i.test(lower) && lower.length < 30)
		return true;

	return false;
}

/**
 * Detect if the input is a greeting that doesn't need any model at all.
 */
export function isGreeting(input: string): boolean {
	const lower = input.toLowerCase().trim();
	const greetings = [
		"hi",
		"hello",
		"hey",
		"bonjour",
		"salut",
		"مرحبا",
		"صباح",
		"مساء",
		"salam",
		"sup",
		"yo",
	];
	return greetings.some((g) => lower.includes(g));
}
