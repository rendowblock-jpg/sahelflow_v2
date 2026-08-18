"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { cn } from "@/lib/utils";

const QUEUES: DeskQueueFilter[] = ["mine", "unassigned", "unread", "all"];
const WORKFLOW_FILTERS: WorkflowFilter[] = [
  "all",
  "open",
  "pending",
  "resolved",
  "snoozed",
];

function relativeTime(
  value: number | undefined,
  locale: "ar" | "fr" | "en",
): string {
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

function matchesDeskFilters(
  chat: InboxChat,
  queueFilter: DeskQueueFilter,
  workflowFilter: WorkflowFilter,
  currentMemberId: string | null,
): boolean {
  const queueMatches =
    queueFilter === "all" ||
    (queueFilter === "unread" && chat.unread > 0) ||
    (queueFilter === "unassigned" && !chat.workflow.assigneeId) ||
    (queueFilter === "mine" &&
      Boolean(currentMemberId) &&
      chat.workflow.assigneeId === currentMemberId);
  if (!queueMatches) return false;
  const status = chat.workflow.status ?? "open";
  return workflowFilter === "all" || status === workflowFilter;
}

function statusLabel(
  status: string,
  t: ReturnType<typeof useInboxWorkspace>["t"],
): string {
  if (status === "pending") return t("inbox.status.pending");
  if (status === "resolved") return t("inbox.status.resolved");
  if (status === "snoozed") return t("inbox.status.snooze");
  return t("inbox.status.open");
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
  const hasOperationalMeta = status !== "open" || Boolean(chat.workflow.assigneeId);

  return (
    <button
      type="button"
      data-inbox-conversation={chat.id}
      data-inbox-unread={chat.unread > 0 ? "true" : "false"}
      data-inbox-status={status}
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex min-h-[4.75rem] w-full items-start gap-2.5 overflow-hidden border-b border-border/55 px-3 py-2.5 text-start outline-none transition-colors last:border-b-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "bg-primary/[0.065]" : "bg-background hover:bg-muted/35",
      )}
    >
      {active ? (
        <span className="absolute inset-block-2 start-0 w-0.5 rounded-full bg-primary" />
      ) : null}

      <Avatar className="mt-0.5 size-9 shrink-0 border border-border/70 bg-background">
        <AvatarFallback className="bg-primary/7 text-[13px] font-semibold text-primary">
          {chat.name.charAt(0).toUpperCase() || (
            <MessageSquareText className="size-4" />
          )}
        </AvatarFallback>
      </Avatar>

      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span
            dir="auto"
            className={cn(
              "block min-w-0 flex-1 truncate text-[13px]",
              chat.unread > 0 ? "font-semibold text-foreground" : "font-medium",
            )}
          >
            {chat.name}
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              chat.unread > 0 ? "font-medium text-primary" : "text-muted-foreground",
            )}
          >
            {relativeTime(chat.lastMessageAt, locale)}
          </span>
        </span>

        <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span
            dir="auto"
            data-inbox-preview="true"
            className={cn(
              "block min-w-0 max-w-full flex-1 truncate text-xs leading-5",
              chat.unread > 0
                ? "font-medium text-foreground/90"
                : "text-muted-foreground",
            )}
          >
            {chat.lastMessageText || copy("savedHistory")}
          </span>

          {priority ? (
            <Flag
              className={cn(
                "size-3 shrink-0",
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
            <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold leading-5 tabular-nums text-primary-foreground">
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          ) : null}
        </span>

        {hasOperationalMeta ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] leading-4 text-muted-foreground">
            {status !== "open" ? (
              <span className="truncate">{statusLabel(status, t)}</span>
            ) : null}
            {status !== "open" && chat.workflow.assigneeId ? (
              <span aria-hidden="true">·</span>
            ) : null}
            {chat.workflow.assigneeId ? (
              <span className="truncate">{copy("assignment")}</span>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function InboxV3Queue({
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

  const baseRows = useMemo(
    () =>
      chats.filter((chat) =>
        matchesDeskFilters(chat, queueFilter, workflowFilter, currentMemberId),
      ),
    [chats, currentMemberId, queueFilter, workflowFilter],
  );

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
        const response = await fetch(
          `/api/conversations/search?q=${encodeURIComponent(query.trim())}`,
          { cache: "no-store", signal: controller.signal },
        );
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
      searchState.query === normalizedQuery
        ? searchState.results.filter((chat) =>
            matchesDeskFilters(
              chat,
              queueFilter,
              workflowFilter,
              currentMemberId,
            ),
          )
        : [];
    for (const chat of [...localMatches, ...serverResults]) {
      if (!byConversation.has(chat.conversationId)) {
        byConversation.set(chat.conversationId, chat);
      }
    }
    return [...byConversation.values()];
  }, [
    currentMemberId,
    localMatches,
    normalizedQuery,
    queueFilter,
    searchState,
    workflowFilter,
  ]);

  const openChat = (chat: InboxChat) => {
    const canonical = chats.find(
      (entry) => entry.conversationId === chat.conversationId,
    );
    selectChat(canonical ?? chat);
    router.replace(
      `/inbox?conversation=${encodeURIComponent(chat.conversationId)}`,
    );
  };

  const unreadEmpty =
    queueFilter === "unread" && queueCounts.unread === 0 && !normalizedQuery;

  return (
    <section
      data-inbox-queue="true"
      aria-label={copy("workQueue")}
      className="flex min-h-0 w-full flex-1 flex-col bg-background md:w-[20.25rem] md:min-w-[20.25rem] md:flex-none md:border-e"
    >
      <div className="border-b border-border/60 px-3 py-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={copy("searchConversations")}
            placeholder={copy("searchConversations")}
            className="h-9 rounded-lg bg-muted/20 ps-8 pe-8 text-[13px]"
          />
          {searchState.query === normalizedQuery && searchState.loading ? (
            <Loader2
              className="absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label={copy("workQueue")}
          >
            {QUEUES.map((filter) => {
              const selected = queueFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onQueueFilterChange(filter)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary/25 bg-primary/9 text-primary"
                      : "border-transparent bg-muted/35 text-muted-foreground hover:bg-muted/65 hover:text-foreground",
                  )}
                >
                  <span>{queueLabel(filter, copy)}</span>
                  <span
                    className={cn(
                      "min-w-4 text-center tabular-nums",
                      selected ? "text-primary" : "text-muted-foreground/80",
                    )}
                  >
                    {queueCounts[filter]}
                  </span>
                </button>
              );
            })}
          </div>

          <select
            value={workflowFilter}
            onChange={(event) =>
              onWorkflowFilterChange(event.target.value as WorkflowFilter)
            }
            aria-label={copy("status")}
            title={copy("status")}
            className="h-8 w-[6.75rem] shrink-0 rounded-full border border-border/70 bg-background px-2 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {WORKFLOW_FILTERS.map((filter) => (
              <option key={filter} value={filter}>
                {workflowLabel(filter, copy, t)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {loadingChats ? (
          <div className="space-y-1 p-2" aria-label={t("common.loading")}>
            {[0, 1, 2, 3, 4].map((item) => (
              <div
                key={item}
                className="h-[4.75rem] animate-pulse rounded-lg bg-muted/45"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center p-6 text-center">
            <div className="max-w-56">
              <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                {unreadEmpty ? (
                  <CheckCircle2
                    className="size-4 text-success"
                    aria-hidden="true"
                  />
                ) : (
                  <MessageSquareText
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="mt-3 text-sm font-medium">
                {unreadEmpty ? copy("allCaughtUp") : copy("queueEmpty")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {unreadEmpty ? copy("allCaughtUpHint") : copy("queueEmptyHint")}
              </p>
            </div>
          </div>
        ) : (
          <div>
            {normalizedQuery &&
            searchState.query === normalizedQuery &&
            searchState.results.length > 0 ? (
              <div className="border-b border-border/55 bg-muted/15 px-3 py-1.5 text-[11px] text-muted-foreground">
                {copy("searchResults", { count: rows.length })}
              </div>
            ) : null}
            {rows.map((chat) => (
              <ConversationRow
                key={`${chat.conversationId}:${chat.id}`}
                chat={chat}
                active={
                  chat.conversationId ===
                    workspace.activeChat?.conversationId ||
                  chat.id === activeChatId
                }
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
