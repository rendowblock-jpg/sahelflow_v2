"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExtractionReview, type ReviewedOrder } from "@/components/inbox/extraction/extraction-review";
import type { CatalogOption } from "@/components/inbox/extraction/extraction-item-row";
import { useI18n } from "@/hooks/use-i18n";
import type { ExtractionResult } from "@/lib/ai/extraction";
import {
  getOrderExtractionCopy,
  type OrderExtractionCopyKey,
  type OrderExtractionLocale,
} from "@/lib/i18n/order-extraction";

interface MessageExtractionProps {
  conversationId?: string;
  messageId: string;
  messageBody: string;
  knownPhone?: string;
}

interface ExtractionResponse {
  result: ExtractionResult;
  catalog: CatalogOption[];
  ai: { consent: boolean; available: boolean };
}

function algerianPhoneToWhatsAppJid(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const international = digits.startsWith("0")
    ? `213${digits.slice(1)}`
    : digits.startsWith("213")
      ? digits
      : `213${digits}`;
  return `${international}@s.whatsapp.net`;
}

/**
 * FD-064 order extraction: read the customer's message (on this device, and
 * with Gemini when the seller enabled it), then let the seller confirm or
 * correct every field against the real catalog before the order exists.
 */
export function MessageExtraction({
  conversationId,
  messageId,
  messageBody,
  knownPhone,
}: MessageExtractionProps) {
  const { locale } = useI18n();
  const router = useRouter();
  const fieldId = useId();
  const copy = (key: OrderExtractionCopyKey, params?: Record<string, string | number>) =>
    getOrderExtractionCopy(locale as OrderExtractionLocale, key, params);
  const [response, setResponse] = useState<ExtractionResponse | null>(null);
  const [reading, setReading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  async function handleRead() {
    setReading(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageBody, channel: "whatsapp", knownPhone, messageId }),
      });
      if (!res.ok) throw new Error(copy("failed"));
      setResponse((await res.json()) as ExtractionResponse);
      setRevision((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy("failed"));
    } finally {
      setReading(false);
    }
  }

  async function handleCreate(reviewed: ReviewedOrder) {
    if (!response) return;
    const { result } = response;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/source/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId ?? algerianPhoneToWhatsAppJid(reviewed.customer.phone),
          messageId,
          // A hand-built order is still anchored to this message; its method
          // records how the draft was produced.
          extractionMethod: result.method === "gemini" ? "gemini" : "regex",
          extractionConfidence: result.confidence,
          customer: {
            ...reviewed.customer,
            name: reviewed.customer.name || copy("customerTitle"),
          },
          items: reviewed.items,
          deliveryCost: 600,
          notes: reviewed.notes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = body.error?.message ?? body.error;
        throw new Error(typeof message === "string" ? message : copy("failed"));
      }
      router.push(`/orders/${body.order.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy("failed"));
    } finally {
      setCreating(false);
    }
  }

  if (!response) {
    return (
      <div className="space-y-2">
        <Button variant="outline" size="sm" onClick={handleRead} disabled={reading}>
          {reading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {reading ? copy("reading") : copy("read")}
        </Button>
        {error ? (
          <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const { result, catalog, ai } = response;
  return (
    <div className="space-y-4" data-extraction-method={result.method}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {result.order ? (
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <p className="text-sm font-medium">
            {result.order ? copy("foundTitle") : copy("notFoundTitle")}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRead} disabled={reading} aria-label={copy("readAgain")}>
          <RefreshCw className={reading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
        </Button>
      </div>

      {result.order ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {result.method === "gemini" ? copy("methodGemini") : copy("methodOffline")}
          </Badge>
          <Badge variant="outline" className="tabular-nums">
            {copy("confidence", { value: Math.round(result.confidence * 100) })}
          </Badge>
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">{copy("notFoundHint")}</p>
      )}

      {result.aiFailure ? (
        <p className="text-caption text-muted-foreground" role="status">{copy("aiFailed")}</p>
      ) : !ai.consent && !result.isComplete ? (
        <p className="text-caption text-muted-foreground">
          {copy("aiOff")}{" "}
          <button
            type="button"
            onClick={() => router.push("/settings?group=intelligence")}
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            {copy("aiSettings")}
            <ArrowRight className="size-3 icon-rtl-flip" aria-hidden="true" />
          </button>
        </p>
      ) : null}

      <ExtractionReview
        key={revision}
        order={result.order ?? result.partial ?? null}
        knownPhone={knownPhone}
        catalog={catalog}
        locale={locale}
        copy={copy}
        fieldId={fieldId}
        creating={creating}
        onCreate={handleCreate}
      />

      {error ? (
        <p className="flex items-start gap-1.5 text-sm text-destructive" role="alert">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
