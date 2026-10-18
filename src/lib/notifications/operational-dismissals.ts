import "server-only";

import { db } from "@/lib/db";
import type { TrustedActorContext } from "@/lib/identity/trusted-actor";

import { notificationRecipientId } from "./notification-center";
import {
  addDismissals,
  parseDismissedAlerts,
  removeDismissals,
  serializeDismissedAlerts,
  type AlertText,
} from "./operational-dismissals-core";

export {
  addDismissals,
  alertFingerprint,
  DISMISSED_ALERT_LIMIT,
  filterDismissedAlerts,
  isAlertDismissed,
  parseDismissedAlerts,
  removeDismissals,
  serializeDismissedAlerts,
  type AlertText,
  type DismissedAlerts,
} from "./operational-dismissals-core";

/** Setting-table key: one entry per member. See operational-dismissals-core.ts for the why. */
const SETTING_PREFIX = "notification_dismissed:";

function settingKey(context: TrustedActorContext): string {
  return `${SETTING_PREFIX}${notificationRecipientId(context)}`;
}

// One shop database has one server process, so ordering writes here is enough
// to stop two quick actions (clear one, then clear all) from overwriting each
// other's read-modify-write of the same member's entry.
const writeQueues = new Map<string, Promise<unknown>>();

function inOrder<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const run = previous.then(work, work);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  writeQueues.set(key, settled);
  void settled.then(() => {
    if (writeQueues.get(key) === settled) writeQueues.delete(key);
  });
  return run;
}

/** This member's dismissals. Never throws: the feed must load without them. */
export async function readDismissedAlerts(
  context: TrustedActorContext,
): Promise<Map<string, string>> {
  try {
    const row = await db.setting.findUnique({ where: { key: settingKey(context) } });
    return parseDismissedAlerts(row?.value);
  } catch {
    return new Map();
  }
}

async function change(
  context: TrustedActorContext,
  update: (current: Map<string, string>) => Map<string, string>,
): Promise<Map<string, string>> {
  const key = settingKey(context);
  return inOrder(key, async () => {
    const row = await db.setting.findUnique({ where: { key } });
    const next = update(parseDismissedAlerts(row?.value));
    if (next.size === 0) {
      await db.setting.deleteMany({ where: { key } });
    } else {
      const value = serializeDismissedAlerts(next);
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    return next;
  });
}

/** Remember that this member cleared these alerts, as they are shown now. */
export async function dismissOperationalAlerts(
  context: TrustedActorContext,
  alerts: readonly AlertText[],
): Promise<{ dismissed: number }> {
  await change(context, (current) => addDismissals(current, alerts));
  return { dismissed: alerts.length };
}

/** Bring cleared alerts back (the Undo action). */
export async function restoreOperationalAlerts(
  context: TrustedActorContext,
  ids: readonly string[],
): Promise<{ restored: number }> {
  await change(context, (current) => removeDismissals(current, ids));
  return { restored: ids.length };
}
