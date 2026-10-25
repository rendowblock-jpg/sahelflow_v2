import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { setSecret, deleteSecret, hasSecret } from "@/lib/secrets";
import { GROQ_API_KEY_SECRET } from "@/lib/ai/providers/groq/catalog";
import { GroqProviderError, groqErrorMessage, verifyGroqKey } from "@/lib/ai/providers/groq/provider";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

type ApiLocale = "ar" | "fr" | "en";

const SHAPE_ERROR_CODE = "GROQ_KEY_SHAPE_INVALID";

// A Groq key starts with gsk_ and is far shorter than 256 characters. Anything
// else is a paste mistake, so it is refused before Groq or the store sees it.
const GROQ_KEY_SHAPE = /^gsk_[^\u0000-\u001f\u007f\s]{16,252}$/;

const SHAPE_ERROR_COPY: Record<ApiLocale, string> = {
  ar: "مفتاح Groq يبدأ بـ gsk_. انسخ المفتاح كاملًا من console.groq.com.",
  fr: "Une clé Groq commence par gsk_. Copiez la clé entière depuis console.groq.com.",
  en: "A Groq key starts with gsk_. Copy the whole key from console.groq.com.",
};

const RESPONSE_COPY: Record<ApiLocale, { verified: string; saved: string; deleted: string }> = {
  ar: {
    verified: "تم التحقق من مفتاح Groq وحفظه.",
    saved: "تم حفظ المفتاح دون اختبار.",
    deleted: "تم حذف المفتاح.",
  },
  fr: {
    verified: "Clé Groq vérifiée et enregistrée.",
    saved: "Clé enregistrée sans test.",
    deleted: "Clé supprimée.",
  },
  en: {
    verified: "Groq key verified and saved.",
    saved: "Key saved without testing.",
    deleted: "Key deleted.",
  },
};

function requestLocale(req: NextRequest): ApiLocale {
  const raw = req.cookies.get("sahelflow-locale")?.value;
  return raw === "ar" || raw === "en" || raw === "fr" ? raw : "fr";
}

/** GET /api/secrets/groq-key — whether a Groq key is saved (never the key). */
export const GET = withErrorHandler(async () => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const configured = await hasSecret({ prisma: db, shop: shopContext }, GROQ_API_KEY_SECRET);
  return NextResponse.json({ configured });
}, "GET /api/secrets/groq-key");

const bodySchema = z.object({
  key: z.string().max(4096),
  test: z.boolean().default(true),
});

/**
 * POST /api/secrets/groq-key
 * Same shapes as the Gemini route so the Settings panel is shared. The key is
 * trimmed once, so the key that was tested is the key that is stored. Groq's
 * own error text never leaves the server: the reply holds a stable code and
 * product copy in the seller's language.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const input = bodySchema.parse(await req.json());
  const key = input.key.trim();

  if (!GROQ_KEY_SHAPE.test(key)) {
    return NextResponse.json(
      { ok: false, code: SHAPE_ERROR_CODE, error: SHAPE_ERROR_COPY[locale] },
      { status: 400 },
    );
  }

  const context = { prisma: db, shop: shopContext };
  const actor = trustedActorAuditIdentity(actorContext.actor);

  if (input.test) {
    const verification = await verifyGroqKey(key);
    if (!verification.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: verification.code,
          error: groqErrorMessage(
            new GroqProviderError(verification.code, "", undefined, verification.retryAfterSeconds),
            locale,
          ),
        },
        { status: 400 },
      );
    }
    await setSecret(context, GROQ_API_KEY_SECRET, key);
    await logAudit(context, {
      action: "secret.updated",
      entity: "secret",
      entityId: GROQ_API_KEY_SECRET,
      actor,
      after: { configured: true, verified: true },
    });
    return NextResponse.json({ ok: true, model: verification.model, message: RESPONSE_COPY[locale].verified });
  }

  await setSecret(context, GROQ_API_KEY_SECRET, key);
  await logAudit(context, {
    action: "secret.updated",
    entity: "secret",
    entityId: GROQ_API_KEY_SECRET,
    actor,
    after: { configured: true, verified: false },
  });
  return NextResponse.json({ ok: true, message: RESPONSE_COPY[locale].saved });
}, "POST /api/secrets/groq-key");

/** DELETE /api/secrets/groq-key — remove the stored key without exposing it. */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const context = { prisma: db, shop: shopContext };
  const hadKey = await hasSecret(context, GROQ_API_KEY_SECRET);
  await deleteSecret(context, GROQ_API_KEY_SECRET);
  await logAudit(context, {
    action: "secret.deleted",
    entity: "secret",
    entityId: GROQ_API_KEY_SECRET,
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: { configured: hadKey },
    metadata: { key: GROQ_API_KEY_SECRET },
  });
  return NextResponse.json({ ok: true, message: RESPONSE_COPY[locale].deleted });
}, "DELETE /api/secrets/groq-key");
