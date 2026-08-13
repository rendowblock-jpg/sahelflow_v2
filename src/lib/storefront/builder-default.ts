import {
  STOREFRONT_BUILDER_SCHEMA_VERSION,
  type StorefrontBuilderState,
} from "./presentation-types";
import { createDefaultStorefrontComposition } from "./studio-sections";

export function createDefaultStorefrontBuilderState(): StorefrontBuilderState {
  return {
    schemaVersion: STOREFRONT_BUILDER_SCHEMA_VERSION,
    composition: createDefaultStorefrontComposition(),
    productMedia: {},
    collections: [],
    seo: { title: "", description: "", socialImageUrl: null, noIndex: false },
    domain: {
      hostname: null,
      status: "disconnected",
      verificationName: null,
      verificationValue: null,
      lastCheckedAt: null,
    },
    shippingRules: [],
  };
}
