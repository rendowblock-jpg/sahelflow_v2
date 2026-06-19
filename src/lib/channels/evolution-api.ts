/**
 * Evolution API Client
 *
 * Connects to a self-hosted Evolution API instance for WhatsApp messaging.
 * Each seller connects their personal WhatsApp via QR code scan.
 *
 * Phase 5.9: Added retry with exponential backoff + jitter for transient failures.
 * Previously, a single 15s timeout = message lost. Now retries up to 3 times
 * with backoff, and queues persistent failures for webhook retry processor.
 *
 * Docs: https://doc.evolution-api.com/
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || "";

// W9 fix: Previously fell back to "http://localhost:8080" silently — in production,
// every WhatsApp message attempt failed with a connection error to localhost.
// Now we log a clear error if the URL is not configured.
if (!EVOLUTION_URL) {
  console.error(
    "[EvolutionAPI] EVOLUTION_API_URL environment variable is not set. " +
    "WhatsApp messaging will not work until configured.",
  );
}

const MAX_RETRIES = 3;

interface EvolutionResponse<T = unknown> {
	status: number;
	error?: string;
	response?: T;
	instance?: T;
}

interface InstanceInfo {
	instanceName: string;
	instanceId: string;
	status: string;
	owner?: string;
	profilePictureUrl?: string;
}

interface QRCodeResponse {
	pairingCode: string;
	code: string;
	base64: string;
}

interface SendTextRequest {
	number: string;
	text: string;
}

interface SendMediaRequest {
	number: string;
	mediatype: "image" | "video" | "audio" | "document";
	mimetype: string;
	caption?: string;
	media: string; // URL or base64
	fileName?: string;
}

/* ── Retry with exponential backoff + jitter ── */

/**
 * Phase 5.10/5.9: Exponential backoff with jitter.
 * Prevents thundering herd on concurrent failures.
 */
function retryDelayMs(attempt: number): number {
	// 1s, 2s, 4s + random jitter [0, 1000ms)
	const base = Math.pow(2, attempt) * 1000;
	return base + Math.floor(Math.random() * 1000);
}

/**
 * Determine if an error is retryable (transient/network/overloaded).
 */
function isRetryableError(err: unknown): boolean {
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		// Network/timeout errors
		if (
			msg.includes("abort") ||
			msg.includes("timeout") ||
			msg.includes("econnreset") ||
			msg.includes("econnrefused")
		)
			return true;
		// Server errors (5xx) — check the message pattern from our error format
		if (msg.includes("evolution api 5") || msg.includes("evolution api 429"))
			return true;
	}
	return false;
}

/* ── Core API with retry ── */

async function api<T>(
	path: string,
	options: RequestInit = {},
	_instanceName?: string,
): Promise<T> {
	const url = `${EVOLUTION_URL}${path}`;
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		apikey: EVOLUTION_KEY,
	};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);

		try {
			const res = await fetch(url, {
				...options,
				headers: { ...headers, ...options.headers },
				signal: controller.signal,
			}).finally(() => clearTimeout(timeout));

			// 429 Rate limited — wait with jitter
			if (res.status === 429) {
				const retryAfter = Number(res.headers.get("retry-after") || 2);
				const delay = retryAfter * 1000 + Math.floor(Math.random() * 1000);
				console.warn(
					`[Evolution API] Rate limited, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			// 5xx server errors — retry with backoff
			if (res.status >= 500) {
				const delay = retryDelayMs(attempt);
				console.warn(
					`[Evolution API] ${res.status}, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			if (!res.ok) {
				const body = await res.text();
				throw new Error(`Evolution API ${res.status}: ${body}`);
			}

			return res.json();
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));

			if (err instanceof DOMException && err.name === "AbortError") {
				const delay = retryDelayMs(attempt);
				console.warn(
					`[Evolution API] Request timed out, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			if (isRetryableError(err) && attempt < MAX_RETRIES - 1) {
				const delay = retryDelayMs(attempt);
				console.warn(
					`[Evolution API] Retryable error: ${lastError.message}, retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}

			// Non-retryable or max retries exceeded
			throw err;
		}
	}

	throw lastError || new Error("Evolution API failed after max retries");
}

/* ── Instance Management ── */

/** Create a new WhatsApp instance for a seller */
export async function createInstance(instanceName: string, webhookUrl: string) {
	return api<EvolutionResponse<InstanceInfo>>("/instance/create", {
		method: "POST",
		body: JSON.stringify({
			instanceName,
			integration: "WHATSAPP-BAILEYS",
			qrcode: true,
			webhook: {
				url: webhookUrl,
				byEvents: false,
				base64: false,
				events: [
					"MESSAGES_UPSERT",
					"MESSAGES_UPDATE",
					"CONNECTION_UPDATE",
					"QRCODE_UPDATED",
				],
			},
		}),
	});
}

/** Get QR code for an instance (for pairing) */
export async function getQRCode(instanceName: string) {
	return api<QRCodeResponse>(`/instance/connect/${instanceName}`, {
		method: "GET",
	});
}

/** Check instance connection status */
export async function getConnectionState(instanceName: string) {
	return api<{ instance: { state: string } }>(
		`/instance/connectionState/${instanceName}`,
		{ method: "GET" },
	);
}

/** Get instance info */
export async function getInstanceInfo(instanceName: string) {
	return api<InstanceInfo>(
		`/instance/fetchInstances?instanceName=${instanceName}`,
		{ method: "GET" },
	);
}

/** Disconnect and delete an instance */
export async function deleteInstance(instanceName: string) {
	return api(`/instance/delete/${instanceName}`, { method: "DELETE" });
}

/** Logout (disconnect WhatsApp from instance) */
export async function logoutInstance(instanceName: string) {
	return api(`/instance/logout/${instanceName}`, { method: "DELETE" });
}

/* ── Messaging ── */

/** Send a text message */
export async function sendText(instanceName: string, to: string, text: string) {
	return api(`/message/sendText/${instanceName}`, {
		method: "POST",
		body: JSON.stringify({
			number: normalizePhone(to),
			text,
		} satisfies SendTextRequest),
	});
}

/** Send a media message (image, document, etc.) */
export async function sendMedia(
	instanceName: string,
	to: string,
	media: {
		type: "image" | "video" | "audio" | "document";
		url: string;
		caption?: string;
		filename?: string;
		mimetype?: string;
	},
) {
	return api(`/message/sendMedia/${instanceName}`, {
		method: "POST",
		body: JSON.stringify({
			number: normalizePhone(to),
			mediatype: media.type,
			mimetype: media.mimetype || "application/octet-stream",
			caption: media.caption,
			media: media.url,
			fileName: media.filename,
		} satisfies SendMediaRequest),
	});
}

/** Mark messages as read */
export async function markAsRead(
	instanceName: string,
	remoteJid: string,
	messageIds: string[],
) {
	return api(`/chat/markMessageAsRead/${instanceName}`, {
		method: "PUT",
		body: JSON.stringify({
			readMessages: messageIds.map((id) => ({
				remoteJid,
				id,
			})),
		}),
	});
}

/* ── Utils ── */

/** Normalize phone number to WhatsApp format (country code + number) */
// Phase 6.16: Delegate to centralized phone-utils
import { toInternationalFormat } from "@/lib/phone-utils";

function normalizePhone(phone: string): string {
	return toInternationalFormat(phone) || phone;
}

/** Extract phone number from WhatsApp JID (e.g., "213555123456@s.whatsapp.net") */
export function phoneFromJid(jid: string): string {
	return jid.split("@")[0] || jid;
}

/** Check if a JID is a group chat */
export function isGroupJid(jid: string): boolean {
	return jid.includes("@g.us");
}

export { normalizePhone };
