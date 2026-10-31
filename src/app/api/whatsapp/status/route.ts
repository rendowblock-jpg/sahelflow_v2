import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireTrustedAction("conversations.read");
  try {
    return NextResponse.json(await sidecar.status());
  } catch (error) {
    if (error instanceof SidecarUnavailableError) {
      // The helper being off is an expected state, not a server fault: 200, so the browser does not print a failed
      // request on every poll. Consumers read sidecarReachable (see parseWhatsAppStatusResponse).
      return NextResponse.json({
        status: "disconnected",
        user: null,
        hasQr: false,
        sidecarReachable: false,
      });
    }
    throw error;
  }
}, "GET /api/whatsapp/status");
