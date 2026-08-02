import "server-only";

import { createHmac } from "node:crypto";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import type { ServiceContext } from "@/lib/data/service-base";
import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import { hashWhatsAppAccountId } from "../../../sidecars/whatsapp/auth-tokens";
import { sidecar } from "./sidecar-client";

const EFFECT_SCOPE_PURPOSE = "sahelflow/whatsapp/effect-scope/v1";
const REQUEST_BINDING_PURPOSE = "sahelflow/whatsapp/request-binding/v1";

export type WhatsAppEffectKind = "text" | "daily-report";

export interface WhatsAppEffectAuthority {
  effectKey: string;
  requestBinding: string;
}

type WhatsAppEffectContext = ServiceContext & {
  readonly whatsAppProviderAccountId?: string;
};

function canonicalScope(shop: ShopContext): string {
  return JSON.stringify([
    shop.workspaceId,
    shop.installationId,
    shop.shopId,
    shop.shopIncarnationId,
  ]);
}

function assertLocalEffectId(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(normalized)) {
    throw new Error("WhatsApp local effect ID has an invalid format");
  }
  return normalized;
}

async function resolveProviderAccountId(
  context: WhatsAppEffectContext,
): Promise<string> {
  if (context.whatsAppProviderAccountId) {
    return context.whatsAppProviderAccountId;
  }
  try {
    const status = await sidecar.status();
    if (status.status !== "connected" || !status.user?.id) {
      throw new SahelFlowError(
        "WhatsApp account identity is unavailable",
        "WHATSAPP_ACCOUNT_UNAVAILABLE",
        409,
      );
    }
    return status.user.id;
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "WhatsApp account identity could not be verified",
      "WHATSAPP_ACCOUNT_UNAVAILABLE",
      503,
    );
  }
}

/**
 * Derive the opaque authority sent to the sidecar receipt journal.
 *
 * The stable shop-local envelope key scopes the effect to the exact workspace,
 * installation, shop and shop incarnation. A SHA-256 provider-account hash is
 * also embedded, so logout/re-pair cannot replay or dispatch the effect under a
 * different WhatsApp account. Recipient, message and account plaintext never
 * enter the key or receipt journal.
 */
export function deriveWhatsAppEffectAuthority(
  shop: ShopContext,
  envelopeKey: Buffer,
  providerAccountId: string,
  kind: WhatsAppEffectKind,
  localEffectId: string,
  to: string,
  text: string,
): WhatsAppEffectAuthority {
  const scope = canonicalScope(shop);
  const scopeId = createHmac("sha256", envelopeKey)
    .update(EFFECT_SCOPE_PURPOSE)
    .update("\0")
    .update(scope)
    .digest("hex")
    .slice(0, 32);
  const providerAccountHash = hashWhatsAppAccountId(providerAccountId);
  const effectKey = `wa:${scopeId}:${providerAccountHash}:${kind}:${assertLocalEffectId(localEffectId)}`;
  const requestBinding = createHmac("sha256", envelopeKey)
    .update(REQUEST_BINDING_PURPOSE)
    .update("\0")
    .update(scope)
    .update("\0")
    .update(effectKey)
    .update("\0")
    .update(to)
    .update("\0")
    .update(text)
    .digest("hex");
  return { effectKey, requestBinding };
}

export async function createWhatsAppEffectAuthority(
  context: WhatsAppEffectContext,
  kind: WhatsAppEffectKind,
  localEffectId: string,
  to: string,
  text: string,
): Promise<WhatsAppEffectAuthority> {
  if (!context.shop) {
    throw new SahelFlowError(
      "WhatsApp effects require an exact trusted ShopContext",
      "WHATSAPP_SHOP_AUTHORITY_REQUIRED",
      500,
    );
  }
  return deriveWhatsAppEffectAuthority(
    context.shop,
    await getBusinessEnvelopeKey(context),
    await resolveProviderAccountId(context),
    kind,
    localEffectId,
    to,
    text,
  );
}
