import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sidecar, SidecarUnavailableError } from "@/lib/whatsapp/sidecar-client";

export const dynamic = "force-dynamic";

const sendSchema = z.object({
  to: z.string().min(1),
  text: z.string().min(1).max(4000),
});

/** POST /api/whatsapp/send — send a text message via the sidecar. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = sendSchema.parse(body);
    const result = await sidecar.send(input.to, input.text);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Validation failed", details: err.issues }, { status: 400 });
    }
    if (err instanceof SidecarUnavailableError) {
      return NextResponse.json(
        { ok: false, error: "WhatsApp sidecar not reachable. Start it: bun run dev (in sidecars/whatsapp)." },
        { status: 503 },
      );
    }
    console.error("[POST /api/whatsapp/send]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Send failed" },
      { status: 502 },
    );
  }
}
