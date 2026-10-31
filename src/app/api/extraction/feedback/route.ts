import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withErrorHandler } from "@/lib/api/with-error-handler";
import { requireAuth } from "@/lib/auth/server";
import { db, shopContext } from "@/lib/db";
import { readBoundedText } from "@/lib/mcp/request-body";
import { fieldAcceptance, recordDraftFeedback } from "@/lib/ai/extraction/draft-feedback";
import { SahelFlowError } from "@/types/errors";

export const dynamic = "force-dynamic";

const MAX_FEEDBACK_BODY_BYTES = 32 * 1024;

const itemSchema = z.object({
  productName: z.string().max(300),
  quantity: z.number().finite(),
  unitPrice: z.number().finite().optional(),
});
const orderSchema = z.object({
  phone: z.string().max(40).optional(),
  wilaya: z.string().max(80).optional(),
  commune: z.string().max(120).optional(),
  items: z.array(itemSchema).max(100).optional(),
  totalPrice: z.number().finite().optional(),
});
const feedbackSchema = z.object({
  messageId: z.string().min(1).max(100),
  /** What the reader proposed; null when it proposed nothing. */
  draft: orderSchema.nullable(),
  /** What the seller confirmed. */
  confirmed: orderSchema,
});

/**
 * The seller confirmed a draft: record, per field, whether it was kept or
 * edited. Only booleans are stored (ExtractionMetric.fieldAccuracy); the draft
 * and the confirmed values are used for the comparison and then dropped, and
 * nothing of the customer's text is logged.
 */
export const POST = withErrorHandler(async (req: NextRequest) => {
  await requireAuth(["ai.use"]);
  const bounded = await readBoundedText(req, MAX_FEEDBACK_BODY_BYTES);
  if (!bounded.ok) throw new SahelFlowError("The request is too large", "VALIDATION_ERROR", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(bounded.text);
  } catch {
    throw new SahelFlowError("The request body is not valid JSON", "VALIDATION_ERROR", 400);
  }
  const input = feedbackSchema.parse(raw);
  const accepted = fieldAcceptance(input.draft ? { items: [], ...input.draft } : null, input.confirmed);
  const recorded = await recordDraftFeedback({ prisma: db, shop: shopContext }, { messageId: input.messageId, accepted });
  return NextResponse.json({ recorded, fields: Object.keys(accepted).length });
}, "POST /api/extraction/feedback");
