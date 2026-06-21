import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setSecret,
  deleteSecret,
  hasSecret,
} from "@/lib/secrets";
import { deliverySecretKey, deliverySecretKeys, DELIVERY_PROVIDERS } from "@/lib/integrations/delivery/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/delivery/credentials — status of all delivery provider credentials.
 * Returns which providers are configured (never the values).
 */
export async function GET() {
  try {
    const status: Record<string, Record<string, boolean>> = {};
    for (const provider of DELIVERY_PROVIDERS) {
      const keys = deliverySecretKeys(provider);
      const fieldStatus: Record<string, boolean> = {};
      for (const key of keys) {
        // Extract field name: delivery_yalidine_api_id → api_id
        const fieldMatch = key.match(/^delivery_\w+_(.+)$/);
        const field = fieldMatch ? fieldMatch[1]! : key;
        fieldStatus[field] = await hasSecret(key);
      }
      status[provider] = fieldStatus;
    }
    return NextResponse.json({ providers: status });
  } catch (err) {
    console.error("[GET /api/delivery/credentials]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const saveSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
  credentials: z.record(z.string(), z.string().min(1)),
});

/**
 * POST /api/delivery/credentials — save credentials for a provider (encrypted).
 * Body: { provider: "yalidine", credentials: { api_id: "...", api_token: "..." } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = saveSchema.parse(body);

    // Save each credential field to the Secret store
    for (const [field, value] of Object.entries(input.credentials)) {
      const key = deliverySecretKey(input.provider, field);
      await setSecret(key, value);
    }

    return NextResponse.json({
      ok: true,
      message: `Identifiants ${input.provider} enregistrés (chiffrés).`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[POST /api/delivery/credentials]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

const deleteSchema = z.object({
  provider: z.enum(["yalidine", "maystro", "zrexpress"]),
});

/**
 * DELETE /api/delivery/credentials?provider=yalidine — remove all credentials
 * for a provider.
 */
export async function DELETE(req: NextRequest) {
  try {
    const provider = req.nextUrl.searchParams.get("provider");
    const input = deleteSchema.parse({ provider });

    const keys = deliverySecretKeys(input.provider);
    for (const key of keys) {
      await deleteSecret(key);
    }

    return NextResponse.json({
      ok: true,
      message: `Identifiants ${input.provider} supprimés.`,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: err.issues },
        { status: 400 },
      );
    }
    console.error("[DELETE /api/delivery/credentials]", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
