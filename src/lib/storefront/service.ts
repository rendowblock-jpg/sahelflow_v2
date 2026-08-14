/**
 * Storefront types + service.
 *
 * A StorefrontConfig holds the seller's mini-storefront settings. The public
 * storefront is served at /storefront/[slug] — customers browse products,
 * fill a COD form, and the order is created via /api/storefront/submit.
 *
 * The storefront is intentionally simple (Phase 0 #14 v1): one page, product
 * grid, cart, COD checkout. No custom domains, discount codes, or theming
 * beyond the 3 built-in templates (those are Phase 2).
 */
import "server-only";

import type { ServiceContext } from "@/lib/data/service-base";
import type { StorefrontTheme } from "./presentation-types";
import { DEFAULT_STOREFRONT_THEME } from "./theme-default";
import { normalizeStorefrontTheme } from "./theme-normalize";
import { storefrontStudioDraftSchema, storefrontStudioThemeSchema } from "./studio-schema";

export type { StorefrontTheme } from "./presentation-types";

export interface StorefrontContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
}

export interface StorefrontConfig {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  theme: StorefrontTheme;
  productIds: string[];
  contact: StorefrontContact | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorefrontStudioConfig extends StorefrontConfig {
  draftUpdatedAt: Date | null;
  liveUpdatedAt: Date;
}

type StorefrontRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  theme: string;
  productIds: string;
  contact: string | null;
  isActive: boolean;
  draftName: string | null;
  draftSlug: string | null;
  draftDescription: string | null;
  draftTheme: string | null;
  draftProductIds: string | null;
  draftIsActive: boolean | null;
  draftUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseConfig(row: StorefrontRow): StorefrontConfig {
  let parsedTheme: unknown = null;
  let parsedProductIds: unknown = [];
  let parsedContact: unknown = null;
  try { parsedTheme = JSON.parse(row.theme) as unknown; } catch { /* normalize fail-closed */ }
  try { parsedProductIds = JSON.parse(row.productIds) as unknown; } catch { /* empty projection */ }
  try { parsedContact = row.contact ? JSON.parse(row.contact) as unknown : null; } catch { /* empty projection */ }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    theme: normalizeStorefrontTheme(parsedTheme),
    productIds: Array.isArray(parsedProductIds)
      ? parsedProductIds.filter((item): item is string => typeof item === "string")
      : [],
    contact: parsedContact && typeof parsedContact === "object" && !Array.isArray(parsedContact)
      ? parsedContact as StorefrontContact
      : null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseStudioConfig(row: StorefrontRow): StorefrontStudioConfig {
  const live = parseConfig(row);
  if (!row.draftUpdatedAt) {
    return { ...live, draftUpdatedAt: null, liveUpdatedAt: live.updatedAt };
  }
  let draftTheme: unknown = null;
  let draftProductIds: unknown = [];
  try { draftTheme = row.draftTheme ? JSON.parse(row.draftTheme) as unknown : null; } catch { /* fail closed */ }
  try { draftProductIds = row.draftProductIds ? JSON.parse(row.draftProductIds) as unknown : []; } catch { /* fail closed */ }
  return {
    ...live,
    name: row.draftName ?? live.name,
    slug: row.draftSlug ?? live.slug,
    description: row.draftDescription,
    theme: normalizeStorefrontTheme(draftTheme),
    productIds: Array.isArray(draftProductIds)
      ? draftProductIds.filter((item): item is string => typeof item === "string")
      : [],
    isActive: row.draftIsActive ?? live.isActive,
    updatedAt: row.draftUpdatedAt,
    draftUpdatedAt: row.draftUpdatedAt,
    liveUpdatedAt: live.updatedAt,
  };
}

export const storefrontService = {
  async getBySlug(context: ServiceContext, slug: string): Promise<StorefrontConfig | null> {
    const row = await context.prisma.storefrontConfig.findUnique({ where: { slug } });
    if (!row) return null;
    return parseConfig(row);
  },

  async getById(context: ServiceContext, id: string): Promise<StorefrontConfig | null> {
    const row = await context.prisma.storefrontConfig.findUnique({ where: { id } });
    if (!row) return null;
    return parseConfig(row);
  },

  async getStudioDraftById(context: ServiceContext, id: string): Promise<StorefrontStudioConfig | null> {
    const row = await context.prisma.storefrontConfig.findUnique({ where: { id } });
    return row ? parseStudioConfig(row) : null;
  },

  async list(context: ServiceContext): Promise<StorefrontConfig[]> {
    const rows = await context.prisma.storefrontConfig.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(parseConfig);
  },

  async create(context: ServiceContext, input: {
    slug: string;
    name: string;
    description?: string;
    theme: StorefrontTheme;
    productIds: string[];
    contact?: StorefrontContact;
    isActive?: boolean;
  }): Promise<StorefrontConfig> {
    const theme = storefrontStudioThemeSchema.parse(input.theme);
    const row = await context.prisma.storefrontConfig.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        theme: JSON.stringify(theme),
        productIds: JSON.stringify(input.productIds),
        contact: input.contact ? JSON.stringify(input.contact) : null,
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return parseConfig(row);
  },

  async update(context: ServiceContext, id: string, input: Partial<{
    slug: string;
    name: string;
    description: string | null;
    theme: StorefrontTheme;
    productIds: string[];
    contact: StorefrontContact | null;
    isActive: boolean;
  }>, options: { expectedUpdatedAt?: string } = {}): Promise<StorefrontConfig> {
    const data: Record<string, unknown> = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.theme !== undefined) {
      data.theme = JSON.stringify(storefrontStudioThemeSchema.parse(input.theme));
    }
    if (input.productIds !== undefined) data.productIds = JSON.stringify(input.productIds);
    if (input.contact !== undefined) data.contact = input.contact ? JSON.stringify(input.contact) : null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (options.expectedUpdatedAt) {
      const expectedUpdatedAt = new Date(options.expectedUpdatedAt);
      const result = await context.prisma.storefrontConfig.updateMany({
        where: { id, updatedAt: expectedUpdatedAt },
        data,
      });
      if (result.count !== 1) throw new StorefrontVersionConflictError();
    } else {
      await context.prisma.storefrontConfig.update({ where: { id }, data });
    }
    const row = await context.prisma.storefrontConfig.findUniqueOrThrow({ where: { id } });
    return parseConfig(row);
  },

  async saveStudioDraft(context: ServiceContext, id: string, input: {
    slug: string;
    name: string;
    description: string | null;
    theme: StorefrontTheme;
    productIds: string[];
    isActive: boolean;
  }, options: { expectedDraftUpdatedAt: string | null }): Promise<StorefrontStudioConfig> {
    const draft = storefrontStudioDraftSchema.parse({
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
      theme: input.theme,
      selectedProductIds: input.productIds,
      isActive: input.isActive,
    });
    const expected = options.expectedDraftUpdatedAt
      ? new Date(options.expectedDraftUpdatedAt)
      : null;
    const draftUpdatedAt = new Date();
    const result = await context.prisma.storefrontConfig.updateMany({
      where: { id, draftUpdatedAt: expected },
      data: {
        draftName: draft.name,
        draftSlug: draft.slug,
        draftDescription: draft.description || null,
        draftTheme: JSON.stringify(draft.theme),
        draftProductIds: JSON.stringify(draft.selectedProductIds),
        draftIsActive: draft.isActive,
        draftUpdatedAt,
      },
    });
    if (result.count !== 1) throw new StorefrontVersionConflictError();
    const row = await context.prisma.storefrontConfig.findUniqueOrThrow({ where: { id } });
    return parseStudioConfig(row);
  },

  async publishStudioDraft(
    context: ServiceContext,
    id: string,
    options: { expectedDraftUpdatedAt: string },
  ): Promise<StorefrontConfig> {
    const expected = new Date(options.expectedDraftUpdatedAt);
    const row = await context.prisma.storefrontConfig.findUnique({ where: { id } });
    if (!row || !row.draftUpdatedAt || row.draftUpdatedAt.getTime() !== expected.getTime()) {
      throw new StorefrontVersionConflictError();
    }
    const draft = parseStudioConfig(row);
    const result = await context.prisma.storefrontConfig.updateMany({
      where: { id, draftUpdatedAt: expected },
      data: {
        slug: draft.slug,
        name: draft.name,
        description: draft.description,
        theme: JSON.stringify(storefrontStudioThemeSchema.parse(draft.theme)),
        productIds: JSON.stringify(draft.productIds),
        isActive: draft.isActive,
      },
    });
    if (result.count !== 1) throw new StorefrontVersionConflictError();
    const published = await context.prisma.storefrontConfig.findUniqueOrThrow({ where: { id } });
    return parseConfig(published);
  },

  async delete(context: ServiceContext, id: string): Promise<void> {
    await context.prisma.storefrontConfig.delete({ where: { id } });
  },
};

/** Default theme for new storefronts. */
export const DEFAULT_THEME: StorefrontTheme = DEFAULT_STOREFRONT_THEME;

export class StorefrontVersionConflictError extends Error {
  constructor() {
    super("Storefront draft changed since it was loaded");
    this.name = "StorefrontVersionConflictError";
  }
}
