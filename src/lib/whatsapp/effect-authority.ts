import "server-only";

import { createHmac } from "node:crypto";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import type { ServiceContext } from "@/lib/data/service-base";
import type { ShopContext } from "@/lib/shops/context";

const EFFECT_SCOPE_PURPOSE = "sahelflow/whatsapp/effect-scope/v1";
const REQUEST_BINDING_PURPOSE = "sahelflow/whatsapp/request-binding/v1";

export type WhatsAppEffectKind = "text" | "daily-report";

export interface WhatsAppEffectAuthority {
  effectKey: string;
  requestBinding: string;
}

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

/**
 * Derive the opaque authority sent to the sidecar receipt journal.
 *
 * The key is the stable, shop-local business envelope key, which is stored in
 * the shop database wrapped by the installation master key. The scope includes
 * the exact workspace, installation, shop and shop-incarnation identities.
 * Consequently the derived values survive process/sidecar restarts but cannot
 * collide across a different installation, shop or restored shop incarnation.
 * The rotating SIDECAR_TOKEN is intentionally not part of either derivation.
 */
export function deriveWhatsAppEffectAuthority(
  shop: ShopContext,
  envelopeKey: Buffer,
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
  const effectKey = `wa:${scopeId}:${kind}:${assertLocalEffectId(localEffectId)}`;
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
  context: ServiceContext,
  kind: WhatsAppEffectKind,
  localEffectId: string,
  to: string,
  text: string,
): Promise<WhatsAppEffectAuthority> {
  if (!context.shop) {
    throw new Error("WhatsApp effects require an exact trusted ShopContext");
  }
  return deriveWhatsAppEffectAuthority(
    context.shop,
    await getBusinessEnvelopeKey(context),
    kind,
    localEffectId,
    to,
    text,
  );
}
