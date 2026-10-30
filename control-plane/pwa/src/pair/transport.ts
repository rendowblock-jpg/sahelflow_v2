import type { ExchangeBody, ExchangeResult, PairingTransport } from "./flow";

// Real fetch behind PairingTransport. No cookies, no referrer. The relay has
// no CORS yet (S1), so this only works once S1 lands; tests use a fake fetch.
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
      if (typeof rec.deviceId !== "string" || typeof rec.deviceToken !== "string") return { ok: false, reason: "network" };
      // The relay activates the device at once; the desktop approval gate is S2, so the phone treats it as pending.
      return { ok: true, deviceId: rec.deviceId, deviceToken: rec.deviceToken, approval: "pending" };
    },
  };
}
