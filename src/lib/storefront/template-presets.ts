import type { StorefrontTemplateId } from "./presentation-types";

export interface StorefrontTemplatePreset {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
}

export const STOREFRONT_TEMPLATE_PRESETS: Readonly<Record<StorefrontTemplateId, StorefrontTemplatePreset>> = {
  sahara: {
    primaryColor: "#7C3F22",
    accentColor: "#F0A35E",
    backgroundColor: "#FFF8F1",
    surfaceColor: "#FFFFFF",
    textColor: "#211A17",
  },
  atlas: {
    primaryColor: "#155E75",
    accentColor: "#22A06B",
    backgroundColor: "#F5F8FA",
    surfaceColor: "#FFFFFF",
    textColor: "#111827",
  },
  oasis: {
    primaryColor: "#2F6B4F",
    accentColor: "#D97706",
    backgroundColor: "#F4F7F2",
    surfaceColor: "#FFFFFF",
    textColor: "#17201B",
  },
  // PRIME: the product alone on a lit stage. Forest-black page, brass for the one action, bone for text.
  prime: {
    primaryColor: "#C8A25B",
    accentColor: "#ECD29A",
    backgroundColor: "#07120E",
    surfaceColor: "#0E1F17",
    textColor: "#EFEAE0",
  },
  // SOUK: a market of colour chips. White page, ink text, saffron only for badges and counts.
  souk: {
    primaryColor: "#15172A",
    accentColor: "#F4B61F",
    backgroundColor: "#FFFFFF",
    surfaceColor: "#F5F6FA",
    textColor: "#15172A",
  },
  // REEL: black cinema. No accent colour of its own: the product's colourways are the colour.
  reel: {
    primaryColor: "#F1EFEA",
    accentColor: "#D9D4C7",
    backgroundColor: "#09090A",
    surfaceColor: "#141416",
    textColor: "#F1EFEA",
  },
};
