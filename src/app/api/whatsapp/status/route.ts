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
      return NextResponse.json(
        {
          status: "disconnected",
          user: null,
          hasQr: false,
          sidecarReachable: false,
        },
        { status: 503 },
      );
    }
    throw error;
  }
}, "GET /api/whatsapp/status");
