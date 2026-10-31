import { z } from "zod";

/** GET /api/notifications/phone (built by the phone-alerts track). */
export const PHONE_ALERTS_ENDPOINT = "/api/notifications/phone";

export const phoneAlertsStatusSchema = z.object({
  phones: z.array(z.object({ id: z.string().min(1).max(128), label: z.string().max(80) })).max(20),
  enabled: z.boolean(),
  pcOnline: z.boolean(),
  pcLastOnlineAt: z.string().datetime().nullable(),
});

export type PhoneAlertsStatus = z.infer<typeof phoneAlertsStatusSchema>;

/** Throws when the server answers badly; the panel turns that into Retry. */
export async function fetchPhoneAlerts(fetchImpl: typeof fetch = fetch): Promise<PhoneAlertsStatus> {
  const response = await fetchImpl(PHONE_ALERTS_ENDPOINT, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("phone-alerts-unavailable");
  const parsed = phoneAlertsStatusSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("phone-alerts-unavailable");
  return parsed.data;
}

/** Shop clock (UTC+1) as HH:MM, for "not online since 14:05". */
export function shopClock(iso: string): string {
  return new Date(Date.parse(iso) + 3_600_000).toISOString().slice(11, 16);
}
