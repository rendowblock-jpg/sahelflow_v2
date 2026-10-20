import type { StorefrontTemplateId } from "./presentation-types";

export interface StorefrontTemplatePreset {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
}

/**
 * The colours each template opens with (a seller can change all five in the Studio; a stored store keeps its own).
 * Each is a different world, not a different tint: sahara = chalk and madder red (Kabyle weaving, whitewashed walls),
 * atlas = white and ink with one vermilion (newsprint, shop signs), oasis = sage and pine with clay (M'zab adobe).
 */
export const STOREFRONT_TEMPLATE_PRESETS: Readonly<Record<StorefrontTemplateId, StorefrontTemplatePreset>> = {
  sahara: {
    primaryColor: "#8E2C1E",
    accentColor: "#C9962E",
    backgroundColor: "#F2EFE9",
    surfaceColor: "#FBFAF7",
    textColor: "#1B1613",
  },
  atlas: {
    primaryColor: "#0E0E10",
    accentColor: "#D9381E",
    backgroundColor: "#FFFFFF",
    surfaceColor: "#F6F6F4",
    textColor: "#0E0E10",
  },
  oasis: {
    primaryColor: "#1F4A38",
    accentColor: "#E8B79B",
    backgroundColor: "#F1F3EC",
    surfaceColor: "#FFFFFF",
    textColor: "#14211B",
  },
};
