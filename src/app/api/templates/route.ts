import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { NextResponse } from "next/server";
import { z } from "zod";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(
      /^[a-z0-9_-]+$/,
      "Slug must be lowercase alphanumeric with hyphens/underscores",
    ),
  content: z.string().min(1, "Content is required").max(2000),
  category: z.enum([
    "welcome",
    "followup",
    "confirmation",
    "upsell",
    "general",
  ]),
  language: z.enum(["ar", "fr", "en"]),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/)
    .optional(),
  content: z.string().min(1).max(2000).optional(),
  category: z
    .enum(["welcome", "followup", "confirmation", "upsell", "general"])
    .optional(),
  language: z.enum(["ar", "fr", "en"]).optional(),
  active: z.boolean().optional(),
});

export const GET = withAuthAndRateLimit(async (_req, { user, supabase }) => {
  const { data, error } = await supabase
    .from("whatsapp_templates")
    .select("*")
    .eq("seller_id", user.id)
    .order("category", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
});

export const POST = withAuthAndRateLimit(
  async (_req, { user, supabase, body }) => {
    const { data, error } = await supabase
      .from("whatsapp_templates")
      .insert({ ...body, seller_id: user.id })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A template with this slug already exists" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ template: data }, { status: 201 });
  },
  { schema: templateSchema },
);

export const PUT = withAuthAndRateLimit(
  async (_req, { user, supabase, body }) => {
    const { id, ...updates } = body as Record<string, unknown>;

    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("seller_id", user.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A template with this slug already exists" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data)
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 },
      );
    return NextResponse.json({ template: data });
  },
  { schema: z.object({ id: z.string().uuid(), ...updateSchema.shape }) },
);

export const DELETE = withAuthAndRateLimit(async (req, { user, supabase }) => {
  const id = new URL(req.url).searchParams.get("id");

  if (!id)
    return NextResponse.json(
      { error: "Template ID is required" },
      { status: 400 },
    );

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
  }

  const { error } = await supabase
    .from("whatsapp_templates")
    .delete()
    .eq("id", id)
    .eq("seller_id", user.id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
});
