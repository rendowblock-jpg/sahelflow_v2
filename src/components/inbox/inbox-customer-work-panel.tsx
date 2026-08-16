"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Loader2,
  MapPin,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  UserRound,
} from "lucide-react";

import { ConversationCollaborationInline } from "@/components/inbox/conversation-collaboration-inline";
import { ConversationControls } from "@/components/inbox/conversation-controls";
import type {
  InboxChat,
  InboxMessage,
} from "@/components/inbox/inbox-workspace-types";
import { MessageExtraction } from "@/components/inbox/message-extraction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import { cn } from "@/lib/utils";

type ContextResponse = {
  customer: {
    id: string;
    name: string;
    phone: string;
    wilaya: string | null;
    commune: string | null;
    orderCount: number;
    totalSpent: number | null;
    riskScore: number;
    isBlacklisted: boolean;
    blacklistReason: string | null;
  } | null;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    source: string;
    totalPrice: number | null;
    createdAt: string;
    deliveredAt: string | null;
  }>;
  deliveryRate: number | null;
  fieldAccess: {
    customer: boolean;
    contact: boolean;
    orders: boolean;
    financials: boolean;
  };
};

function formatMoney(value: number, locale: "ar" | "fr" | "en"): string {
  return new Intl.NumberFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-DZ",
    {
      style: "currency",
      currency: "DZD",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function riskClass(score: number, blacklisted: boolean): string {
  if (blacklisted || score >= 70) {
    return "border-destructive/25 bg-destructive/8 text-destructive";
  }
  if (score >= 40) {
    return "border-warning/25 bg-warning/8 text-warning";
  }
  return "border-success/25 bg-success/8 text-success";
}

export function InboxCustomerWorkPanel({
  chat,
  orderCandidate,
  canUpdateConversation,
  refreshChats,
}: {
  chat: InboxChat;
  orderCandidate: InboxMessage | null;
  canUpdateConversation: boolean;
  refreshChats: () => Promise<void>;
}) {
  const { locale } = useI18n();
  const copy = useCallback(
    (
      key: Parameters<typeof getInboxWorkspaceCopy>[1],
      params?: Record<string, string | number>,
    ) => getInboxWorkspaceCopy(locale, key, params),
    [locale],
  );
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(
          `/api/inbox/context/${encodeURIComponent(chat.conversationId)}`,
          { cache: "no-store", signal },
        );
        if (!response.ok) throw new Error(`Context load failed: ${response.status}`);
        setContext((await response.json()) as ContextResponse);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setContext(null);
        setError(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [chat.conversationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [load]);

  const location = useMemo(() => {
    const customer = context?.customer;
    if (!customer) return null;
    return [customer.commune, customer.wilaya].filter(Boolean).join(", ") || null;
  }, [context?.customer]);

  return (
    <div data-inbox-context="true" className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b px-4 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {copy("conversationContext")}
        </p>
        <p className="mt-1 truncate text-sm font-semibold">{chat.name}</p>
        {chat.phone ? (
          <p
            dir="ltr"
            className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground"
          >
            {chat.phone}
          </p>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">
          <section aria-labelledby={`customer-${chat.conversationId}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 id={`customer-${chat.conversationId}`} className="text-sm font-semibold">
                {copy("customerSection")}
              </h3>
              <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>

            {loading ? (
              <div className="mt-3 flex min-h-20 items-center text-sm text-muted-foreground">
                <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
                {copy("loadingContext")}
              </div>
            ) : error ? (
              <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                <p>{copy("contextUnavailable")}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => void load()}
                >
                  <RefreshCw className="me-1.5 size-3.5" aria-hidden="true" />
                  {copy("refreshContext")}
                </Button>
              </div>
            ) : !context?.customer ? (
              <p className="mt-3 rounded-lg bg-muted/35 p-3 text-sm leading-5 text-muted-foreground">
                {copy("customerNotLinked")}
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="rounded-xl border bg-muted/20 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{context.customer.name}</p>
                      <p dir="ltr" className="mt-0.5 truncate text-xs text-muted-foreground">
                        {context.customer.phone}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 gap-1 text-xs",
                        riskClass(
                          context.customer.riskScore,
                          context.customer.isBlacklisted,
                        ),
                      )}
                    >
                      {context.customer.isBlacklisted ? (
                        <ShieldAlert className="size-3" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="size-3" aria-hidden="true" />
                      )}
                      {context.customer.riskScore}
                    </Badge>
                  </div>

                  {location ? (
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                      <span>{location}</span>
                    </div>
                  ) : null}
                  {context.customer.isBlacklisted ? (
                    <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/6 px-2.5 py-2 text-xs text-destructive">
                      <span className="font-semibold">{copy("blacklisted")}</span>
                      {context.customer.blacklistReason ? (
                        <span className="ms-1.5">{context.customer.blacklistReason}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/30 p-2.5">
                    <dt className="text-muted-foreground">{copy("orders")}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">
                      {context.customer.orderCount}
                    </dd>
                  </div>
                  <div className="rounded-lg bg-muted/30 p-2.5">
                    <dt className="text-muted-foreground">{copy("deliveryRate")}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">
                      {context.deliveryRate === null ? "—" : `${context.deliveryRate}%`}
                    </dd>
                  </div>
                  {context.customer.totalSpent !== null ? (
                    <div className="col-span-2 rounded-lg bg-muted/30 p-2.5">
                      <dt className="text-muted-foreground">{copy("totalSpent")}</dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">
                        {formatMoney(context.customer.totalSpent, locale)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            )}
          </section>

          <section className="border-t pt-5" aria-labelledby={`work-${chat.conversationId}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 id={`work-${chat.conversationId}`} className="text-sm font-semibold">
                {copy("workSection")}
              </h3>
              <PackageCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="mt-3">
              <ConversationControls
                conversationId={chat.conversationId}
                initial={chat.workflow}
                canUpdate={canUpdateConversation}
                onUpdated={() => void refreshChats()}
              />
            </div>
            <div className="mt-4 border-t pt-4">
              <ConversationCollaborationInline conversationId={chat.conversationId} />
            </div>
          </section>

          <section className="border-t pt-5" aria-labelledby={`order-${chat.conversationId}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 id={`order-${chat.conversationId}`} className="text-sm font-semibold">
                {copy("orderSection")}
              </h3>
              <ReceiptText className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>

            {context?.fieldAccess.orders ? (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {copy("recentOrders")}
                </p>
                {context.recentOrders.length === 0 ? (
                  <p className="mt-2 text-sm leading-5 text-muted-foreground">
                    {copy("noRecentOrders")}
                  </p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {context.recentOrders.map((order) => (
                      <a
                        key={order.id}
                        href={`/orders/${order.id}`}
                        className="group flex items-center justify-between gap-3 rounded-lg border bg-muted/15 px-3 py-2.5 text-sm transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{order.orderNumber}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {order.status}
                            {order.totalPrice !== null
                              ? ` · ${formatMoney(order.totalPrice, locale)}`
                              : ""}
                          </span>
                        </span>
                        <ArrowUpRight
                          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100"
                          aria-hidden="true"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-4 border-t pt-4">
              <div className="flex items-start gap-2">
                <ShoppingBag className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{copy("orderCandidate")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {copy("orderCandidateHint")}
                  </p>
                </div>
              </div>

              {orderCandidate && chat.transportId ? (
                <div className="mt-3">
                  <MessageExtraction
                    conversationId={chat.transportId}
                    messageId={orderCandidate.id}
                    messageBody={orderCandidate.body}
                    knownPhone={chat.phone}
                  />
                </div>
              ) : (
                <p className="mt-3 rounded-lg bg-muted/35 p-3 text-sm leading-5 text-muted-foreground">
                  {copy("noOrderCandidate")}
                </p>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
