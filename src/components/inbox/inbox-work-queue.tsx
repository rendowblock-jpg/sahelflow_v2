"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  CheckCircle2,
  Flag,
  Loader2,
  MessageSquareText,
  Search,
} from "lucide-react";

import type {
  DeskQueueFilter,
  InboxSearchResult,
  WorkflowFilter,
} from "@/components/inbox/inbox-desk-types";
import { searchResultToChat } from "@/components/inbox/inbox-desk-types";
import type { InboxChat } from "@/components/inbox/inbox-workspace-types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { cn } from "@/lib/utils";

const QUEUES: DeskQueueFilter[] = ["mine", "unassigned", "unread", "all"];
const WORKFLOW_FILTERS: WorkflowFilter[] = ["all", "open", "pending", "resolved", "snoozed"];

function relativeTime(value: number | undefined, locale: "ar" | "fr" | "en"): string {
  if (!value) return "";
  const diff = Math.max(0, Date.now() - value);
  const rtf = new Intl.RelativeTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
    { numeric: "auto" },
  );
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return rtf.format(0, "second");
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
    { day: "numeric", month: "short" },
  ).format(new Date(value));
}

function queueLabel(
  filter: DeskQueueFilter,
  copy: ReturnType<typeof useInboxWorkspace>["copy"],
): string {
  switch (filter) {
    case "mine":
      return copy("queueMine");
    case "unassigned":
      return copy("queueUnassigned");
    case "unread":
      return copy("queueUnread");
    case "all":
      return copy("queueAll");
  }
}

function workflowLabel(
  filter: WorkflowFilter,
  copy: ReturnType<typeof useInboxWorkspace>["copy"],
  t: ReturnType<typeof useInboxWorkspace>["t"],
): string {
  switch (filter) {
    case "all":
      return copy("queueAll");
    case "open":
      return copy("queueOpen");
    case "pending":
      return copy("queuePending");
    case "resolved":
      return copy("queueResolved");
    case "snoozed":
      return t("inbox.status.snooze");
  }
}

function ConversationRow({
  chat,
  active,
  locale,
  t,
  copy,
  onSelect,
}: {
  chat: InboxChat;
  active: boolean;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
  onSelect: () => void;
}) {
  const status = chat.workflow.status ?? "open";
  const priority = chat.workflow.priority;
  return (
    <button
      type="button"
      data-inbox-conversation={chat.id}
      data-inbox-unread={chat.unread > 0 ? "true" : "false"}
      data-inbox-status={status}
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex min-h-[5.5rem] w-full items-start gap-3 border-b px-3.5 py-3 text-start outline-none transition-colors last:border-b-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "bg-accent/75" : "bg-background hover:bg-muted/45",
      )}
    >
      {active ? <span className="absolute inset-block-2 start-0 w-0.5 rounded-full bg-primary" /> : null}
      <Avatar className="mt-0.5 size-10 shrink-0 border bg-background">
        <AvatarFallback className="bg-primary/8 text-sm font-semibold text-primary">
          {chat.name.charAt(0).toUpperCase() || <MessageSquareText className="size-4" />}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{chat.name}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {relativeTime(chat.lastMessageAt, locale)}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-xs leading-5", chat.unread > 0 ? "font-medium text-foreground" : "text-muted-foreground")}>
            {chat.lastMessageText || "—"}
          </span>
          {priority ? (
            <Flag
              className={cn(
                "size-3.5 shrink-0",
                priority === "urgent"
                  ? "text-destructive"
                  : priority === "high"
                    ? "text-orange-500"
                    : priority === "medium"
                      ? "text-primary"
                      : "text-muted-foreground",
              )}
              aria-label={t(`inbox.priority.${priority}`)}
            />
          ) : null}
          {chat.unread > 0 ? (
            <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold leading-5 text-primary-foreground">
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          ) : null}
        </span>
        <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {status === "pending"
              ? t("inbox.status.pending")
              : status === "resolved"
                ? t("inbox.status.resolved")
                : status === "snoozed"
                  ? t("inbox.status.snooze")
                  : t("inbox.status.open")}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate">
            {chat.workflow.assigneeId ? copy("assignment") : copy("unassigned")}
          </span>
        </span>
      </span>
    </button>
  );
}

export function InboxWorkQueue({
  workspace,
  chats,
  activeChatId,
  currentMemberId,
  queueFilter,
  workflowFilter,
  onQueueFilterChange,
  onWorkflowFilterChange,
}: {
  workspace: ReturnType<typeof useInboxWorkspace>;
  chats: InboxChat[];
  activeChatId: string | null;
  currentMemberId: string | null;
  queueFilter: DeskQueueFilter;
  workflowFilter: WorkflowFilter;
  onQueueFilterChange: (filter: DeskQueueFilter) => void;
  onWorkflowFilterChange: (filter: WorkflowFilter) => void;
}) {
  const router = useRouter();
  const { copy, t, locale, selectChat, loadingChats } = workspace;
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<{
    query: string;
    loading: boolean;
    results: InboxChat[];
  }>({ query: "", loading: false, results: [] });

  const queueCounts = useMemo(
    () => ({
      mine: currentMemberId
        ? chats.filter((chat) => chat.workflow.assigneeId === currentMemberId).length
        : 0,
      unassigned: chats.filter((chat) => !chat.workflow.assigneeId).length,
      unread: chats.filter((chat) => chat.unread > 0).length,
      all: chats.length,
    }),
    [chats, currentMemberId],
  );

  const baseRows = useMemo(() => {
    return chats.filter((chat) => {
      const queueMatches =
        queueFilter === "all" ||
        (queueFilter === "unread" && chat.unread > 0) ||
        (queueFilter === "unassigned" && !chat.workflow.assigneeId) ||
        (queueFilter === "mine" && Boolean(currentMemberId) && chat.workflow.assigneeId === currentMemberId);
      if (!queueMatches) return false;
      const status = chat.workflow.status ?? "open";
      return workflowFilter === "all" || status === workflowFilter;
    });
  }, [chats, currentMemberId, queueFilter, workflowFilter]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const localMatches = useMemo(() => {
    if (!normalizedQuery) return baseRows;
    return baseRows.filter((chat) =>
      [chat.name, chat.phone, chat.lastMessageText]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [baseRows, normalizedQuery]);

  useEffect(() => {
    if (normalizedQuery.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchState((current) => ({
        ...current,
        query: normalizedQuery,
        loading: true,
      }));
      try {
        const response = await fetch(`/api/conversations/search?q=${encodeURIComponent(query.trim())}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        const data = (await response.json()) as { results: InboxSearchResult[] };
        setSearchState({
          query: normalizedQuery,
          loading: false,
          results: data.results.map((result) =>
            searchResultToChat(result, copy("restrictedContact")),
          ),
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSearchState({ query: normalizedQuery, loading: false, results: [] });
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchState((current) =>
            current.query === normalizedQuery
              ? { ...current, loading: false }
              : current,
          );
        }
      }
    }, 240);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [copy, normalizedQuery, query]);

  const rows = useMemo(() => {
    if (!normalizedQuery) return localMatches;
    const byConversation = new Map<string, InboxChat>();
    const serverResults =
      searchState.query === normalizedQuery ? searchState.results : [];
    for (const chat of [...localMatches, ...serverResults]) {
      if (!byConversation.has(chat.conversationId)) byConversation.set(chat.conversationId, chat);
    }
    return [...byConversation.values()];
  }, [localMatches, normalizedQuery, searchState]);

  const openChat = (chat: InboxChat) => {
    const canonical = chats.find((entry) => entry.conversationId === chat.conversationId);
    if (canonical) {
      selectChat(canonical);
      return;
    }
    router.push(`/inbox?conversation=${encodeURIComponent(chat.conversationId)}`);
  };

  const unreadEmpty = queueFilter === "unread" && queueCounts.unread === 0 && !normalizedQuery;

  return (
    <section
      data-inbox-queue="true"
      aria-label={copy("workQueue")}
      className="flex min-h-0 w-full flex-1 flex-col bg-background md:w-[19.5rem] md:min-w-[19.5rem] md:flex-none md:border-e"
    >
      <div className="border-b px-3.5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{copy("workQueue")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy("canonicalHistory")} · {chats.length}</p>
          </div>
          {queueCounts.unread > 0 ? (
            <Badge variant="secondary" className="gap-1 px-2 text-xs">
              <BellRing className="size-3" aria-hidden="true" />
              {queueCounts.unread}
            </Badge>
          ) : null}
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={copy("searchConversations")}
            placeholder={copy("searchConversations")}
            className="h-9 ps-8 text-sm"
          />
          {searchState.query === normalizedQuery && searchState.loading ? <Loader2 className="absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-1.5" role="group" aria-label={copy("workQueue")}>
          {QUEUES.map((filter) => {
            const selected = queueFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={selected}
                onClick={() => onQueueFilterChange(filter)}
                className={cn(
                  "flex min-h-9 items-center justify-between gap-2 rounded-lg border px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary/25 bg-primary/10 text-primary"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{queueLabel(filter, copy)}</span>
                <span className="tabular-nums">{queueCounts[filter]}</span>
              </button>
            );
          })}
        </div>

        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">{copy("status")}</span>
          <select
            value={workflowFilter}
            onChange={(event) => onWorkflowFilterChange(event.target.value as WorkflowFilter)}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {WORKFLOW_FILTERS.map((filter) => (
              <option key={filter} value={filter}>{workflowLabel(filter, copy, t)}</option>
            ))}
          </select>
        </label>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loadingChats ? (
          <div className="space-y-1 p-2" aria-label={t("common.loading")}>
            {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[5.5rem] animate-pulse rounded-md bg-muted/55" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center p-6 text-center">
            <div className="max-w-56">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                {unreadEmpty ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : <MessageSquareText className="size-4 text-muted-foreground" aria-hidden="true" />}
              </div>
              <p className="mt-3 text-sm font-medium">{unreadEmpty ? copy("allCaughtUp") : copy("queueEmpty")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{unreadEmpty ? copy("allCaughtUpHint") : copy("queueEmptyHint")}</p>
            </div>
          </div>
        ) : (
          <div>
            {normalizedQuery && searchState.query === normalizedQuery && searchState.results.length > 0 ? (
              <div className="border-b bg-muted/20 px-3.5 py-2 text-xs text-muted-foreground">{copy("searchResults", { count: rows.length })}</div>
            ) : null}
            {rows.map((chat) => (
              <ConversationRow
                key={`${chat.conversationId}:${chat.id}`}
                chat={chat}
                active={chat.conversationId === workspace.activeChat?.conversationId || chat.id === activeChatId}
                locale={locale}
                t={t}
                copy={copy}
                onSelect={() => openChat(chat)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}
