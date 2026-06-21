import { NextRequest, NextResponse } from "next/server";
import { extractOrder } from "@/lib/ai/extraction";
import { z } from "zod";

export const dynamic = "force-dynamic";

const extractionSchema = z.object({
  body: z.string().min(1),
  channel: z.string().optional(),
  knownPhone: z.string().optional(),
  geminiApiKey: z.string().optional(),
});

/** POST /api/extraction — extract order from a message */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = extractionSchema.parse(body);

    const result = await extractOrder(
      { body: input.body, channel: input.channel, knownPhone: input.knownPhone },
      { geminiApiKey: input.geminiApiKey },
    );

    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[POST /api/extraction] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
