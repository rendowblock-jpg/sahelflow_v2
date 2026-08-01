import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { withErrorHandler } from "@/lib/api/with-error-handler";
import { dispatchTrigger, type TriggerEvent } from "@/lib/automations/engine";
import { sourceBusinessPrincipal } from "@/lib/business-truth/principal";
import { db } from "@/lib/db";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { projectOrderForTrustedActor } from "@/lib/identity/order-projection";
import { resolveCanonicalNamedItems } from "@/lib/orders/canonical-named-items";
import { createCanonicalSourceOrder } from "@/lib/orders/canonical-source-order";
import { sidecar } from "@/lib/whatsapp/sidecar-client";
import { messageText } from "@/lib/whatsapp/types";
import { NotFoundError, ValidationError } from "@/types/errors";

export const dynamic = "force-dynamic";

const schema = z.object({
  conversationId: z.string().trim().min(1).max(200),
  messageId: z.string().trim().min(1).max(240),
  extractionMethod: z.enum(["regex", "gemini"]),
  extractionConfidence: z.number().min(0).max(1),
  customer: z.object({
    name: z.string().trim().min(1).max(200),
    phone: z.string().trim().min(1).max(40),
    wilaya: z.string().trim().min(1).max(120),
    commune: z.string().trim().max(120).optional(),
    address: z.string().trim().max(500).optional(),
  }),
  items: z
    .array(
      z.object({
        productName: z.string().trim().min(1).max(300),
        quantity: z.number().int().positive().max(999),
      }),
    )
    .min(1)
    .max(200),
  deliveryCost: z.number().int().nonnegative().default(600),
  notes: z.string().trim().max(2000).optional(),
});

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex");
}

export const POST = withErrorHandler(async (request: NextRequest) => {
  const actorContext = await requireTrustedAction("orders.create");
  assertTrustedAction(actorContext, "orders.read");
  assertTrustedAction(actorContext, "customers.contact.read");
  assertTrustedAction(actorContext, "customers.contact.update");
  assertTrustedAction(actorContext, "orders.financials.read");
  assertTrustedAction(actorContext, "orders.financials.update");
  const input = schema.parse(await request.json());

  // The browser cannot mint WhatsApp source authority. Re-read the exact
  // provider message and bind the command to its immutable ID and body digest.
  const history = await sidecar.messages(input.conversationId, 500);
  const sourceMessage = history.messages.find(
    (message) => message.key.id === input.messageId && !message.key.fromMe,
  );
  if (!sourceMessage) {
    throw new NotFoundError("WhatsApp message", input.messageId);
  }
  const body = messageText(sourceMessage.message);
  if (!body.trim()) {
    throw new ValidationError(
      "The selected WhatsApp message has no extractable text body",
      "messageId",
    );
  }

  const items = await resolveCanonicalNamedItems(
    { prisma: db },
    input.items,
  );
  const sourceRevision = digest(input.messageId, body);
  const idempotencyKey = `whatsapp-order:${digest(
    input.conversationId,
    input.messageId,
  )}`;
  const command = await createCanonicalSourceOrder(
    {
      prisma: db,
      shop: actorContext.shop,
      businessPrincipal: sourceBusinessPrincipal(
        "whatsapp",
        input.conversationId,
      ),
    },
    {
      idempotencyKey,
      correlationId: `whatsapp:${input.conversationId}:${input.messageId}`,
      source: "whatsapp",
      sourceIdentity: input.conversationId,
      sourceOrderId: input.messageId,
      sourceRevision,
      sourceDetails: {
        providerMessageId: input.messageId,
        providerTimestamp: sourceMessage.messageTimestamp,
        messageBodySha256: digest(body),
        extractionMethod: input.extractionMethod,
        extractionConfidence: input.extractionConfidence,
      },
      newCustomer: input.customer,
      items,
      wilaya: input.customer.wilaya,
      commune: input.customer.commune ?? "",
      address: input.customer.address ?? "",
      phone: input.customer.phone,
      deliveryCost: input.deliveryCost,
      notes: input.notes ?? null,
    },
  );

  if (!command.replayed) {
    void dispatchTrigger(
      { prisma: db, shop: actorContext.shop },
      "order.created" as TriggerEvent,
      command.result.automation,
    );
  }

  return NextResponse.json(
    {
      order: projectOrderForTrustedActor(actorContext, command.result.order),
      command: {
        id: command.commandId,
        aggregateVersion: command.aggregateVersion,
        replayed: command.replayed,
      },
    },
    { status: command.replayed ? 200 : 201 },
  );
}, "POST /api/orders/source/whatsapp");
