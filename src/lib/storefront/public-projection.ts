import type { StorefrontConfig } from "./service";

/**
 * Public storefront routes never serialize hosted domain verification material.
 * The desktop draft keeps that control-plane projection for the seller only.
 * The legal block (with its reviewed fingerprint) is the seller's too: buyers get it only through the release artifact.
 */
export function projectPublicStorefrontConfig(config: StorefrontConfig): StorefrontConfig {
  const { legal: _privateLegal, ...builder } = {
    ...config.theme.builder,
    domain: {
      hostname: config.theme.builder.domain.hostname,
      status: config.theme.builder.domain.status,
      verificationName: null,
      verificationValue: null,
      lastCheckedAt: null,
    },
  };
  return {
    ...config,
    theme: { ...config.theme, builder },
  };
}
