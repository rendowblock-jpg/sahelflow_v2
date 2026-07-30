import { NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const POST = withErrorHandler(async () => {
  await requireTrustedActor();
  try {
    return NextResponse.json(await sidecar.connect());
  } catch (error) {
    if (error instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp sidecar not reachable" },
        { status: 503 },
      );
    }
    throw error;
  }
}, "POST /api/whatsapp/connect");