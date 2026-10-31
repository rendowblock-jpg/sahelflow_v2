// What the Today screen reads. The real source (decrypted relay projection) is
// slice S3b; here it is an interface so screens and tests use fakes.
export const FRESH_MS = 15 * 60_000;
export const OFFLINE_WINDOW_MS = 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

export type DayCount = Readonly<{ at: number; orders: number }>;
export type Projection = Readonly<{
  generatedAt: number;
  newOrders: number;
  toConfirm: number;
  inDelivery: number;
  codToCollectDzd: number;
  week: readonly DayCount[];
  // Held WhatsApp messages: shown only when the desktop publishes the count.
  whatsappHeld?: number | null;
}>;
export type ProjectionResult =
  | Readonly<{ ok: true; projection: Projection }>
  | Readonly<{ ok: false; reason: "none" | "unreadable" }>;
export interface ProjectionSource { load(): Promise<ProjectionResult> }

export type Freshness = "fresh" | "stale" | "expired";
export function freshness(generatedAt: number, now: number): Freshness {
  const age = now - generatedAt;
  // A phone clock far behind the data would make old data look fresh.
  if (age < -CLOCK_SKEW_MS) return "stale";
  if (age <= FRESH_MS) return "fresh";
  return age <= OFFLINE_WINDOW_MS ? "stale" : "expired";
}
