import { NextRequest, NextResponse } from "next/server";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import {
  extractOrderFromImage,
  MAX_EXTRACTION_IMAGE_BYTES,
  recordExtractionMetric,
} from "@/lib/ai/extraction";
import { checkRateLimit } from "@/lib/ai/rate-limit";
import { getCurrentUserKey, requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { getBool, SETTING_KEYS } from "@/lib/settings";
import { getSecret } from "@/lib/secrets";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

// Same shape as the WhatsApp voice route: a hard multipart ceiling checked
// before the bytes are materialized, so a giant upload dies at the door.
const MAX_IMAGE_FORM_BYTES = MAX_EXTRACTION_IMAGE_BYTES + 256 * 1024;

function imageFormTooLarge(): SahelFlowError {
  return new SahelFlowError(
    "Screenshot upload is larger than the accepted extraction boundary",
    "VALIDATION_ERROR",
    413,
  );
}

async function readBoundedImageForm(req: NextRequest): Promise<FormData> {
  const contentType = req.headers.get("content-type")?.trim() ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    throw new SahelFlowError(
      "Screenshot extraction requires multipart form data",
      "VALIDATION_ERROR",
      400,
    );
  }
  if (!req.body) {
    throw new SahelFlowError(
      "Choose a screenshot to read",
      "VALIDATION_ERROR",
      400,
    );
  }
  const reader = req.body.getReader();
  const bounded = new Uint8Array(MAX_IMAGE_FORM_BYTES);
  let offset = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (offset + next.value.byteLength > MAX_IMAGE_FORM_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw imageFormTooLarge();
      }
      bounded.set(next.value, offset);
      offset += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(bounded.subarray(0, offset), {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new SahelFlowError(
      "The screenshot upload could not be read",
      "VALIDATION_ERROR",
      400,
    );
  }
}

/** Magic-number truth: browser declarations never become authority. */
function sniffImageType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return null;
}

/** POST /api/extraction/image — visual order extraction for the agents
 *  composer (ledger AI-21). Same consent gate, rate limit and provider
 *  authority as the text route; the image bytes are sniffed, bounded and
 *  never persisted. */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth(["ai.use", "customers.contact.read"]);

  // fix-B6 informed-consent gate, identical to /api/extraction: the
  // screenshot content leaves the device toward the seller-configured
  // provider, so consent must exist first. The UI branches on the code.
  const consent = await getBool(
    { prisma: db, shop: shopContext },
    SETTING_KEYS.geminiConsentAccepted,
    false,
  );
  if (!consent) {
    return NextResponse.json(
      {
        error: "consent_required",
        code: "AI_CONSENT_REQUIRED",
        message:
          "AI extraction consent not given. Visit Settings → AI to enable.",
      },
      { status: 403 },
    );
  }

  const declaredLength = Number.parseInt(
    req.headers.get("content-length") ?? "0",
    10,
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_IMAGE_FORM_BYTES
  ) {
    throw imageFormTooLarge();
  }

  const form = await readBoundedImageForm(req);
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new SahelFlowError(
      "Choose a screenshot to read",
      "VALIDATION_ERROR",
      400,
    );
  }
  const declaredName = form.get("fileName");
  const fileName =
    typeof declaredName === "string" && declaredName.trim()
      ? declaredName.trim().slice(0, 160)
      : (file.name || "screenshot").slice(0, 160);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_EXTRACTION_IMAGE_BYTES) {
    throw imageFormTooLarge();
  }
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    throw new SahelFlowError(
      "Only JPEG, PNG and WebP screenshots are supported",
      "VALIDATION_ERROR",
      400,
    );
  }

  const userKey = await getCurrentUserKey();
  const rl = checkRateLimit("extraction-image", userKey);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: rl.reason ?? "Rate limited", code: "AI_RATE_LIMITED" },
      {
        status: 429,
        headers: rl.retryAfterMs
          ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) }
          : {},
      },
    );
  }

  const geminiApiKey =
    (await getSecret({ prisma: db, shop: shopContext }, "gemini_api_key")) ??
    undefined;

  const start = Date.now();
  const result = await extractOrderFromImage(
    { fileName, mimeType, bytes },
    { geminiApiKey },
  );
  // The bytes are consumed — drop the reference promptly; nothing about the
  // screenshot is persisted (only the extraction metric, without content).
  bytes.fill(0);

  void recordExtractionMetric({ prisma: db, shop: shopContext }, {
    method: result.method,
    confidence: result.confidence,
    isComplete: result.isComplete,
    missingFields: result.missingFields,
    latencyMs: Date.now() - start,
    modelVersion: result.method === "gemini" ? "gemini-image" : undefined,
  }).catch(() => { /* best-effort */ });

  return NextResponse.json({ result });
}, "POST /api/extraction/image");
