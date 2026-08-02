import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedAction } from "@/lib/identity/authorization";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireTrustedAction("whatsapp.connection.manage");
  try {
    const { qr } = await sidecar.qr();
    return NextResponse.json({
      qr,
      qrPngUrl: qr ? "/api/whatsapp/qr-image" : null,
    });
  } catch (error) {
    if (error instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { qr: null, qrPngUrl: null, sidecarReachable: false },
        { status: 503 },
      );
    }
    throw error;
  }
}, "GET /api/whatsapp/qr");
