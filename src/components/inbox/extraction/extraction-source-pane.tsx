"use client";

import { useMemo, type ReactNode } from "react";
import { MessageSquareText, RefreshCw } from "lucide-react";

import {
  isSelectableOrderMessage,
  type OrderSourceMessage,
} from "@/components/inbox/extraction/order-source-messages";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ExtractedOrder } from "@/lib/ai/extraction";
import type { OrderExtractionCopyKey } from "@/lib/i18n/order-extraction";
import { cn } from "@/lib/utils";

type Copy = (key: OrderExtractionCopyKey, params?: Record<string, string | number>) => string;
type Kind = "product" | "customer" | "place";

const KIND_CLASS: Record<Kind, string> = {
  product: "bg-primary-soft text-foreground ring-1 ring-primary/30",
  customer: "bg-info-soft text-foreground ring-1 ring-info/30",
  place: "bg-warning-soft text-foreground ring-1 ring-warning/30",
};

const KIND_DOT: Record<Kind, string> = {
  product: "bg-primary",
  customer: "bg-info",
  place: "bg-warning",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where each read value sits in the customer's own words. Plain text values
 * match case-insensitively; a phone matches on its last nine digits with any
 * separators, so "0555 12 34 56", "+213555123456" and "0555123456" all light
 * up the same span.
 */
function needlesFor(order: ExtractedOrder | null): Array<{ pattern: RegExp; kind: Kind }> {
  if (!order) return [];
  const needles: Array<{ pattern: RegExp; kind: Kind }> = [];
  const text = (value: string | undefined, kind: Kind) => {
    const trimmed = value?.trim();
    if (trimmed && trimmed.length >= 2) {
      needles.push({ pattern: new RegExp(escapeRegExp(trimmed), "giu"), kind });
    }
  };
  for (const item of order.items ?? []) {
    text(item.sourceText ?? item.productName, "product");
  }
  text(order.customerName, "customer");
  const digits = order.phone?.replace(/\D/g, "") ?? "";
  if (digits.length >= 9) {
    const tail = digits.slice(-9).split("").join("[\\s.\\-]?");
    needles.push({
      pattern: new RegExp(`(?:\\+?213[\\s.\\-]?|0)?${tail}`, "g"),
      kind: "customer",
    });
  }
  text(order.wilaya, "place");
  text(order.commune, "place");
  text(order.address, "place");
  return needles;
}

function highlight(body: string, order: ExtractedOrder | null): ReactNode[] {
  const marks: Array<{ start: number; end: number; kind: Kind }> = [];
  for (const { pattern, kind } of needlesFor(order)) {
    for (const match of body.matchAll(pattern)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (end > start && !marks.some((mark) => start < mark.end && end > mark.start)) {
        marks.push({ start, end, kind });
      }
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start > cursor) nodes.push(body.slice(cursor, mark.start));
    nodes.push(
      <mark
        key={`${mark.start}-${mark.end}`}
        data-extraction-highlight={mark.kind}
        className={cn("rounded-control px-0.5 py-px", KIND_CLASS[mark.kind])}
      >
        {body.slice(mark.start, mark.end)}
      </mark>,
    );
    cursor = mark.end;
  }
  if (cursor < body.length) nodes.push(body.slice(cursor));
  return nodes;
}

/** The seller's pick of which customer messages make up the order. */
export interface OrderSourceSelection {
  messages: OrderSourceMessage[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** The selection differs from the one the current reading came from. */
  dirty: boolean;
  reading: boolean;
  onRead: () => void;
}

function SourceMessageList({
  selection,
  order,
  copy,
}: {
  selection: OrderSourceSelection;
  order: ExtractedOrder | null;
  copy: Copy;
}) {
  const count = selection.selectedIds.size;
  return (
    <div className="space-y-3" data-extraction-source-messages="true">
      <p className="text-caption text-muted-foreground">{copy("sourceSelectHint")}</p>
      <ol className="space-y-2">
        {selection.messages.map((message) => {
          const selectable = isSelectableOrderMessage(message);
          const selected = selection.selectedIds.has(message.id);
          if (!selectable) {
            return (
              <li
                key={message.id}
                data-extraction-source-reply="true"
                className="ms-8 rounded-surface border border-dashed border-border px-3 py-2 text-body-sm text-muted-foreground"
              >
                <span className="mb-0.5 block text-caption font-medium">{copy("sourceReply")}</span>
                <span dir="auto" className="line-clamp-3 whitespace-pre-wrap break-words" data-sf-user-content="true">
                  {message.body}
                </span>
              </li>
            );
          }
          return (
            <li key={message.id}>
              <label
                data-extraction-source-message={message.id}
                data-selected={selected ? "true" : undefined}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-surface border bg-card p-3 transition-colors",
                  selected
                    ? "border-primary/45 shadow-(--elevation-1)"
                    : "border-border opacity-70 hover:opacity-100",
                )}
              >
                <Checkbox
                  checked={selected}
                  onCheckedChange={() => selection.onToggle(message.id)}
                  aria-label={copy("sourceUseMessage")}
                  className="mt-1"
                />
                <span
                  dir="auto"
                  data-sf-user-content="true"
                  className="min-w-0 flex-1 whitespace-pre-wrap break-words text-body leading-7 [unicode-bidi:plaintext]"
                >
                  {selected ? highlight(message.body, order) : message.body}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      {count === 0 ? (
        <p className="text-caption text-warning" role="status">{copy("sourceNoneSelected")}</p>
      ) : selection.dirty ? (
        <div className="space-y-2 rounded-surface border border-primary/30 bg-primary-subtle p-3" role="status">
          <p className="text-body-sm">{copy("sourceSelectionChanged")}</p>
          <Button type="button" size="sm" onClick={selection.onRead} disabled={selection.reading}>
            <RefreshCw className={selection.reading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
            {count === 1
              ? copy("sourceReadOne")
              : copy("sourceReadSelected", { count })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The customer's words beside the order being reviewed: the seller always
 * sees what the reading came from, with every value that was read marked in
 * place. With a `selection`, the pane lists the conversation's recent
 * messages so an order spread over several of them is read as one.
 */
export function ExtractionSourcePane({
  body,
  contactName,
  order,
  copy,
  selection,
  children,
}: {
  body: string;
  contactName?: string;
  order: ExtractedOrder | null;
  copy: Copy;
  selection?: OrderSourceSelection;
  /** Reading status, method chips and AI notes under the message. */
  children?: ReactNode;
}) {
  const content = useMemo(() => highlight(body, order), [body, order]);

  return (
    <section
      data-extraction-source="true"
      className="flex min-h-0 flex-col gap-4 overflow-y-auto border-border bg-muted/30 p-5 md:border-e"
    >
      <div className="flex items-center justify-between gap-2 text-caption font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <MessageSquareText className="size-4" aria-hidden="true" />
          {selection ? copy("sourceMessagesTitle") : copy("sourceTitle")}
          {selection && contactName ? (
            <span dir="auto" className="font-semibold text-foreground" data-sf-user-content="true">
              · {contactName}
            </span>
          ) : null}
        </span>
        {selection ? (
          <span className="tabular-nums">
            {copy("sourceSelected", { count: selection.selectedIds.size })}
          </span>
        ) : null}
      </div>
      {selection ? (
        <SourceMessageList selection={selection} order={order} copy={copy} />
      ) : (
        <div className="rounded-surface rounded-ss-control border border-border bg-card p-4 shadow-(--elevation-1)">
          {contactName ? (
            <p dir="auto" className="mb-2 text-body-sm font-semibold" data-sf-user-content="true">
              {contactName}
            </p>
          ) : null}
          <p
            dir="auto"
            data-sf-user-content="true"
            className="whitespace-pre-wrap break-words text-body leading-7 [unicode-bidi:plaintext]"
          >
            {content}
          </p>
        </div>
      )}
      {order ? (
        <div className="space-y-2">
          <p className="text-caption text-muted-foreground">{copy("sourceHint")}</p>
          <div className="flex flex-wrap gap-3 text-caption text-muted-foreground">
            {(["product", "customer", "place"] as const).map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", KIND_DOT[kind])} aria-hidden="true" />
                {copy(
                  kind === "product"
                    ? "legendProduct"
                    : kind === "customer"
                      ? "legendCustomer"
                      : "legendPlace",
                )}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {children}
    </section>
  );
}
