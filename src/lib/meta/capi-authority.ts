/**
 * Meta Pixel / CAPI configuration authority + trigger enqueue.
 *
 * FD-061 EX-3 (contracts extracted from CodFlow @ 00f18fa, Apache-2.0). The
 * desktop is authoritative: triggers ride the desktop outbox (OutboxIntent
 * with a deterministic effect key), never a Worker, and a CAPI failure can
 * never block order or delivery confirmation — every trigger is
 * fire-and-forget with the disposition recorded on the ledger.
 *
 * The access token rides the encrypted Secret authority under
 * `meta_capi_access_token`; the config model holds only non-secret fields.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import type { ServiceContext } from "@/lib/data/service-base";
import { getSecret, setSecret } from "@/lib/secrets";
import {
  resolveConversionForStage,
  resolveCapiDispatch,
  getCapiEffectKey,
  CAPI_LEASE_MS,
  type ConversionStage,
  type ConversionMode,
  type MetaEventName,
} from "./capi-conversion";

export const META_CAPI_TOKEN_SECRET_KEY = "meta_capi_access_token";
export const META_CAPI_EFFECT_TYPE = "meta.capi.send.v1";

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

/**
 * Fire-and-forget trigger for a business stage. Validates the conversion
 * gate, claims the ledger row (UNIQUE (order, stage, event) + skipDuplicates)
 * and enqueues the outbox intent. Never throws into the caller's flow: a
 * CAPI failure must never block order or delivery confirmation.
 */
export async function queueCapiStage(
  context: ServiceContext,
  input: {
    orderId: string;
    stage: ConversionStage;
    triggeredAt: Date;
    triggerStatus: string;
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

    const effectKey = getCapiEffectKey(input.orderId, input.stage, eventName);
    const claimed = await context.prisma.capiEventLedger.createMany({
      data: [
        {
          id: randomUUID(),
          orderId: input.orderId,
          eventName,
          stage: input.stage,
          eventId: input.orderId,
          status: "claimed",
          attempts: 0,
          leaseUntil: new Date(Date.now() + CAPI_LEASE_MS),
          triggeredAt: input.triggeredAt,
        },
      ],
      skipDuplicates: true,
    });
    if (claimed.count === 0) {
      return { queued: false, reason: "already_claimed" };
    }

    await context.prisma.outboxIntent.upsert({
      where: { effectKey },
      create: {
        id: randomUUID(),
        effectKey,
        commandId: `capi:${input.orderId}`,
        effectType: META_CAPI_EFFECT_TYPE,
        payloadJson: JSON.stringify({
          orderId: input.orderId,
          stage: input.stage,
          eventName,
          triggeredAt: Math.floor(input.triggeredAt.getTime() / 1000),
          triggerStatus: input.triggerStatus,
        }),
        status: "queued",
        nextAttemptAt: new Date(),
      },
      update: { nextAttemptAt: new Date() },
    });

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
