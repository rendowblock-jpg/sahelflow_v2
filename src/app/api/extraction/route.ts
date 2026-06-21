import { NextRequest, NextResponse } from "next/server";
import { extractOrder } from "@/lib/ai/extraction";
import { getSecret } from "@/lib/secrets";
import { z } from "zod";

export const dynamic = "force-dynamic";

const extractionSchema = z.object({
  body: z.string().min(1),
  channel: z.string().optional(),
  knownPhone: z.string().optional(),
  /** Optional client override; if absent, the server loads the stored key. */
  geminiApiKey: z.string().optional(),
  /** Force Gemini even if regex is confident (for testing). */
  forceGemini: z.boolean().optional(),
});

/** POST /api/extraction — extract an order from a message body.
 *
 * The Gemini key is resolved in this order:
 *   1. Explicit `geminiApiKey` in the request (for testing / overrides)
 *   2. The stored encrypted secret ("gemini_api_key")
 *   3. undefined → regex-only mode
 *
 * The key never needs to be present on the client in normal use.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = extractionSchema.parse(body);

    // Resolve the Gemini key: explicit override > stored secret > none
    let geminiApiKey = input.geminiApiKey;
    if (!geminiApiKey) {
      geminiApiKey = (await getSecret("gemini_api_key")) ?? undefined;
    }

    const result = await extractOrder(
      { body: input.body, channel: input.channel, knownPhone: input.knownPhone },
      { geminiApiKey, forceGemini: input.forceGemini },
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
