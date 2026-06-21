import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateConfigSchema = z.object({
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase, digits, or hyphens").optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  theme: z.object({
    template: z.enum(["minimal", "modern", "classic"]),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color"),
    showPrices: z.boolean().default(true),
    showStock: z.boolean().default(false),
  }).optional(),
  productIds: z.array(z.string()).optional(),
  contact: z.object({
    phone: z.string().optional(),
    whatsapp: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  }).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/storefront/config/[id]
 *   Seller-only: fetch a storefront config by id (includes inactive storefronts).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { storefrontService } = await import("@/lib/storefront/service");
    const config = await storefrontService.getById(id);
    if (!config) {
      return NextResponse.json({ error: "Storefront introuvable" }, { status: 404 });
    }
    return NextResponse.json({ config });
  } catch (err) {
    console.error("[GET /api/storefront/config/[id]]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PUT /api/storefront/config/[id]
 *   Seller-only: update a storefront config. Partial updates supported.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const input = updateConfigSchema.parse(body);

    const { storefrontService } = await import("@/lib/storefront/service");

    // Verify the storefront exists before updating (gives a clean 404)
    const existing = await storefrontService.getById(id);
    if (!existing) {
      return NextResponse.json({ error: "Storefront introuvable" }, { status: 404 });
    }

    const config = await storefrontService.update(id, input);
    return NextResponse.json({ config });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: err.issues }, { status: 400 });
    }
    console.error("[PUT /api/storefront/config/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/storefront/config/[id]
 *   Seller-only: permanently delete a storefront config.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { storefrontService } = await import("@/lib/storefront/service");

    const existing = await storefrontService.getById(id);
    if (!existing) {
      return NextResponse.json({ error: "Storefront introuvable" }, { status: 404 });
    }

    await storefrontService.delete(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/storefront/config/[id]]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
