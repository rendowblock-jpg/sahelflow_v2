import { z } from "zod";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const text = (max: number) => z.string().max(max);
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/);
const httpsUrl = z.string().url().max(2_048).refine((value) => new URL(value).protocol === "https:");
const settingValue = z.union([z.string().max(2_000), z.number().finite(), z.boolean(), z.null()]);
const settings = z.record(z.string().max(80), settingValue);

const storefrontMediaSchema = z.object({
  items: z.array(z.object({
    id,
    url: httpsUrl,
    alt: text(240),
    position: z.number().int().min(0).max(7),
  }).strict()).max(8),
  coverMediaId: id.nullable(),
}).strict().superRefine((media, context) => {
  const ids = new Set(media.items.map((item) => item.id));
  if (ids.size !== media.items.length) context.addIssue({ code: "custom", message: "Duplicate media id" });
  if (media.items.some((item, index) => item.position !== index)) {
    context.addIssue({ code: "custom", message: "Media positions must be contiguous" });
  }
  if (media.coverMediaId !== null && !ids.has(media.coverMediaId)) {
    context.addIssue({ code: "custom", message: "Cover media must belong to its media set" });
  }
});

const storefrontSectionSchema = z.object({
  id,
  type: z.enum([
    "announcement", "navbar", "hero", "trust", "featured-products",
    "product-grid", "categories", "media", "testimonials", "faq",
    "cod-checkout", "support", "footer",
  ]),
  enabled: z.boolean(),
  settings,
  blocks: z.array(z.object({ id, type: id, settings }).strict()).max(50),
}).strict();

export const storefrontCompositionSchema = z.object({
  page: z.enum(["home", "product", "checkout", "thank-you"]),
  sections: z.array(storefrontSectionSchema).min(1).max(50),
}).strict().superRefine((composition, context) => {
  const ids = composition.sections.flatMap((section) => [
    section.id,
    ...section.blocks.map((block) => block.id),
  ]);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Section and block ids must be unique" });
  }
});

const storefrontContactSchema = z.object({
  phone: text(64),
  whatsapp: text(64),
  email: text(254),
  address: text(240),
}).strict();

const storefrontBuilderSchema = z.object({
  schemaVersion: z.literal(1),
  composition: storefrontCompositionSchema,
  productMedia: z.record(id, storefrontMediaSchema),
  collections: z.array(z.object({
    id,
    title: text(120),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
    enabled: z.boolean(),
    productIds: z.array(id).max(500),
    media: storefrontMediaSchema,
  }).strict()).max(100),
  seo: z.object({
    title: text(120),
    description: text(320),
    socialImageUrl: httpsUrl.nullable(),
    noIndex: z.boolean(),
  }).strict(),
  // Existing V2 rows predate contact-in-theme. Defaulting here upgrades them in
  // memory without invalidating their composition, SEO, media or shipping state.
  contact: storefrontContactSchema.optional().default({
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
  }),
  domain: z.object({
    hostname: z.string().max(253).nullable(),
    status: z.enum(["disconnected", "pending", "verified", "error"]),
    verificationName: z.string().max(253).nullable(),
    verificationValue: z.string().max(512).nullable(),
    lastCheckedAt: z.string().datetime().nullable(),
  }).strict(),
  shippingRules: z.array(z.object({
    wilayaCode: z.string().regex(/^(0[1-9]|[1-5][0-9]|6[0-9])$/),
    deliveryMode: z.enum(["home", "desk"]),
    feeDzd: z.number().int().min(0).max(100_000),
  }).strict()).max(138),
}).strict().superRefine((builder, context) => {
  const keys = builder.shippingRules.map((rule) => `${rule.wilayaCode}:${rule.deliveryMode}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["shippingRules"], message: "Duplicate shipping rule" });
  }
});

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
  builder: storefrontBuilderSchema,
}).strict();

export const storefrontStudioDraftSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/),
  description: z.string().max(500),
  theme: storefrontStudioThemeSchema,
  selectedProductIds: z.array(z.string().min(2).max(128)).min(1).max(500),
  isActive: z.boolean(),
}).strict();
