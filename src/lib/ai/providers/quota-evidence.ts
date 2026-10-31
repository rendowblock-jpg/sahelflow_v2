/**
 * Is the Gemini key probably a free one? The app cannot ask Google. The only
 * sign it has is its own record: the end of the last Gemini quota pause is
 * kept in the settings table (ai_quota_pause_until_gemini) and never cleared.
 * Best effort: an unreadable store means "no sign", i.e. a normal key.
 */
import { getSetting } from "@/lib/settings";
import type { ServiceContext } from "@/lib/data/service-base";
import { geminiFreeKeyEvidence } from "./quota-state";

export const GEMINI_PAUSE_SETTING = "ai_quota_pause_until_gemini";

export async function readGeminiFreeKeyEvidence(context: ServiceContext, now: Date = new Date()): Promise<boolean> {
  try {
    return geminiFreeKeyEvidence(await getSetting(context, GEMINI_PAUSE_SETTING), now);
  } catch {
    return false;
  }
}
