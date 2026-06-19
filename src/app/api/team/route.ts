import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";
import { getTeamMembers, inviteTeamMember } from "@/lib/data/team-service";

// Define schema for inviting a team member
const inviteSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  role: z.enum(["owner", "admin", "confirmer", "packer", "viewer"]),
});

export const GET = withAuthAndRateLimit(async (req, { sellerId }) => {
  try {
    const members = await getTeamMembers(sellerId);
    return NextResponse.json(members);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}, { requirePermission: "team:view" });

export const POST = withAuthAndRateLimit(
  async (req, { user, sellerId, role, body }) => {
    if (!body) {
      return NextResponse.json({ error: "Missing body" }, { status: 400 });
    }

    // Owner restriction: only owners can invite admins or owners
    // (wrapper already enforces team:manage; this is a finer-grained business rule)
    if ((body.role === "admin" || body.role === "owner") && role !== "owner") {
      return NextResponse.json(
        { error: "مالك المتجر فقط يمكنه دعوة المسؤولين (Admins) أو ملاك آخرين" },
        { status: 403 }
      );
    }

    try {
      const member = await inviteTeamMember(
        sellerId,
        body.email,
        body.role,
        user.id
      );
      return NextResponse.json(member);
    } catch (error: unknown) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
    }
  },
  { requirePermission: "team:manage", schema: inviteSchema }
);
