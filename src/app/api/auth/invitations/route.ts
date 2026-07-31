import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireRecentReauthentication } from "@/lib/auth/server";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  createMemberInvitation,
  listMemberInvitations,
} from "@/lib/identity/member-authority";
import { PHASE2_ACTIONS } from "@/lib/identity/permissions";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({
    requestId: z.string().uuid(),
    role: z.enum(["manager", "operator", "viewer"]),
    permissions: z.array(z.enum(PHASE2_ACTIONS)).optional().nullable(),
    shopIds: z.array(z.string().trim().min(1).max(200)).min(1),
    expiresInHours: z.number().int().min(1).max(7 * 24).optional(),
  })
  .strict();

function requireOwnerPerson(
  context: Awaited<ReturnType<typeof requireTrustedAction>>,
): Extract<typeof context.actor, { kind: "person" }> {
  if (context.actor.kind !== "person" || context.actor.role !== "owner") {
    throw new SahelFlowError(
      "Only the workspace owner may administer invitations",
      "ACTION_FORBIDDEN",
      403,
    );
  }
  return context.actor;
}

/** GET /api/auth/invitations — owner-only invitation inventory. */
export const GET = withErrorHandler(async () => {
  const context = await requireTrustedAction("members.manage");
  const actor = requireOwnerPerson(context);
  const authority = await listMemberInvitations(
    actor.sessionId,
    context.shop,
  );
  return NextResponse.json(
    {
      authority,
      availableShopIds: [context.shop.shopId],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}, "GET /api/auth/invitations");

/** POST /api/auth/invitations — create one expiring invitation. */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const context = await requireTrustedAction("members.manage");
  const actor = requireOwnerPerson(context);
  await requireRecentReauthentication();
  const input = createSchema.parse(await request.json());
  const result = await createMemberInvitation(actor.sessionId, context.shop, input);
  return NextResponse.json(result, {
    status: result.replayed ? 200 : 201,
    headers: { "Cache-Control": "no-store" },
  });
}, "POST /api/auth/invitations");
