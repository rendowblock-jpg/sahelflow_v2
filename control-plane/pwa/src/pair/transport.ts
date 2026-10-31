import type { ExchangeBody, ExchangeResult, PairingTransport } from "./flow";

// Real fetch behind PairingTransport. No cookies, no referrer. Tests use a fake
// fetch or the real relay worker.
export function createFetchTransport(options: Readonly<{ baseUrl: string; fetchImpl?: typeof fetch }>): PairingTransport {
  const base = options.baseUrl.replace(/\/+$/, "");
  return {
    async exchange(body: ExchangeBody): Promise<ExchangeResult> {
      const doFetch = options.fetchImpl ?? fetch;
      let response: Response;
      try {
        response = await doFetch(`${base}/v1/pairings/exchange`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
          credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
        });
      } catch { return { ok: false, reason: "network" }; }
      if (response.status === 404 || response.status === 410) return { ok: false, reason: "expired" };
      if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 409) return { ok: false, reason: "rejected" };
      if (!response.ok) return { ok: false, reason: "network" };
      const json: unknown = await response.json().catch(() => null);
      const rec = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
      const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
      const deviceId = text(rec.deviceId); const deviceToken = text(rec.deviceToken); const workspaceId = text(rec.workspaceId); const memberId = text(rec.memberId);
      if (!deviceId || !deviceToken || !workspaceId || !memberId) return { ok: false, reason: "network" };
      // A reply without the desktop's keys or proof is NOT a network error: it goes on
      // to the trust check, which refuses it with its own typed reason.
      // The relay activates the device at once; the desktop approval gate is S2, so the phone treats it as pending.
      return {
        ok: true, deviceId, deviceToken, workspaceId, memberId, shopId: text(rec.shopId), approval: "pending",
        desktopSigningPublicKey: typeof rec.desktopSigningPublicKey === "string" ? rec.desktopSigningPublicKey : "",
        desktopEncryptionPublicKey: typeof rec.desktopEncryptionPublicKey === "string" ? rec.desktopEncryptionPublicKey : "",
        desktopKeyProof: typeof rec.desktopKeyProof === "string" ? rec.desktopKeyProof : null,
      };
    },
  };
}
