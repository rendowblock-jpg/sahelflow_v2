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
};
