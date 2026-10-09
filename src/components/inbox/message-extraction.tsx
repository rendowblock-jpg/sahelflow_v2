"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  EXTRACTION_DELIVERY_COST,
  ExtractionReview,
  type ReviewedOrder,
} from "@/components/inbox/extraction/extraction-review";
import { ExtractionSourcePane } from "@/components/inbox/extraction/extraction-source-pane";
import {
  ORDER_SOURCE_MAX_SELECTED,
  composeOrderSource,
  defaultOrderSelection,
  orderSourceWindow,
  type OrderSourceMessage,
} from "@/components/inbox/extraction/order-source-messages";
import type { CatalogOption } from "@/components/inbox/extraction/extraction-item-row";
import { useI18n } from "@/hooks/use-i18n";
import type { ExtractionResult } from "@/lib/ai/extraction";
import {
  getOrderExtractionCopy,
  type OrderExtractionCopyKey,
  type OrderExtractionLocale,
} from "@/lib/i18n/order-extraction";
import { localizeServerMessage } from "@/lib/i18n/localize-server-message";

interface MessageExtractionProps {
  conversationId?: string;
  messageId: string;
  messageBody: string;
  knownPhone?: string;
  /**
   * `workspace` is the two-pane review (customer message beside the order)
   * used by the review dialog; it reads the message as soon as it opens.
   */
  layout?: "inline" | "workspace";
  contactName?: string;
  /**
   * The conversation's messages. With them the order is read from a SET of
   * customer messages — by default the burst around `messageId` — that the
   * seller can adjust, instead of a single message.
   */
  sourceMessages?: OrderSourceMessage[];
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
  layout = "inline",
  contactName,
  sourceMessages,
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
  const sourceWindow = useMemo(
    () => (sourceMessages ? orderSourceWindow(sourceMessages) : null),
    [sourceMessages],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    sourceMessages
      ? new Set(defaultOrderSelection(orderSourceWindow(sourceMessages), messageId))
      : new Set(),
  );
  const composed = sourceWindow
    ? composeOrderSource(sourceWindow, selectedIds)
    : { body: messageBody, anchorId: messageId, count: 1 };
  const selectionKey = [...selectedIds].sort().join(",");
  // What the current reading came from: its selection and anchor message.
  const [readSource, setReadSource] = useState<{ key: string; anchorId: string } | null>(null);

  const toggleSource = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < ORDER_SOURCE_MAX_SELECTED) next.add(id);
      return next;
    });

  async function handleRead() {
    if (composed.count === 0 || !composed.anchorId) return;
    const anchorId = composed.anchorId;
    const key = selectionKey;
    setReading(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: composed.body,
          channel: "whatsapp",
          knownPhone,
          messageId: anchorId,
        }),
      });
      if (!res.ok) throw new Error(copy("failed"));
      setResponse((await res.json()) as ExtractionResponse);
      setReadSource({ key, anchorId });
      setRevision((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? localizeServerMessage(caught.message) : copy("failed"));
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
          // Anchored to the latest message the reading came from.
          messageId: readSource?.anchorId ?? messageId,
          // A hand-built order is still anchored to this message; its method
          // records how the draft was produced.
          extractionMethod: result.method === "gemini" ? "gemini" : "regex",
          extractionConfidence: result.confidence,
          customer: {
            ...reviewed.customer,
            name: reviewed.customer.name || copy("customerTitle"),
          },
          items: reviewed.items,
          deliveryCost: EXTRACTION_DELIVERY_COST,
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
      setError(caught instanceof Error ? localizeServerMessage(caught.message) : copy("failed"));
    } finally {
      setCreating(false);
    }
  }

  // The review workspace opens because the seller asked for this order to be
  // read, so it reads immediately instead of asking a second time.
  const autoReadRef = useRef(false);
  useEffect(() => {
    if (layout !== "workspace" || autoReadRef.current) return;
    autoReadRef.current = true;
    void handleRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, [layout]);

  if (layout === "workspace") {
    const read = response?.result ?? null;
    const draft = read ? read.order ?? read.partial ?? null : null;
    return (
      <div
        data-extraction-workspace="true"
        data-extraction-method={read?.method}
        className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-1"
      >
        <ExtractionSourcePane
          body={composed.body}
          contactName={contactName}
          order={draft}
          copy={copy}
          selection={
            sourceWindow && sourceWindow.length > 0
              ? {
                  messages: sourceWindow,
                  selectedIds,
                  onToggle: toggleSource,
                  dirty: response !== null && readSource?.key !== selectionKey,
                  reading,
                  onRead: () => void handleRead(),
                }
              : undefined
          }
        >
          {read ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="flex items-center gap-2 text-body-sm font-medium">
                {read.order ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                {read.order ? copy("foundTitle") : copy("notFoundTitle")}
              </p>
              {read.order ? (
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {read.method === "gemini" ? copy("methodGemini") : copy("methodOffline")}
                  </Badge>
                  <Badge variant="outline" className="tabular-nums">
                    {copy("confidence", { value: Math.round(read.confidence * 100) })}
                  </Badge>
                </div>
              ) : (
                <p className="text-caption text-muted-foreground">{copy("notFoundHint")}</p>
              )}
              {read.aiFailure ? (
                <p className="text-caption text-muted-foreground" role="status">{copy("aiFailed")}</p>
              ) : !response?.ai.consent && !read.isComplete ? (
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
              <Button type="button" variant="ghost" size="sm" onClick={handleRead} disabled={reading} className="-ms-2">
                <RefreshCw className={reading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
                {copy("readAgain")}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="flex items-start gap-1.5 text-body-sm text-destructive" role="alert">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </ExtractionSourcePane>

        <div className="flex min-h-0 flex-col">
          {response ? (
            <ExtractionReview
              key={revision}
              variant="workspace"
              order={response.result.order ?? response.result.partial ?? null}
              knownPhone={knownPhone}
              catalog={response.catalog}
              locale={locale}
              copy={copy}
              fieldId={fieldId}
              creating={creating}
              onCreate={handleCreate}
            />
          ) : (
            <div className="space-y-5 p-5" role="status" aria-label={copy("reading")}>
              <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
                {reading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                {reading ? copy("reading") : copy("failed")}
              </p>
              {reading
                ? [0, 1, 2].map((row) => (
                    <div key={row} className="space-y-2">
                      <span className="block h-3 w-24 animate-pulse rounded-full bg-muted" />
                      <span className="block h-9 animate-pulse rounded-control bg-muted/60" />
                    </div>
                  ))
                : (
                  <Button type="button" variant="outline" size="sm" onClick={handleRead}>
                    <RefreshCw className="size-4" aria-hidden="true" />
                    {copy("readAgain")}
                  </Button>
                )}
            </div>
          )}
        </div>
      </div>
    );
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
