import "server-only";

import { db, type DbClient } from "@/lib/db";
import { SETTING_KEYS } from "@/lib/settings";
import { SahelFlowError } from "@/types/errors";

export const ALGERIAN_DEMO_VERSION = "algerian-cod-founder-v1";
export const ALGERIAN_DEMO_MARKER_KEY = "demo_seed_version";
export const ALGERIAN_DEMO_CREATED_AT_KEY = "demo_seed_created_at";

/**
 * One runtime-local critical section for operations that can change or consume
 * the demo/external-effect boundary.
 *
 * SahelFlow's packaged Next.js server is the sole local API process. Serializing
 * demo load/remove, report-setting writes and report generation here prevents a
 * check-then-write race, while the database transactions below still provide
 * rollback and cross-statement atomicity. The queue always releases after
 * failure, so one rejected operation cannot deadlock later work.
 */
let demoPolicyTail: Promise<void> = Promise.resolve();

export async function withDemoPolicyLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previous = demoPolicyTail;
  let release!: () => void;
  demoPolicyTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export async function isAlgerianDemoLoaded(
  client: DbClient = db,
): Promise<boolean> {
  const marker = await client.setting.findUnique({
    where: { key: ALGERIAN_DEMO_MARKER_KEY },
    select: { value: true },
  });
  return marker?.value === ALGERIAN_DEMO_VERSION;
}

function asSettingString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function dailyReportWouldBeEffectful(settings: {
  [key: string]: unknown;
}): boolean {
  const enabled =
    asSettingString(settings[SETTING_KEYS.dailyReportEnabled]).toLowerCase() ===
    "true";
  const destination = asSettingString(
    settings[SETTING_KEYS.dailyReportPhone],
  );
  return enabled || destination.length > 0;
}

/**
 * Demo orders are intentionally realistic but must never leave the local
 * evaluation boundary. Settings updates are checked using their complete
 * effective after-state so a partial update cannot retain an already configured
 * phone or schedule.
 */
export async function assertDemoAllowsDailyReportSettings(
  client: DbClient,
  effectiveSettings: { [key: string]: unknown },
): Promise<void> {
  if (
    dailyReportWouldBeEffectful(effectiveSettings) &&
    (await isAlgerianDemoLoaded(client))
  ) {
    throw new SahelFlowError(
      "Disable and clear the WhatsApp daily report before using it with an Algerian demo workspace. Demo-derived business data cannot be sent to a real recipient.",
      "DEMO_REPORT_CONFIGURATION_BLOCKED",
      409,
    );
  }
}
