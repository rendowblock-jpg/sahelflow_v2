import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  to: z.string().min(1),
  text: z.string().min(1).max(4000),
});

/** POST /api/whatsapp/send — send a text message via the sidecar. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth();
  const body = await req.json();
  const input = sendSchema.parse(body);
  try {
    const result = await sidecar.send(input.to, input.text);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp sidecar not reachable. Start it: bun run dev (in sidecars/whatsapp)." },
        { status: 503 },
      );
    }
    throw err;
  }
}, "POST /api/whatsapp/send");
