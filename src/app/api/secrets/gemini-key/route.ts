import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setSecret,
  deleteSecret,
  hasSecret,
} from "@/lib/secrets";
import { verifyGeminiKey } from "@/lib/ai/extraction";
import type { GeminiProviderErrorCode } from "@/lib/ai/gemini/provider";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth, requireRecentReauthentication } from "@/lib/auth/server";
import { logAudit } from "@/lib/audit";
import { trustedActorAuditIdentity } from "@/lib/identity/authorization";
import { db, shopContext } from "@/lib/db";

export const dynamic = "force-dynamic";

type ApiLocale = "ar" | "fr" | "en";

const PROVIDER_ERROR_COPY: Record<
  ApiLocale,
  Record<GeminiProviderErrorCode, string>
> = {
  ar: {
    GEMINI_KEY_INVALID: "مفتاح Gemini غير صالح.",
    GEMINI_PERMISSION_DENIED: "مفتاح Gemini لا يملك الصلاحيات المطلوبة.",
    GEMINI_QUOTA_EXHAUSTED: "تم استهلاك حصة Gemini. أعد المحاولة بعد تجدد الحصة.",
    GEMINI_REGION_OR_BILLING_REQUIRED:
      "يتطلب Gemini إعداد المنطقة أو الفوترة لهذا المشروع.",
    GEMINI_MODEL_UNAVAILABLE:
      "لا يوجد نموذج Gemini إنتاجي مدعوم متاح لهذا المشروع.",
    GEMINI_REQUEST_INVALID: "رفض Gemini الطلب لأنه غير صالح.",
    GEMINI_TIMEOUT: "لم يستجب Gemini ضمن المهلة المتوقعة.",
    GEMINI_NETWORK_ERROR: "تعذر الاتصال بـ Gemini. تحقق من الاتصال.",
    GEMINI_PROVIDER_UNAVAILABLE: "Gemini غير متاح مؤقتًا.",
  },
  fr: {
    GEMINI_KEY_INVALID: "La clé Gemini est invalide.",
    GEMINI_PERMISSION_DENIED:
      "La clé Gemini n'a pas l'autorisation requise.",
    GEMINI_QUOTA_EXHAUSTED:
      "Le quota Gemini est atteint. Réessayez après réinitialisation du quota.",
    GEMINI_REGION_OR_BILLING_REQUIRED:
      "Gemini nécessite une configuration de région ou de facturation pour ce projet.",
    GEMINI_MODEL_UNAVAILABLE:
      "Aucun modèle Gemini de production pris en charge n'est disponible pour ce projet.",
    GEMINI_REQUEST_INVALID: "La requête Gemini a été refusée comme invalide.",
    GEMINI_TIMEOUT: "Gemini n'a pas répondu dans le délai attendu.",
    GEMINI_NETWORK_ERROR: "Impossible de joindre Gemini. Vérifiez la connexion.",
    GEMINI_PROVIDER_UNAVAILABLE: "Gemini est temporairement indisponible.",
  },
  en: {
    GEMINI_KEY_INVALID: "The Gemini key is invalid.",
    GEMINI_PERMISSION_DENIED:
      "The Gemini key does not have the required permission.",
    GEMINI_QUOTA_EXHAUSTED:
      "The Gemini quota is exhausted. Retry after the quota resets.",
    GEMINI_REGION_OR_BILLING_REQUIRED:
      "Gemini requires region or billing setup for this project.",
    GEMINI_MODEL_UNAVAILABLE:
      "No supported production Gemini model is available for this project.",
    GEMINI_REQUEST_INVALID: "Gemini rejected the request as invalid.",
    GEMINI_TIMEOUT: "Gemini did not respond within the expected timeout.",
    GEMINI_NETWORK_ERROR: "Gemini could not be reached. Check the connection.",
    GEMINI_PROVIDER_UNAVAILABLE: "Gemini is temporarily unavailable.",
  },
};

const RESPONSE_COPY: Record<
  ApiLocale,
  { verified: string; saved: string; deleted: string }
> = {
  ar: {
    verified: "تم التحقق من مفتاح Gemini وحفظه.",
    saved: "تم حفظ المفتاح دون اختبار.",
    deleted: "تم حذف المفتاح.",
  },
  fr: {
    verified: "Clé Gemini vérifiée et enregistrée.",
    saved: "Clé enregistrée sans test.",
    deleted: "Clé supprimée.",
  },
  en: {
    verified: "Gemini key verified and saved.",
    saved: "Key saved without testing.",
    deleted: "Key deleted.",
  },
};

function requestLocale(req: NextRequest): ApiLocale {
  const raw = req.cookies.get("sahelflow-locale")?.value;
  return raw === "ar" || raw === "en" || raw === "fr" ? raw : "fr";
}

/**
 * GET /api/secrets/gemini-key
 * Returns whether a Gemini key is configured (never the key itself).
 */
export const GET = withErrorHandler(async () => {
  await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const configured = await hasSecret(
    { prisma: db, shop: shopContext },
    "gemini_api_key",
  );
  return NextResponse.json({ configured });
}, "GET /api/secrets/gemini-key");

const saveSchema = z.object({
  key: z.string().min(10),
  test: z.boolean().default(true),
});

/**
 * POST /api/secrets/gemini-key
 * Tests the key when requested, then stores it encrypted. Provider-owned raw
 * errors never cross into the product UI: the route returns locale-native,
 * bounded product copy plus a stable machine-readable error code.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const body = await req.json();
  const input = saveSchema.parse(body);

  if (input.test) {
    const verification = await verifyGeminiKey(input.key);
    if (!verification.ok) {
      const code = verification.code ?? "GEMINI_PROVIDER_UNAVAILABLE";
      return NextResponse.json(
        {
          ok: false,
          code,
          error: PROVIDER_ERROR_COPY[locale][code],
        },
        { status: 400 },
      );
    }
    await setSecret(
      { prisma: db, shop: shopContext },
      "gemini_api_key",
      input.key,
    );
    await logAudit({ prisma: db, shop: shopContext }, {
      action: "secret.updated",
      entity: "secret",
      entityId: "gemini_api_key",
      actor: trustedActorAuditIdentity(actorContext.actor),
      after: { configured: true, verified: true },
    });
    return NextResponse.json({
      ok: true,
      model: verification.model,
      message: RESPONSE_COPY[locale].verified,
    });
  }

  await setSecret(
    { prisma: db, shop: shopContext },
    "gemini_api_key",
    input.key,
  );
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "secret.updated",
    entity: "secret",
    entityId: "gemini_api_key",
    actor: trustedActorAuditIdentity(actorContext.actor),
    after: { configured: true, verified: false },
  });
  return NextResponse.json({
    ok: true,
    message: RESPONSE_COPY[locale].saved,
  });
}, "POST /api/secrets/gemini-key");

/** DELETE /api/secrets/gemini-key — remove the stored key without exposing it. */
export const DELETE = withErrorHandler(async (req: NextRequest) => {
  const actorContext = await requireAuth("integrations.manage");
  await requireRecentReauthentication();
  const locale = requestLocale(req);
  const context = { prisma: db, shop: shopContext };
  const hadKey = await hasSecret(context, "gemini_api_key");
  await deleteSecret(context, "gemini_api_key");
  await logAudit({ prisma: db, shop: shopContext }, {
    action: "secret.deleted",
    entity: "secret",
    entityId: "gemini_api_key",
    actor: trustedActorAuditIdentity(actorContext.actor),
    before: { configured: hadKey },
    metadata: { key: "gemini_api_key" },
  });
  return NextResponse.json({
    ok: true,
    message: RESPONSE_COPY[locale].deleted,
  });
}, "DELETE /api/secrets/gemini-key");
