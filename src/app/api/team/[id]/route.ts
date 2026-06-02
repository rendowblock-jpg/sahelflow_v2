import { NextResponse } from "next/server";
import { withAuthAndRateLimit } from "@/lib/api-wrapper";
import { z } from "zod";
import {
  updateMemberRole,
  suspendMember,
  activateMember,
  removeMember,
  getUserSellerContext,
} from "@/lib/data/team-service";
import { hasPermission } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  role: z.enum(["owner", "admin", "confirmer", "packer", "viewer"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
});

export const PATCH = withAuthAndRateLimit(
  async (req, { user, body, params }) => {
    const rawId = params.id;
    const memberId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!memberId) {
      return NextResponse.json({ error: "Member ID required" }, { status: 400 });
    }

    if (!body) {
      return NextResponse.json({ error: "Missing body" }, { status: 400 });
    }

    const context = await getUserSellerContext(user.id);
    if (!context || !hasPermission(context.role, "team:manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createClient();

    // 1. Fetch target team member to check status & role
    const { data: member, error: fetchErr } = await supabase
      .from("team_members")
      .select("*")
      .eq("id", memberId)
      .eq("seller_id", context.sellerId)
      .single();

    if (fetchErr || !member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // 2. Prevent modifying primary owner
    if (member.user_id === context.sellerId) {
      return NextResponse.json(
        { error: "لا يمكن تعديل صلاحيات المالك الرئيسي للمتجر" },
        { status: 403 }
      );
    }

    // 3. Prevent modifying own role or status
    if (member.user_id === user.id) {
      return NextResponse.json(
        { error: "لا يمكنك تعديل دورك أو تعليق حسابك بنفسك" },
        { status: 403 }
      );
    }

    // 4. Role restrictions: Admins can't modify admins or owners
    if (context.role === "admin" && (member.role === "admin" || member.role === "owner" || body.role === "admin" || body.role === "owner")) {
      return NextResponse.json(
        { error: "المسؤولون يمكنهم فقط تعديل Confirmers, Packers, أو Viewers" },
        { status: 403 }
      );
    }

    try {
      let updatedMember = member;

      if (body.role) {
        updatedMember = await updateMemberRole(context.sellerId, memberId, body.role);
      }

      if (body.status) {
        if (body.status === "suspended") {
          updatedMember = await suspendMember(context.sellerId, memberId);
        } else if (body.status === "active") {
          updatedMember = await activateMember(context.sellerId, memberId);
        }
      }

      return NextResponse.json(updatedMember);
    } catch (error: unknown) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
    }
  },
  { schema: updateSchema }
);

export const DELETE = withAuthAndRateLimit(async (req, { user, params }) => {
  const rawId = params.id;
  const memberId = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!memberId) {
    return NextResponse.json({ error: "Member ID required" }, { status: 400 });
  }

  const context = await getUserSellerContext(user.id);
  if (!context || !hasPermission(context.role, "team:manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();

  // 1. Fetch target team member
  const { data: member, error: fetchErr } = await supabase
    .from("team_members")
    .select("*")
    .eq("id", memberId)
    .eq("seller_id", context.sellerId)
    .single();

  if (fetchErr || !member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // 2. Prevent deleting primary owner
  if (member.user_id === context.sellerId) {
    return NextResponse.json(
      { error: "لا يمكن حذف المالك الرئيسي للمتجر" },
      { status: 403 }
    );
  }

  // 3. Prevent deleting yourself
  if (member.user_id === user.id) {
    return NextResponse.json(
      { error: "لا يمكنك إزالة نفسك من الفريق" },
      { status: 403 }
    );
  }

  // 4. Role restrictions: Admins can't delete admins or owners
  if (context.role === "admin" && (member.role === "admin" || member.role === "owner")) {
    return NextResponse.json(
      { error: "المسؤولون لا يمكنهم حذف مسؤولين آخرين أو المالك" },
      { status: 403 }
    );
  }

  try {
    await removeMember(context.sellerId, memberId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 400 });
  }
});
