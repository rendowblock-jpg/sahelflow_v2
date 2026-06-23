import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setSecret,
  deleteSecret,
  hasSecret,
} from "@/lib/secrets";
import { verifyGeminiKey } from "@/lib/ai/extraction";
import { withErrorHandler } from "@/lib/api/with-error-handler";

export const dynamic = "force-dynamic";

/**
 * GET /api/secrets/gemini-key
 * Returns whether a Gemini key is configured (never the key itself).
 */
export const GET = withErrorHandler(async () => {
  const configured = await hasSecret("gemini_api_key");
  return NextResponse.json({ configured });
}, "GET /api/secrets/gemini-key");

const saveSchema = z.object({
  /** The Gemini API key to test + save. Must start with "AIza". */
  key: z.string().min(10),
  /** If true, test the key against Gemini before saving (recommended). */
  test: z.boolean().default(true),
});

/**
 * POST /api/secrets/gemini-key
 * Body: { key: string, test?: boolean }
 * Tests the key (optional) then saves it encrypted to the Secret store.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const body = await req.json();
  const input = saveSchema.parse(body);

  // Test the key first (unless explicitly skipped)
  if (input.test) {
    const verification = await verifyGeminiKey(input.key);
    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: verification.error ?? "Clé invalide." },
        { status: 400 },
      );
    }
    // Save the (verified) key
    await setSecret("gemini_api_key", input.key);
    return NextResponse.json({
      ok: true,
      model: verification.model,
      message: "Clé Gemini vérifiée et enregistrée.",
    });
  }

  // Save without testing
  await setSecret("gemini_api_key", input.key);
  return NextResponse.json({
    ok: true,
    message: "Clé enregistrée (non testée).",
  });
}, "POST /api/secrets/gemini-key");

/**
 * DELETE /api/secrets/gemini-key
 * Removes the stored Gemini key.
 */
export const DELETE = withErrorHandler(async () => {
  await deleteSecret("gemini_api_key");
  return NextResponse.json({ ok: true, message: "Clé supprimée." });
}, "DELETE /api/secrets/gemini-key");
