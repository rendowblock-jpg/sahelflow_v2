import { NextResponse } from "next/server";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** DELETE /api/whatsapp/logout — clear auth + disconnect (next connect → fresh QR). */
export const DELETE = withErrorHandler(async () => {
  await requireAuth();
  try {
    const result = await sidecar.logout();
    // W2-5: audit the WhatsApp logout (security-relevant account action).
    void logAudit({
      action: "whatsapp.logout",
      entity: "whatsapp",
      actor: "user",
      metadata: { ok: result?.ok ?? true },
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp sidecar not reachable." },
        { status: 503 },
      );
    }
    throw err;
  }
}, "DELETE /api/whatsapp/logout");
