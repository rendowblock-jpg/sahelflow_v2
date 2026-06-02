import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";
import { getTeamMembers, inviteTeamMember, getUserSellerContext } from "@/lib/data/team-service";
import { hasPermission } from "@/lib/auth/permissions";

// Define schema for inviting a team member
const inviteSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  role: z.enum(["owner", "admin", "confirmer", "packer", "viewer"]),
});

export const GET = withAuthAndRateLimit(async (req, { user }) => {
  const context = await getUserSellerContext(user.id);
  if (!context || !hasPermission(context.role, "team:view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const members = await getTeamMembers(context.sellerId);
    return NextResponse.json(members);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});

export const POST = withAuthAndRateLimit(
  async (req, { user, body }) => {
    if (!body) {
      return NextResponse.json({ error: "Missing body" }, { status: 400 });
    }

    const context = await getUserSellerContext(user.id);
    if (!context || !hasPermission(context.role, "team:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Owner restriction: only owners can invite admins or owners
    if ((body.role === "admin" || body.role === "owner") && context.role !== "owner") {
      return NextResponse.json(
        { error: "مالك المتجر فقط يمكنه دعوة المسؤولين (Admins) أو ملاك آخرين" },
        { status: 403 }
      );
    }

    try {
      const member = await inviteTeamMember(
        context.sellerId,
        body.email,
        body.role,
        user.id
      );
      return NextResponse.json(member);
    } catch (error: unknown) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
    }
  },
  { schema: inviteSchema }
);
