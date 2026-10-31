import type { StorefrontConfig } from "./service";

/**
 * Public storefront routes never serialize hosted domain verification material.
 * The desktop draft keeps that control-plane projection for the seller only.
 */
export function projectPublicStorefrontConfig(config: StorefrontConfig): StorefrontConfig {
  // The legal block (with its reviewed fingerprint) is the seller's; buyers get it only through the release artifact.
  const { legal: _privateLegal, ...builder } = config.theme.builder;
  return {
    ...config,
    theme: {
      ...config.theme,
      builder: {
        ...builder,
        domain: {
          hostname: builder.domain.hostname,
          status: builder.domain.status,
          verificationName: null,
          verificationValue: null,
          lastCheckedAt: null,
        },
      },
    },
  };
}
