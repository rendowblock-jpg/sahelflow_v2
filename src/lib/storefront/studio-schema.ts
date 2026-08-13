import { z } from "zod";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const text = (max: number) => z.string().max(max);

export const storefrontStudioThemeSchema = z.object({
  schemaVersion: z.literal(2),
  template: z.enum(["sahara", "atlas", "oasis"]),
  primaryColor: color,
  accentColor: color,
  backgroundColor: color,
  surfaceColor: color,
  textColor: color,
  showPrices: z.boolean(),
  showStock: z.boolean(),
  density: z.enum(["airy", "balanced", "compact"]),
  radius: z.enum(["soft", "rounded", "sharp"]),
  announcement: z.object({ enabled: z.boolean(), text: text(160) }),
  hero: z.object({
    enabled: z.boolean(),
    style: z.enum(["editorial", "split", "centered"]),
    eyebrow: text(80),
    headline: text(140),
    body: text(320),
    ctaLabel: text(60),
  }),
  catalog: z.object({
    cardStyle: z.enum(["minimal", "elevated", "outlined"]),
    imageRatio: z.enum(["square", "portrait", "landscape"]),
    showSku: z.boolean(),
    showCategoryNavigation: z.boolean(),
  }),
  checkout: z.object({
    layout: z.enum(["drawer", "sticky", "inline"]),
    showOrderNotes: z.boolean(),
    showCodPromise: z.boolean(),
    codPromiseText: text(180),
  }),
  trust: z.object({
    showCodBadge: z.boolean(),
    showPhoneConfirmationBadge: z.boolean(),
    showDeliveryBadge: z.boolean(),
    showSupportBadge: z.boolean(),
  }),
});
