import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAllSettings, setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

/** GET /api/settings — list all settings (non-secret). */
export async function GET(): Promise<NextResponse> {
  const settings = await getAllSettings();
  return NextResponse.json({ settings });
}

const updateSchema = z.object({
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

/**
 * PUT /api/settings — bulk-update settings.
 * Body: { settings: { key: value, ... } }
 * Values are coerced to strings (booleans → "true"/"false", numbers → "123").
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const input = updateSchema.parse(body);

    for (const [key, value] of Object.entries(input.settings)) {
      await setSetting(key, value);
    }

    const settings = await getAllSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[PUT /api/settings]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
