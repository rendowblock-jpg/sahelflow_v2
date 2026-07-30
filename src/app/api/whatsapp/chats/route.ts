import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireTrustedActor } from "@/lib/identity/trusted-actor";
import {
  sidecar,
  SidecarUnavailableError,
} from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async (request: NextRequest) => {
  await requireTrustedActor();
  const requested = Number.parseInt(
    request.nextUrl.searchParams.get("limit") ?? "50",
    10,
  );
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(requested, 500))
    : 50;
  try {
    return NextResponse.json(await sidecar.chats(limit));
  } catch (error) {
    if (error instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { chats: [], sidecarReachable: false },
        { status: 503 },
      );
    }
    throw error;
  }
}, "GET /api/whatsapp/chats");