import type { StorefrontConfig } from "./service";

/**
 * Public storefront routes never serialize hosted domain verification material.
 * The desktop draft keeps that control-plane projection for the seller only.
 */
export function projectPublicStorefrontConfig(config: StorefrontConfig): StorefrontConfig {
  return {
    ...config,
    theme: {
      ...config.theme,
      builder: {
        ...config.theme.builder,
        domain: {
          hostname: config.theme.builder.domain.hostname,
          status: config.theme.builder.domain.status,
          verificationName: null,
          verificationValue: null,
          lastCheckedAt: null,
        },
      },
    },
  };
}
