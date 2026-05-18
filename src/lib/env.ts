function required(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value.trim();
}

function optional(key: string, fallback: string = ""): string {
	const value = process.env[key];
	return value ? value.trim() : fallback;
}

// ── Supabase ──
export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

// ── App ──
export const APP_URL = required("NEXT_PUBLIC_APP_URL");

// ── AI / LLM ──
export const GROQ_API_KEY = required("GROQ_API_KEY");

// Per-model API keys (optional — falls back to GROQ_API_KEY)
export const GROQ_API_KEY_FLASH = optional("GROQ_API_KEY_FLASH");
export const GROQ_API_KEY_BRAIN = optional("GROQ_API_KEY_BRAIN");
export const GROQ_API_KEY_DEEP = optional("GROQ_API_KEY_DEEP");
export const GROQ_API_KEY_STRUCT = optional("GROQ_API_KEY_STRUCT");
export const GROQ_API_KEY_CRAFT = optional("GROQ_API_KEY_CRAFT");

/** Resolve the API key for a specific model, falling back to the shared key */
export function getGroqApiKeyForModel(modelId: string): string {
	switch (modelId) {
		case "flash":
			return GROQ_API_KEY_FLASH || GROQ_API_KEY;
		case "brain":
			return GROQ_API_KEY_BRAIN || GROQ_API_KEY;
		case "deep":
			return GROQ_API_KEY_DEEP || GROQ_API_KEY;
		case "struct":
			return GROQ_API_KEY_STRUCT || GROQ_API_KEY;
		case "craft":
			return GROQ_API_KEY_CRAFT || GROQ_API_KEY;
		default:
			return GROQ_API_KEY;
	}
}

// ── Evolution API (optional — inbox won't work without it) ──
export const EVOLUTION_API_URL = optional("EVOLUTION_API_URL");
export const EVOLUTION_API_KEY = optional("EVOLUTION_API_KEY");

// ── Webhook Secrets (optional but recommended in production) ──
export const EVOLUTION_WEBHOOK_SECRET = optional("EVOLUTION_WEBHOOK_SECRET");
export const INTERNAL_WEBHOOK_SECRET = optional("INTERNAL_WEBHOOK_SECRET");
export const SHOPIFY_WEBHOOK_SECRET = optional("SHOPIFY_WEBHOOK_SECRET");

// ── Cron / Admin / Health endpoint gates ──
export const CRON_SECRET = optional("CRON_SECRET");
export const HEALTH_SECRET = optional("HEALTH_SECRET");
export const ADMIN_SECRET = optional("ADMIN_SECRET");

// ── Yalidine Delivery (optional) ──
export const YALIDINE_API_KEY = optional("YALIDINE_API_KEY");
export const YALIDINE_API_TOKEN = optional("YALIDINE_API_TOKEN");
