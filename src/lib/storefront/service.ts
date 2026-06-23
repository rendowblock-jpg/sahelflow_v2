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


import { db } from "@/lib/db";

export interface StorefrontTheme {
  template: "minimal" | "modern" | "classic";
  primaryColor: string;
  showPrices: boolean;
  showStock: boolean;
}

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

function parseConfig(row: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  theme: string;
  productIds: string;
  contact: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): StorefrontConfig {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    theme: JSON.parse(row.theme) as StorefrontTheme,
    productIds: JSON.parse(row.productIds) as string[],
    contact: row.contact ? (JSON.parse(row.contact) as StorefrontContact) : null,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const storefrontService = {
  async getBySlug(slug: string): Promise<StorefrontConfig | null> {
    const row = await db.storefrontConfig.findUnique({ where: { slug } });
    if (!row) return null;
    return parseConfig(row);
  },

  async getById(id: string): Promise<StorefrontConfig | null> {
    const row = await db.storefrontConfig.findUnique({ where: { id } });
    if (!row) return null;
    return parseConfig(row);
  },

  async list(): Promise<StorefrontConfig[]> {
    const rows = await db.storefrontConfig.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(parseConfig);
  },

  async create(input: {
    slug: string;
    name: string;
    description?: string;
    theme: StorefrontTheme;
    productIds: string[];
    contact?: StorefrontContact;
  }): Promise<StorefrontConfig> {
    const row = await db.storefrontConfig.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        theme: JSON.stringify(input.theme),
        productIds: JSON.stringify(input.productIds),
        contact: input.contact ? JSON.stringify(input.contact) : null,
      },
    });
    return parseConfig(row);
  },

  async update(id: string, input: Partial<{
    slug: string;
    name: string;
    description: string | null;
    theme: StorefrontTheme;
    productIds: string[];
    contact: StorefrontContact | null;
    isActive: boolean;
  }>): Promise<StorefrontConfig> {
    const data: Record<string, unknown> = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.theme !== undefined) data.theme = JSON.stringify(input.theme);
    if (input.productIds !== undefined) data.productIds = JSON.stringify(input.productIds);
    if (input.contact !== undefined) data.contact = input.contact ? JSON.stringify(input.contact) : null;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const row = await db.storefrontConfig.update({ where: { id }, data });
    return parseConfig(row);
  },

  async delete(id: string): Promise<void> {
    await db.storefrontConfig.delete({ where: { id } });
  },
};

/** Default theme for new storefronts. */
export const DEFAULT_THEME: StorefrontTheme = {
  template: "modern",
  primaryColor: "#0f766e",
  showPrices: true,
  showStock: false,
};
