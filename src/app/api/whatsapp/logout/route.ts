import { NextResponse } from "next/server";

import { logAudit } from "@/lib/audit";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const DELETE = withErrorHandler(async () => {
  const actor = await requireTrustedActor();
  try {
    const result = await sidecar.logout();
    await logAudit({ prisma: db, shop: actor.shop }, {
      action: "whatsapp.logout",
      entity: "whatsapp",
      actor: businessPrincipalFromTrustedActor(actor).auditActor,
      metadata: { ok: result.ok },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp sidecar not reachable" },
        { status: 503 },
      );
    }
    throw error;
  }
}, "DELETE /api/whatsapp/logout");