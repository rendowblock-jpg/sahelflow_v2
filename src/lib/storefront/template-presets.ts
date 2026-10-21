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
  // NOIR: a jeweller's window at night. Warm black, champagne for the one action, ivory for text.
  noir: {
    primaryColor: "#D9C7A3",
    accentColor: "#B8935A",
    backgroundColor: "#0F0E0D",
    surfaceColor: "#1A1815",
    textColor: "#F1EBDF",
  },
  // LUMEN: a lit spec sheet. Cool paper, graphite ink, one signal orange for the number that matters.
  lumen: {
    primaryColor: "#0E1114",
    accentColor: "#D93A0B",
    backgroundColor: "#F2F4F5",
    surfaceColor: "#FFFFFF",
    textColor: "#0E1114",
  },
  // ATELIER: paper from a workshop. Warm cream, brown ink, terracotta for the action, olive for the small print.
  atelier: {
    primaryColor: "#A9461F",
    accentColor: "#5E6B3A",
    backgroundColor: "#F2E9DA",
    surfaceColor: "#FBF6EC",
    textColor: "#2A1F18",
  },
  // PULSE: a drop. Acid lime field, black ink, a red sticker.
  pulse: {
    primaryColor: "#0B0B0B",
    accentColor: "#E5271B",
    backgroundColor: "#DDF93A",
    surfaceColor: "#FFFFFF",
    textColor: "#0B0B0B",
  },
  // BLOOM: a ritual. Blush page, plum ink, rose for the action, peach for the soft shapes.
  bloom: {
    primaryColor: "#B73A62",
    accentColor: "#F2B8A2",
    backgroundColor: "#FCF0EB",
    surfaceColor: "#FFFFFF",
    textColor: "#3A2230",
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
