"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Flag,
  ListChecks,
  Loader2,
  MessageSquareText,
  Search,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";

import type {
  DeskQueueFilter,
  InboxSearchResult,
  WorkflowFilter,
} from "@/components/inbox/inbox-desk-types";
import { searchResultToChat } from "@/components/inbox/inbox-desk-types";
import type { InboxChat } from "@/components/inbox/inbox-workspace-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const PRIMARY_QUEUES: DeskQueueFilter[] = ["all", "mine", "unread"];
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
  now: number = Date.now(),
): string {
  if (!value) return "";
  const diff = Math.max(0, now - value);
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
  relativeNow,
  t,
  copy,
  selectMode,
  checked,
  onSelect,
  onToggle,
}: {
  chat: InboxChat;
  active: boolean;
  locale: "ar" | "fr" | "en";
  relativeNow: number;
  t: ReturnType<typeof useInboxWorkspace>["t"];
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
  selectMode: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: () => void;
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
      data-inbox-selected={selectMode && checked ? "true" : "false"}
      onClick={selectMode ? onToggle : onSelect}
      aria-current={!selectMode && active ? "true" : undefined}
      aria-pressed={selectMode ? checked : undefined}
      className={cn(
        "group relative flex min-h-[4.75rem] w-full items-start gap-2.5 overflow-hidden border-b border-border/55 px-3 py-2.5 text-start outline-none transition-colors last:border-b-0 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selectMode && checked
          ? "bg-primary/[0.07]"
          : active
            ? "bg-primary/[0.055]"
            : "bg-background hover:bg-muted/35",
      )}
    >
      {selectMode ? (
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/80 bg-background",
          )}
        >
          {checked ? <Check className="size-3" /> : null}
        </span>
      ) : null}
      {active && !selectMode ? (
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
          <bdi
            dir="auto"
            className={cn(
              "block min-w-0 flex-1 truncate text-start text-[13px] [unicode-bidi:plaintext]",
              chat.unread > 0 ? "font-semibold text-foreground" : "font-medium",
            )}
          >
            {chat.name}
          </bdi>
          <span
            className={cn(
              "shrink-0 text-2xs tabular-nums",
              chat.unread > 0 ? "font-medium text-primary" : "text-muted-foreground",
            )}
          >
            {relativeTime(chat.lastMessageAt, locale, relativeNow)}
          </span>
        </span>

        <span className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
          <bdi
            dir="auto"
            data-inbox-preview="true"
            className={cn(
              "block min-w-0 max-w-full flex-1 truncate text-start text-xs leading-5 [unicode-bidi:plaintext]",
              chat.unread > 0
                ? "font-medium text-foreground/90"
                : "text-muted-foreground",
            )}
          >
            {chat.lastMessageText || copy("savedHistory")}
          </bdi>

          {priority ? (
            <Flag
              className={cn(
                "size-3 shrink-0",
                priority === "urgent"
                  ? "text-destructive"
                  : priority === "high"
                    ? "text-warning"
                    : priority === "medium"
                      ? "text-primary"
                      : "text-muted-foreground",
              )}
              aria-label={t(`inbox.priority.${priority}`)}
            />
          ) : null}

          {chat.unread > 0 ? (
            <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold leading-5 tabular-nums text-primary-foreground">
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          ) : null}
        </span>

        {hasOperationalMeta ? (
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-2xs leading-4 text-muted-foreground">
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
  const {
    copy,
    t,
    locale,
    selectChat,
    loadingChats,
    canDeleteChats,
    deleteChats,
  } = workspace;
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<{
    query: string;
    loading: boolean;
    results: InboxChat[];
    error: boolean;
  }>({ query: "", loading: false, results: [], error: false });
  // Audit F9: a failed server search must surface as a retryable error row,
  // never silently as "no results" — the attempt counter re-arms the effect.
  const [searchAttempt, setSearchAttempt] = useState(0);
  // Audit F11: the queue's relative timestamps must tick instead of freezing
  // until the next socket event (same self-scheduling idea as the thread
  // header, one shared cadence for the whole queue).
  const [relativeNow, setRelativeNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setRelativeNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteShapeError, setDeleteShapeError] = useState<string | null>(null);

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
        error: false,
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
          error: false,
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSearchState({
            query: normalizedQuery,
            loading: false,
            results: [],
            error: true,
          });
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
  }, [copy, normalizedQuery, query, searchAttempt]);

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

  const selectableIds = useMemo(
    () => new Set(rows.map((chat) => chat.conversationId)),
    [rows],
  );
  const effectiveSelected = useMemo(
    () => [...selectedIds].filter((id) => selectableIds.has(id)),
    [selectableIds, selectedIds],
  );

  const toggleSelected = (conversationId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setDeleteError(null);
    setDeleteShapeError(null);
    setDeleteDialogOpen(false);
  };

  const performDelete = async () => {
    if (effectiveSelected.length === 0) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteShapeError(null);
    const outcome = await deleteChats([...effectiveSelected]);
    setDeleting(false);
    if (!outcome.ok) {
      // Truthful failure surfacing: the server's own rejection reason is
      // shown inside the open confirm dialog AND toasted, so a rejection is
      // never indistinguishable from a dead button (FD-050 campaign row B5;
      // round 2 additionally carries the server's human-readable error text
      // instead of only a bare status code).
      const message = outcome.errorDetail
        ? copy("deleteChatsFailedReason", {
            reason: outcome.errorDetail,
            code: outcome.errorCode ?? "HTTP_ERROR",
          })
        : outcome.errorCode
          ? copy("deleteChatsFailedWithCode", { code: outcome.errorCode })
          : copy("deleteChatsFailed");
      // Round 3: the PII-free shape verdict (schema paths / id lengths /
      // body size, or the local contract violation) — the installed runtime
      // has no reachable logs, so this line IS the diagnostic record.
      setDeleteShapeError(
        outcome.rejectionSummary
          ? copy("deleteChatsFailedShape", { shape: outcome.rejectionSummary })
          : null,
      );
      setDeleteError(message);
      toast.error(
        outcome.rejectionSummary
          ? `${message} ${copy("deleteChatsFailedShape", {
              shape: outcome.rejectionSummary,
            })}`
          : message,
      );
      return;
    }
    // Audit S3-20 (client half): name what resolved to nothing instead of a
    // bare success — the operator leaves the dialog knowing the queue state.
    if (outcome.notFoundIds && outcome.notFoundIds.length > 0) {
      toast.warning(
        copy("deleteChatsNotFound", { count: outcome.notFoundIds.length }),
      );
    }
    exitSelectMode();
  };

  const unreadEmpty =
    queueFilter === "unread" && queueCounts.unread === 0 && !normalizedQuery;

  return (
    <section
      id="inbox-conversation-queue"
      data-inbox-queue="true"
      aria-label={copy("workQueue")}
      className="flex min-h-0 w-full flex-1 flex-col bg-background md:flex-none"
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

        {selectMode ? (
          <div
            className="mt-2 flex flex-wrap items-center gap-1.5"
            data-inbox-select-toolbar="true"
          >
            <span className="min-w-0 flex-1 truncate text-2xs font-medium text-foreground">
              {copy("selectedCount", { count: effectiveSelected.length })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={deleting}
              data-inbox-chat-select-all="true"
              onClick={() => {
                const allSelected =
                  rows.length > 0 &&
                  effectiveSelected.length === rows.length;
                setSelectedIds(allSelected ? new Set() : new Set(selectableIds));
              }}
            >
              {copy("selectAll")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={effectiveSelected.length === 0 || deleting}
              data-inbox-chat-delete="true"
              onClick={() => setDeleteDialogOpen(true)}
            >
              {deleting ? (
                <Loader2
                  className="size-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              {copy("deleteChats")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copy("cancelSelection")}
              disabled={deleting}
              onClick={exitSelectMode}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
            {deleteError ? (
              <p className="w-full text-2xs text-destructive">{deleteError}</p>
            ) : null}
          </div>
        ) : (
          <>
        <div className="mt-2 flex items-center gap-1.5">
          <div
            className="flex min-w-0 flex-1 gap-1 rounded-full bg-muted/25 p-0.5"
            role="group"
            aria-label={copy("workQueue")}
          >
            {PRIMARY_QUEUES.map((filter) => {
              const selected = queueFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onQueueFilterChange(filter)}
                  className={cn(
                    "inline-flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-1.5 text-2xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="truncate">{queueLabel(filter, copy)}</span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      selected ? "text-primary" : "text-muted-foreground/75",
                    )}
                  >
                    {queueCounts[filter]}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-pressed={queueFilter === "unassigned"}
            aria-label={`${queueLabel("unassigned", copy)} · ${queueCounts.unassigned}`}
            title={`${queueLabel("unassigned", copy)} · ${queueCounts.unassigned}`}
            onClick={() => onQueueFilterChange("unassigned")}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              queueFilter === "unassigned"
                ? "border-primary/25 bg-primary/9 text-primary"
                : "border-border/65 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <UserMinus className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{queueCounts.unassigned}</span>
          </button>

          {canDeleteChats && chats.length > 0 ? (
            <button
              type="button"
              aria-label={copy("selectChats")}
              title={copy("selectChats")}
              data-inbox-chat-select-mode="true"
              onClick={() => {
                setSelectMode(true);
              }}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/65 bg-background text-muted-foreground outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ListChecks className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div
          className="mt-2 flex flex-wrap gap-1"
          role="group"
          aria-label={copy("status")}
        >
          {WORKFLOW_FILTERS.map((filter) => {
            const selected = workflowFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={selected}
                onClick={() => onWorkflowFilterChange(filter)}
                className={cn(
                  "inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-2xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary/25 bg-primary/9 text-primary"
                    : "border-border/65 bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {workflowLabel(filter, copy, t)}
              </button>
            );
          })}
        </div>
          </>
        )}
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
              <div className="border-b border-border/55 bg-muted/15 px-3 py-1.5 text-2xs text-muted-foreground">
                {copy("searchResults", { count: rows.length })}
              </div>
            ) : null}
            {normalizedQuery &&
            searchState.query === normalizedQuery &&
            searchState.error ? (
              <div className="flex items-center justify-between gap-2 border-b border-border/55 bg-destructive/8 px-3 py-2 text-2xs text-destructive">
                <span>{copy("searchFailed")}</span>
                <button
                  type="button"
                  onClick={() => setSearchAttempt((attempt) => attempt + 1)}
                  className="shrink-0 rounded-full border border-destructive/30 px-2 py-0.5 font-medium outline-none transition-colors hover:bg-destructive/12 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {copy("searchRetry")}
                </button>
              </div>
            ) : null}
            {rows.map((chat) => (
              <ConversationRow
                key={`${chat.conversationId}:${chat.id}`}
                chat={chat}
                active={
                  chat.conversationId === workspace.activeChat?.conversationId ||
                  chat.id === activeChatId
                }
                locale={locale}
                relativeNow={relativeNow}
                t={t}
                copy={copy}
                selectMode={selectMode}
                checked={selectedIds.has(chat.conversationId)}
                onSelect={() => openChat(chat)}
                onToggle={() => toggleSelected(chat.conversationId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (deleting) return;
          setDeleteDialogOpen(open);
          // deleteError is intentionally kept when the dialog closes: it
          // renders in the select toolbar so the failure stays visible after
          // the operator dismisses the confirm dialog.
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {copy("deleteChatsTitle", { count: effectiveSelected.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {copy("deleteChatsDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-[13px] text-destructive">
              {deleteError}
            </p>
          ) : null}
          {deleteShapeError ? (
            <p
              role="alert"
              className="break-all font-mono text-[11px] text-destructive/80"
            >
              {deleteShapeError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              disabled={deleting || effectiveSelected.length === 0}
              data-inbox-chat-delete-confirm="true"
              onClick={(event) => {
                event.preventDefault();
                void performDelete();
              }}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {copy("deleteChatsConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
