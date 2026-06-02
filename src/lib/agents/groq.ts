/**
 * SahelFlow Groq Client
 * Centralized AI model access via Groq
 * Model: meta-llama/llama-4-scout-17b-16e-instruct
 *
 * Why this model (Free Tier Sustainability):
 * - 30K TPM / 500K TPD (vs 8K/200K on gpt-oss-120b) — 2.5x more daily budget
 * - 1-2s response time (vs 8-15s on gpt-oss-120b) — 5-8x faster
 * - 1K RPD (same as gpt-oss-120b) — plenty for single-seller usage
 * - Tool calling & multilingual support sufficient for Algerian e-commerce
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export interface ChatMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	name?: string;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}>;
	tool_call_id?: string;
}

export interface GroqOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	jsonMode?: boolean;
	/** Optional per-request API key (overrides env var). Used for per-model key isolation. */
	apiKey?: string;
	tools?: Array<{
		type: "function";
		function: {
			name: string;
			description?: string;
			parameters?: Record<string, unknown>;
		};
	}>;
	tool_choice?:
		| "auto"
		| "any"
		| "none"
		| { type: "function"; function: { name: string } };
}

/**
 * Phase 5.10: Exponential backoff with jitter.
 * Prevents thundering herd when multiple concurrent requests hit rate limits
 * or server errors — they no longer all retry at the same exact moment.
 */
function retryDelay(attempt: number, baseMs: number = 1500): number {
	// Exponential backoff: 1.5s, 3s, 4.5s + random jitter [0, 1000ms)
	return attempt * baseMs + Math.floor(Math.random() * 1000);
}

/**
 * Call Groq with messages and return the raw text response.
 * Includes retry logic with exponential backoff + jitter for rate limits and transient errors.
 */
export async function callLLM(
	messages: ChatMessage[],
	options: GroqOptions = {},
): Promise<string> {
	const apiKey = options.apiKey || process.env.GROQ_API_KEY;
	if (!apiKey) {
		throw new Error("Missing required environment variable: GROQ_API_KEY");
	}

	const {
		model = DEFAULT_MODEL,
		temperature = 0.3,
		maxTokens = 2048,
		jsonMode = false,
	} = options;

	const body: Record<string, unknown> = {
		model,
		messages,
		temperature,
		max_tokens: maxTokens,
	};

	if (jsonMode) {
		body.response_format = { type: "json_object" };
	}

	if (options.tools) {
		body.tools = options.tools;
		if (options.tool_choice) body.tool_choice = options.tool_choice;
	}

	const maxRetries = 3;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 30000);

			const res = await fetch(GROQ_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://sahelflow.vercel.app",
					"X-Title": "SahelFlow AI",
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			clearTimeout(timeout);

			if (res.status === 429) {
				const retryAfter = Number(res.headers.get("retry-after") || 2);
				const delay = retryAfter * 1000 + Math.floor(Math.random() * 1000);
				console.warn(
					`[Groq] Rate limited, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			if (res.status === 502 || res.status === 503) {
				const delay = retryDelay(attempt + 1);
				console.warn(
					`[Groq] ${res.status}, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			if (!res.ok) {
				const errText = await res.text();
				console.error(`[Groq] ${res.status}: ${errText}`);
				throw new Error(`Groq API error: ${res.status}`);
			}

			const data = await res.json();
			const content = data.choices?.[0]?.message?.content;
			if (content === undefined || content === null) {
				console.warn("[Groq] No content in response choices");
				throw new Error("Groq returned empty response");
			}
			return content;
		} catch (err) {
			if (
				(err instanceof DOMException && err.name === "AbortError") ||
				(err instanceof Error && err.name === "AbortError")
			) {
				console.warn(`[Groq] Request timed out (attempt ${attempt + 1})`);
				if (attempt < maxRetries - 1) {
					const delay = retryDelay(attempt + 1);
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}
			}
			if (attempt >= maxRetries - 1) throw err;
		}
	}
	throw new Error("Groq API failed after max retries");
}

/**
 * Call Groq with tools and return the full message payload (content + tool_calls)
 */
export async function callLLMWithTools(
	messages: ChatMessage[],
	options: GroqOptions = {},
): Promise<{
	content: string;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}>;
}> {
	const apiKey = options.apiKey || process.env.GROQ_API_KEY;
	if (!apiKey) {
		throw new Error("Missing required environment variable: GROQ_API_KEY");
	}

	const {
		model = DEFAULT_MODEL,
		temperature = 0.3,
		maxTokens = 2048,
		tools,
		tool_choice,
	} = options;

	const body: Record<string, unknown> = {
		model,
		messages,
		temperature,
		max_tokens: maxTokens,
	};

	if (tools) body.tools = tools;
	if (tool_choice) body.tool_choice = tool_choice;

	const maxRetries = 3;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 30000);

			const res = await fetch(GROQ_URL, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://sahelflow.vercel.app",
					"X-Title": "SahelFlow AI",
				},
				body: JSON.stringify(body),
				signal: controller.signal,
			});

			clearTimeout(timeout);

			if (res.status === 429) {
				// Rate limited — wait with jitter and retry
				const retryAfter = Number(res.headers.get("retry-after") || 2);
				const delay = retryAfter * 1000 + Math.floor(Math.random() * 1000);
				console.warn(
					`[Groq] Rate limited, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			if (res.status === 503 || res.status === 502) {
				// Server overloaded — retry with exponential backoff + jitter
				const delay = retryDelay(attempt + 1);
				console.warn(
					`[Groq] ${res.status}, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			if (!res.ok) {
				const errText = await res.text();
				console.error(`[Groq Tools] ${res.status}: ${errText}`);
				throw new Error(`Groq API error: ${res.status} - ${errText}`);
			}

			const data = await res.json();
			return data.choices?.[0]?.message || { content: "" };
		} catch (err) {
			if (
				(err instanceof DOMException && err.name === "AbortError") ||
				(err instanceof Error && err.name === "AbortError")
			) {
				console.warn(`[Groq] Request timed out (attempt ${attempt + 1})`);
				if (attempt < maxRetries - 1) {
					const delay = retryDelay(attempt + 1);
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}
			}
			throw err;
		}
	}
	throw new Error("Groq API failed after max retries");
}

/**
 * Call Groq and parse the response as JSON of type T
 * Uses json_mode for reliable structured output
 */
export async function callLLMJson<T>(
	messages: ChatMessage[],
	options: GroqOptions = {},
): Promise<T> {
	const raw = await callLLM(messages, { ...options, jsonMode: true });

	// Strip any markdown code fences the model might still add
	const cleaned = raw
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/i, "")
		.trim();

	try {
		return JSON.parse(cleaned) as T;
	} catch (e) {
		throw new Error(
			`Failed to parse LLM JSON response: ${(e as Error).message}. Raw: ${raw.substring(0, 200)}`,
		);
	}
}
