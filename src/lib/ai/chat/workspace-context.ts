import "server-only";

/**
 * Workspace setup awareness for the AI agent — read-only, presentation only.
 *
 * What is configured in THIS workspace right now (setup checklist, WhatsApp
 * link, couriers, AI consent, storefronts, automations, licence), so a "how do
 * I ship?" answer starts from the seller's real next step ("connect a courier
 * first") rather than a generic manual. Booleans, counts and provider names
 * only — never a secret, a phone number or a customer record.
 *
 * Every probe is independently fallible: a failed probe drops its line (never
 * a guessed value), and the whole block degrades to "" without breaking a turn.
 */

import {
  ONBOARDING_PROGRESS_SETTING_KEY,
  parseOnboardingProgress,
} from "@/components/onboarding/onboarding-progress";
import type { DbClient } from "@/lib/db";
import {
  DELIVERY_PROVIDERS,
  deliverySecretKeys,
} from "@/lib/integrations/delivery/types";
import type { ShopContext } from "@/lib/shops/context";

const GEMINI_CONSENT_SETTING_KEY = "gemini_consent_accepted";
const WHATSAPP_STATUS_TIMEOUT_MS = 800;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface AiWorkspaceStatus {
  shopBasics: boolean | null;
  setupFinishedOnce: boolean | null;
  aiConsent: boolean | null;
  dailyReport: boolean | null;
  whatsapp: string | null;
  couriers: string[] | null;
  storefronts: { total: number; active: number } | null;
  automations: { total: number; active: number } | null;
  license: { status: string; type: string | null; daysLeft: number | null } | null;
}

export interface AiWorkspaceProbes {
  whatsappStatus: () => Promise<string>;
  hasSecret: (key: string) => Promise<boolean>;
  license: () => Promise<{ status: string; type: string | null; expiresAt: string | null }>;
  now?: Date;
}

async function settled<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

export async function loadWorkspaceStatus(
  prisma: DbClient,
  probes: AiWorkspaceProbes,
): Promise<AiWorkspaceStatus> {
  const now = probes.now ?? new Date();
  const [settings, whatsapp, couriers, storefronts, automations, license] =
    await Promise.all([
      settled(async () => {
        const rows = await prisma.setting.findMany({
          where: {
            key: {
              in: [
                "profile_name",
                "business_wilaya",
                ONBOARDING_PROGRESS_SETTING_KEY,
                GEMINI_CONSENT_SETTING_KEY,
                "daily_report_enabled",
              ],
            },
          },
          select: { key: true, value: true },
        });
        return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<
          string,
          string
        >;
      }),
      settled(probes.whatsappStatus),
      settled(async () => {
        const connected: string[] = [];
        for (const provider of DELIVERY_PROVIDERS) {
          const present = await Promise.all(
            deliverySecretKeys(provider).map((key) => probes.hasSecret(key)),
          );
          if (present.some(Boolean)) connected.push(provider);
        }
        return connected;
      }),
      settled(async () => ({
        total: await prisma.storefrontConfig.count(),
        active: await prisma.storefrontConfig.count({ where: { isActive: true } }),
      })),
      settled(async () => ({
        total: await prisma.automation.count(),
        active: await prisma.automation.count({ where: { isActive: true } }),
      })),
      settled(probes.license),
    ]);

  const expiresAt = license?.expiresAt ? new Date(license.expiresAt) : null;
  return {
    shopBasics:
      settings == null
        ? null
        : (settings.profile_name ?? "").trim() !== "" &&
          (settings.business_wilaya ?? "").trim() !== "",
    setupFinishedOnce:
      settings == null
        ? null
        : parseOnboardingProgress(settings[ONBOARDING_PROGRESS_SETTING_KEY])?.finishedAt != null,
    aiConsent: settings == null ? null : settings[GEMINI_CONSENT_SETTING_KEY] === "true",
    dailyReport: settings == null ? null : settings.daily_report_enabled === "true",
    whatsapp,
    couriers,
    storefronts,
    automations,
    license: license
      ? {
          status: license.status,
          type: license.type,
          daysLeft:
            expiresAt && !Number.isNaN(expiresAt.getTime())
              ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS))
              : null,
        }
      : null,
  };
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

/** Render the status as context lines. Unknown values are left out. */
export function workspaceStatusLines(status: AiWorkspaceStatus): string[] {
  const lines: string[] = [];
  const setup: string[] = [];
  if (status.shopBasics != null) setup.push(`shop basics ${yesNo(status.shopBasics)}`);
  if (status.whatsapp != null) setup.push(`WhatsApp connected ${yesNo(status.whatsapp === "connected")}`);
  if (status.couriers != null) setup.push(`courier connected ${yesNo(status.couriers.length > 0)}`);
  if (status.aiConsent != null) setup.push(`AI extraction consent ${yesNo(status.aiConsent)}`);
  if (setup.length > 0) lines.push(`Setup checklist (/onboarding): ${setup.join("; ")}.`);
  if (status.whatsapp != null && status.whatsapp !== "connected") {
    lines.push(
      status.whatsapp === "unavailable"
        ? "WhatsApp service: unavailable right now (saved conversations stay readable)."
        : `WhatsApp link state: ${status.whatsapp} (connect from /inbox).`,
    );
  }
  if (status.couriers != null) {
    lines.push(
      status.couriers.length > 0
        ? `Couriers connected: ${status.couriers.join(", ")}.`
        : "No courier is connected yet (Settings → Delivery, /settings?group=delivery).",
    );
  }
  if (status.storefronts) {
    lines.push(`Storefronts: ${status.storefronts.active} active of ${status.storefronts.total}.`);
  }
  if (status.automations) {
    lines.push(`Automations: ${status.automations.active} active of ${status.automations.total}.`);
  }
  if (status.dailyReport != null) {
    lines.push(`Daily phone report: ${status.dailyReport ? "on" : "off"}.`);
  }
  if (status.license) {
    const parts = [`status ${status.license.status}`];
    if (status.license.type) parts.push(`type ${status.license.type}`);
    if (status.license.daysLeft != null) parts.push(`${status.license.daysLeft} day(s) left`);
    lines.push(`Licence: ${parts.join(", ")}.`);
  }
  return lines;
}

/** Live probes against this installation. */
export async function liveWorkspaceStatus(
  prisma: DbClient,
  shop: ShopContext,
): Promise<AiWorkspaceStatus> {
  const [{ sidecar }, { hasSecret }, { getLicenseAuthorityProjection }] = await Promise.all([
    import("@/lib/whatsapp/sidecar-client"),
    import("@/lib/secrets"),
    import("@/lib/license/license-authority"),
  ]);
  return loadWorkspaceStatus(prisma, {
    whatsappStatus: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const status = await Promise.race([
          sidecar.status(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), WHATSAPP_STATUS_TIMEOUT_MS);
          }),
        ]);
        return status.status;
      } catch {
        return "unavailable";
      } finally {
        clearTimeout(timer);
      }
    },
    hasSecret: (key) => hasSecret({ prisma, shop }, key),
    license: () => getLicenseAuthorityProjection(shop),
  });
}
