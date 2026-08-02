import { NextResponse } from "next/server";
import { z } from "zod";
import { db, shopContext } from "@/lib/db";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

/**
 * Profile API — stores shop owner profile data in the Setting table.
 * Keys: profile_name, profile_email, profile_phone, profile_photo, profile_bio
 */

const PROFILE_KEYS = {
  name: "profile_name",
  email: "profile_email",
  phone: "profile_phone",
  photo: "profile_photo",
  bio: "profile_bio",
} as const;

export const GET = withErrorHandler(async () => {
  await requireAuth("settings.read");
  const settings = await db.setting.findMany({
    where: { key: { in: Object.values(PROFILE_KEYS) } },
  });
  const profile: Record<string, string> = {};
  for (const s of settings) {
    const key = Object.entries(PROFILE_KEYS).find(([, v]) => v === s.key)?.[0];
    if (key) profile[key] = s.value;
  }
  return NextResponse.json(profile);
}, "GET /api/profile");

const UpdateSchema = z.object({
  name: z.string().max(100).optional(),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(50).optional(),
  photo: z.string().max(500).optional(),
  bio: z.string().max(1000).optional(),
});

export const PUT = withErrorHandler(async (req: Request) => {
  await requireAuth("settings.manage");
  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid data" },
      { status: 400 },
    );
  }

  const updates = parsed.data;
  const context = { prisma: db, shop: shopContext };
  const operations = Object.entries(updates)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      context.prisma.setting.upsert({
        where: { key: PROFILE_KEYS[key as keyof typeof PROFILE_KEYS] },
        create: { key: PROFILE_KEYS[key as keyof typeof PROFILE_KEYS], value: String(value) },
        update: { value: String(value) },
      })
    );

  if (operations.length > 0) {
    await context.prisma.$transaction(operations);
  }

  return NextResponse.json({ success: true });
}, "PUT /api/profile");
