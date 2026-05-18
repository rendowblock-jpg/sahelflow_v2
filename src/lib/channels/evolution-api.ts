/**
 * Evolution API Client
 *
 * Connects to a self-hosted Evolution API instance for WhatsApp messaging.
 * Each seller connects their personal WhatsApp via QR code scan.
 *
 * Docs: https://doc.evolution-api.com/
 */

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || "http://localhost:8080";
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || "";

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
	pairingCode: string | null;
	code: string;
	base64: string;
	count: number;
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

/* ── Helpers ── */

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

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);

	const res = await fetch(url, {
		...options,
		headers: { ...headers, ...options.headers },
		signal: controller.signal,
	}).finally(() => clearTimeout(timeout));

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Evolution API ${res.status}: ${body}`);
	}

	return res.json();
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

/** Logout (disconnect WhatsApp but keep instance) */
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
function normalizePhone(phone: string): string {
	let clean = phone.replace(/[^0-9]/g, "");
	// Algerian numbers: 0xxx → 213xxx
	if (clean.startsWith("0")) {
		clean = "213" + clean.slice(1);
	}
	// Ensure country code
	if (!clean.startsWith("213") && clean.length <= 10) {
		clean = "213" + clean;
	}
	return clean;
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
