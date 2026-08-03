import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { getBusinessEnvelopeKey } from "@/lib/business-truth/envelope-key";
import { sealBusinessCommandResultWithKey } from "@/lib/business-truth/result-codec";
import type { ServiceContext } from "@/lib/data/service-base";
import { ConflictError, SahelFlowError } from "@/types/errors";
import { hashWhatsAppAccountId } from "../../../sidecars/whatsapp/auth-tokens";
import { sidecar } from "./sidecar-client";

const INGRESS_SCOPE_PURPOSE = "sahelflow/whatsapp/ingress-scope/v1";
const PROVIDER = "whatsapp";
const ENVIRONMENT = "whatsapp-web";
const EVENT_TYPE = "message.upsert";

const messagePayloadSchema = z.record(z.string(), z.unknown());

export const whatsappInboundEnvelopeSchema = z.object({
  spoolId: z.string().regex(/^[0-9a-f]{64}$/),
  accountId: z.string().trim().min(1).max(256),
  receivedAt: z.string().datetime({ offset: true }),
  message: z.object({
    key: z.object({
      remoteJid: z.string().trim().min(1).max(256),
      fromMe: z.literal(false),
      id: z.string().trim().min(1).max(256),
      participant: z.string().trim().min(1).max(256).optional(),
    }),
    message: messagePayloadSchema,
    messageTimestamp: z.number().int().nonnegative(),
    pushName: z.string().trim().max(256).optional(),
  }),
});

export type WhatsAppInboundEnvelope = z.infer<
  typeof whatsappInboundEnvelopeSchema
>;

type WhatsAppIngressContext = ServiceContext & {
  readonly whatsAppProviderAccountId?: string;
};

export interface PersistWhatsAppIngressResult {
  ingressEventId: string;
  ingressKey: string;
  status: string;
  replayed: boolean;
}

interface ExistingIngress {
  id: string;
  ingressKey: string;
  payloadHash: string;
  status: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalScope(context: WhatsAppIngressContext): string {
  if (!context.shop) {
    throw new SahelFlowError(
      "WhatsApp ingress requires an exact trusted ShopContext",
      "WHATSAPP_SHOP_AUTHORITY_REQUIRED",
      500,
    );
  }
  return JSON.stringify([
    context.shop.workspaceId,
    context.shop.installationId,
    context.shop.shopId,
    context.shop.shopIncarnationId,
  ]);
}

async function resolveProviderAccountId(
  context: WhatsAppIngressContext,
): Promise<string> {
  if (context.whatsAppProviderAccountId) {
    return context.whatsAppProviderAccountId;
  }
  try {
    const status = await sidecar.status();
    if (status.status !== "connected" || !status.user?.id) {
      throw new SahelFlowError(
        "WhatsApp account identity is unavailable",
        "WHATSAPP_ACCOUNT_UNAVAILABLE",
        409,
      );
    }
    return status.user.id;
  } catch (error) {
    if (error instanceof SahelFlowError) throw error;
    throw new SahelFlowError(
      "WhatsApp account identity could not be verified",
      "WHATSAPP_ACCOUNT_UNAVAILABLE",
      503,
    );
  }
}

function deriveIngressAuthority(
  context: WhatsAppIngressContext,
  envelopeKey: Buffer,
  accountId: string,
  remoteJid: string,
  providerEventId: string,
): { ingressKey: string; providerAccountHash: string } {
  const scope = canonicalScope(context);
  const scopeId = createHmac("sha256", envelopeKey)
    .update(INGRESS_SCOPE_PURPOSE)
    .update("\0")
    .update(scope)
    .digest("hex")
    .slice(0, 32);
  const providerAccountHash = hashWhatsAppAccountId(accountId);
  const providerIdentity = createHash("sha256")
    .update(remoteJid)
    .update("\0")
    .update(providerEventId)
    .digest("hex");
  return {
    ingressKey: `wa-in:${scopeId}:${providerAccountHash}:${providerIdentity}`,
    providerAccountHash,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function assertExactReplay(
  existing: ExistingIngress,
  payloadHash: string,
): PersistWhatsAppIngressResult {
  if (existing.payloadHash !== payloadHash) {
    throw new ConflictError(
      "WhatsApp provider event identity is already bound to different content",
    );
  }
  return {
    ingressEventId: existing.id,
    ingressKey: existing.ingressKey,
    status: existing.status,
    replayed: true,
  };
}

export async function persistWhatsAppInbound(
  context: WhatsAppIngressContext,
  rawInput: unknown,
): Promise<PersistWhatsAppIngressResult> {
  const input = whatsappInboundEnvelopeSchema.parse(rawInput);
  const expectedAccountId = await resolveProviderAccountId(context);
  if (input.accountId !== expectedAccountId) {
    throw new ConflictError(
      "WhatsApp inbound event belongs to a different paired account",
    );
  }

  const envelopeKey = await getBusinessEnvelopeKey(context);
  const { ingressKey, providerAccountHash } = deriveIngressAuthority(
    context,
    envelopeKey,
    input.accountId,
    input.message.key.remoteJid,
    input.message.key.id,
  );
  const canonicalPayload = {
    provider: PROVIDER,
    environment: ENVIRONMENT,
    eventType: EVENT_TYPE,
    spoolId: input.spoolId,
    accountId: input.accountId,
    receivedAt: input.receivedAt,
    message: input.message,
  };
  const payloadText = canonicalJson(canonicalPayload);
  const payloadHash = createHash("sha256").update(payloadText).digest("hex");

  const existing = await context.prisma.providerIngressEvent.findUnique({
    where: { ingressKey },
    select: { id: true, ingressKey: true, payloadHash: true, status: true },
  });
  if (existing) return assertExactReplay(existing, payloadHash);

  const ingressEventId = randomUUID();
  const payloadJson = sealBusinessCommandResultWithKey(
    canonicalPayload,
    {
      commandId: ingressEventId,
      idempotencyKey: `provider-ingress:${ingressKey}`,
      requestHash: payloadHash,
    },
    envelopeKey,
  ).resultJson;
  const providerTimestamp = new Date(input.message.messageTimestamp * 1_000);

  try {
    const created = await context.prisma.providerIngressEvent.create({
      data: {
        id: ingressEventId,
        ingressKey,
        provider: PROVIDER,
        environment: ENVIRONMENT,
        providerAccountHash,
        eventType: EVENT_TYPE,
        sourceId: input.message.key.remoteJid,
        providerEventId: input.message.key.id,
        payloadJson,
        payloadHash,
        status: "received",
        providerTimestamp,
      },
      select: { id: true, ingressKey: true, status: true },
    });
    return {
      ingressEventId: created.id,
      ingressKey: created.ingressKey,
      status: created.status,
      replayed: false,
    };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await context.prisma.providerIngressEvent.findUnique({
      where: { ingressKey },
      select: { id: true, ingressKey: true, payloadHash: true, status: true },
    });
    if (!raced) throw error;
    return assertExactReplay(raced, payloadHash);
  }
}
