/**
 * Meta Pixel / CAPI configuration authority + trigger enqueue.
 *
 * FD-061 EX-3 (contracts extracted from CodFlow @ 00f18fa, Apache-2.0). The
 * desktop is authoritative: triggers ride the dedicated durable CapiEventLedger
 * queue (the WhatsAppOutboundEffect precedent) — never a Cloudflare Worker,
 * and never the canonical OutboxIntent, which stays strictly command-kernel-
 * owned. A CAPI failure can never block order or delivery confirmation —
 * every trigger is fire-and-forget with the disposition recorded on the
 * ledger.
 *
 * The access token rides the encrypted Secret authority under
 * `meta_capi_access_token`; the config model holds only non-secret fields.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import type { ServiceContext } from "@/lib/data/service-base";
import { getSecret, setSecret } from "@/lib/secrets";
import {
  resolveConversionForStage,
  resolveCapiDispatch,
  type ConversionStage,
  type ConversionMode,
  type MetaEventName,
} from "./capi-conversion";

export const META_CAPI_TOKEN_SECRET_KEY = "meta_capi_access_token";

export interface MetaPixelConfigData {
  id: string;
  pixelId: string;
  adAccountName: string | null;
  conversionEvent: ConversionMode;
  testMode: boolean;
  testEventCode: string | null;
  enabled: boolean;
}

/** Load the singleton config row (the DB is the shop). Null = CAPI disabled. */
export async function getMetaPixelConfig(
  context: ServiceContext,
): Promise<MetaPixelConfigData | null> {
  const row = await context.prisma.metaPixelConfig.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    pixelId: row.pixelId,
    adAccountName: row.adAccountName,
    conversionEvent: row.conversionEvent as ConversionMode,
    testMode: row.testMode,
    testEventCode: row.testEventCode,
    enabled: row.enabled,
  };
}

export interface UpsertMetaPixelConfigInput {
  pixelId: string;
  adAccountName?: string | null;
  conversionEvent?: ConversionMode;
  testMode?: boolean;
  testEventCode?: string | null;
  enabled?: boolean;
  /** Present = replace the stored token with the trimmed value; absent = keep. */
  accessToken?: string;
}

/** Upsert the singleton config; token writes ride the Secret authority. */
export async function upsertMetaPixelConfig(
  context: ServiceContext,
  input: UpsertMetaPixelConfigInput,
): Promise<MetaPixelConfigData> {
  const existing = await getMetaPixelConfig(context);
  const now = new Date();

  if (input.accessToken !== undefined) {
    const token = input.accessToken.trim();
    if (token) {
      await setSecret(context, META_CAPI_TOKEN_SECRET_KEY, token);
    } else {
      // An empty value clears the token (the caller owns the confirmation UX).
      await context.prisma.secret.deleteMany({ where: { key: META_CAPI_TOKEN_SECRET_KEY } });
    }
  }

  const data = {
    pixelId: input.pixelId.trim(),
    adAccountName:
      input.adAccountName === undefined
        ? (existing?.adAccountName ?? null)
        : input.adAccountName?.trim() || null,
    conversionEvent: input.conversionEvent ?? existing?.conversionEvent ?? "Purchase",
    testMode: input.testMode ?? existing?.testMode ?? false,
    testEventCode:
      input.testEventCode === undefined
        ? (existing?.testEventCode ?? null)
        : input.testEventCode?.trim() || null,
    enabled: input.enabled ?? true,
  };

  const row = existing
    ? await context.prisma.metaPixelConfig.update({
        where: { id: existing.id },
        data: { ...data, updatedAt: now },
      })
    : await context.prisma.metaPixelConfig.create({
        data: { id: randomUUID(), ...data },
      });

  return {
    id: row.id,
    pixelId: row.pixelId,
    adAccountName: row.adAccountName,
    conversionEvent: row.conversionEvent as ConversionMode,
    testMode: row.testMode,
    testEventCode: row.testEventCode,
    enabled: row.enabled,
  };
}

async function loadDispatchConfig(context: ServiceContext) {
  const config = await getMetaPixelConfig(context);
  if (!config) return null;
  const accessToken = (await getSecret(context, META_CAPI_TOKEN_SECRET_KEY)) ?? "";
  return {
    enabled: config.enabled,
    accessToken,
    conversionEvent: config.conversionEvent,
    testMode: config.testMode,
    testEventCode: config.testEventCode,
  };
}

export interface QueueCapiDisposition {
  queued: boolean;
  reason?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Fire-and-forget trigger for a business stage. Validates the conversion
 * gate and claims the ledger row (UNIQUE (order, stage, event) —
 * create-on-conflict, because the SQLite connector has no skipDuplicates).
 * The ledger claim IS the durable queue entry: it is born due (leaseUntil =
 * now) so the desktop worker picks it up on its next tick; the canonical
 * OutboxIntent stays strictly command-kernel-owned. Never throws into the
 * caller's flow: a CAPI failure must never block order or delivery
 * confirmation.
 */
export async function queueCapiStage(
  context: ServiceContext,
  input: {
    orderId: string;
    stage: ConversionStage;
    triggeredAt: Date;
  },
): Promise<QueueCapiDisposition> {
  try {
    const dispatchConfig = await loadDispatchConfig(context);
    const decision = resolveConversionForStage(
      dispatchConfig?.conversionEvent,
      input.stage,
    );
    if (!decision.shouldFire || !decision.eventName) {
      return { queued: false, reason: decision.reason ?? "stage_mismatch" };
    }
    const eventName: MetaEventName = decision.eventName;

    const dispatch = resolveCapiDispatch(dispatchConfig, eventName, input.stage);
    if (!dispatch.send) {
      if (dispatch.reason === "no-access-token") {
        // Auditable skip only when the send could never happen.
        await context.prisma.capiEventLedger.upsert({
          where: {
            orderId_stage_eventName: {
              orderId: input.orderId,
              stage: input.stage,
              eventName,
            },
          },
          create: {
            id: randomUUID(),
            orderId: input.orderId,
            eventName,
            stage: input.stage,
            eventId: input.orderId,
            status: "skipped",
            lastError: dispatch.message,
            triggeredAt: input.triggeredAt,
          },
          update: {},
        });
      }
      return { queued: false, reason: dispatch.reason };
    }

    try {
      await context.prisma.capiEventLedger.create({
        data: {
          id: randomUUID(),
          orderId: input.orderId,
          eventName,
          stage: input.stage,
          eventId: input.orderId,
          status: "claimed",
          attempts: 0,
          // Born due: leaseUntil doubles as the drain due time.
          leaseUntil: new Date(),
          triggeredAt: input.triggeredAt,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // The UNIQUE (order, stage, event) triple is the idempotency
        // authority: a concurrent trigger already owns this claim.
        return { queued: false, reason: "already_claimed" };
      }
      throw error;
    }

    return { queued: true };
  } catch (error) {
    // Deliberate swallow: CAPI must never block the caller's flow. The next
    // trigger of the same stage re-claims; the outbox remains the authority.
    console.warn(
      "[meta-capi] trigger enqueue failed:",
      error instanceof Error ? error.message : error,
    );
    return { queued: false, reason: "enqueue_failed" };
  }
}
