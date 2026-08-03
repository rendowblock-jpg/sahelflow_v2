import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import {
  systemBusinessPrincipal,
  type TrustedBusinessPrincipal,
} from "@/lib/business-truth/principal";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";
import {
  processWhatsAppEffect,
  queueWhatsAppText,
  type WhatsAppEffectStatus,
} from "@/lib/whatsapp/durable-send";

const reportDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type ShopBoundServiceContext = Extract<ServiceContext, { shop: unknown }>;
type DailyReportContext = ShopBoundServiceContext & {
  readonly whatsAppProviderAccountId?: string;
};
type DailyReportCommandContext = DailyReportContext & {
  readonly businessPrincipal: TrustedBusinessPrincipal;
};

export interface QueueDailyWhatsAppReportInput {
  reportDate: string;
  phone: string;
  text: string;
}

export interface DailyWhatsAppReportResult {
  reportDate: string;
  messageId: string;
  effectKey: string;
  replayed: boolean;
  effect: WhatsAppEffectStatus;
}

function deterministicUuid(value: string): string {
  const hex = createHash("sha256").update(value, "utf8").digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function reportIdentity(context: DailyReportContext, reportDate: string): string {
  return JSON.stringify([
    "daily-whatsapp-report-v1",
    context.shop.workspaceId,
    context.shop.installationId,
    context.shop.shopId,
    context.shop.shopIncarnationId,
    reportDate,
  ]);
}

/**
 * Queue and make one bounded processing attempt for the exact shop/report day.
 *
 * Repeated calls use the same client message identity and therefore the same
 * encrypted WhatsApp effect. A confirmed provider receipt is replayed locally;
 * the provider is never called again merely because the report marker failed.
 */
export async function queueDailyWhatsAppReport(
  context: DailyReportContext,
  rawInput: QueueDailyWhatsAppReportInput,
): Promise<DailyWhatsAppReportResult> {
  const reportDate = reportDateSchema.parse(rawInput.reportDate);
  const phone = z.string().trim().min(1).max(100).parse(rawInput.phone);
  const text = z.string().trim().min(1).max(4000).parse(rawInput.text);
  const messageId = deterministicUuid(reportIdentity(context, reportDate));
  const commandContext: DailyReportCommandContext = {
    ...context,
    businessPrincipal: systemBusinessPrincipal("scheduler"),
  };
  const queued = await queueWhatsAppText(commandContext, {
    clientMessageId: messageId,
    to: phone,
    text,
  });
  const effect = await processWhatsAppEffect(
    commandContext,
    queued.effectKey,
  );
  return {
    reportDate,
    messageId,
    effectKey: queued.effectKey,
    replayed: queued.replayed,
    effect,
  };
}
