"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bot,
  Check,
  Loader2,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import {
  getAiDecisionCopy,
  type AiDecisionLocale,
} from "@/lib/i18n/ai-decision-workspace";
import { getAiToolGroupLabel } from "@/lib/i18n/ai-tool-labels";
import { cn, DZ_CLOCK, intlLocale } from "@/lib/utils";

function sessionDateGroup(value: string): "today" | "yesterday" | "earlier" {
  const date = new Date(value);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return "earlier";

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  if (date >= startToday) return "today";
  if (date >= startYesterday) return "yesterday";
  return "earlier";
}

function sessionStamp(value: string, locale: AiDecisionLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  // `en-DZ` here resolved English to a US-style 12-hour clock; the canonical
  // map resolves it to `en-GB`, and DZ_CLOCK pins 24-hour for every language.
  const tag = intlLocale(locale);
  // Today and yesterday keep the clock (the group label owns the day);
  // anything older would lie with a bare HH:mm — it shows a short date.
  if (date >= startYesterday) {
    return new Intl.DateTimeFormat(tag, {
      hour: "2-digit",
      minute: "2-digit",
      ...DZ_CLOCK,
    }).format(date);
  }
  return new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "short",
  }).format(date);
}

function groupLabel(
  group: "today" | "yesterday" | "earlier",
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  if (group === "today") return workspace.copy("today");
  if (group === "yesterday") return workspace.copy("yesterday");
  return getAiDecisionCopy(workspace.locale, "earlier");
}

function sessionPreview(session: { messages?: Array<{ content?: string | null } | null> | null }): string {
  const msgs = session.messages ?? [];
  for (let index = msgs.length - 1; index >= 0; index -= 1) {
    const content = msgs[index]?.content?.trim();
    if (content) return content;
  }
  return "";
}

/**
 * UI-05 — the title is derived from the session's FIRST message and the preview
 * shows its LATEST one. In a session that has only been asked one question those
 * are the same message, so the card printed the seller's prompt twice: once
 * clipped as a title, once again as a two-line excerpt directly beneath it.
 *
 * Comparing on the title's body (the ellipsis is a rendering artefact, not
 * content) catches that case without hiding a genuine reply, which is what the
 * preview line is actually for.
 */
function previewRepeatsTitle(title: string, preview: string): boolean {
  if (!title || !preview) return false;
  const normalize = (value: string) => value.replace(/\s+/gu, " ").trim();
  const body = normalize(title).replace(/…$/u, "");
  if (!body) return false;
  return normalize(preview).startsWith(body);
}

export function AiWorkHistory({
  workspace,
  navigationLocked,
  onOpenSession,
  onNewAnalysis,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  navigationLocked: boolean;
  onOpenSession: (sessionId: string) => void;
  onNewAnalysis: () => void;
}) {
  const { t } = useI18n();
  const {
    sessions,
    activeSessionId,
    loadingSessions,
    creatingSession,
    sending,
    proposals,
    locale,
    renamingSessionId,
    deletingSessionId,
    renameSession,
    deleteSession,
    capabilities,
    inbox,
  } = workspace as ReturnType<typeof useAiWorkspace> & {
    capabilities?: {
      briefing?: {
        pendingOrders?: number | null;
        ordersToday?: number | null;
        lowStockProducts?: number | null;
        pendingDeliveries?: number | null;
        pendingProposals?: number | null;
      } | null;
      groups?: Array<{
        id: "orders" | "customers" | "products" | "delivery" | "insights" | "conversations";
        tools: Array<{ name: string; executionClass: string }>;
      }>;
    } | null;
    inbox?: Array<unknown>;
  };
  const [renaming, setRenaming] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [confirmResetTimer, setConfirmResetTimer] = useState<number | null>(
    null,
  );

  // Disarm a pending two-step delete when its row unmounts or re-arms.
  useEffect(() => {
    if (confirmResetTimer === null) return;
    return () => window.clearTimeout(confirmResetTimer);
  }, [confirmResetTimer]);

  const clearConfirmTimer = () => {
    if (confirmResetTimer !== null) {
      window.clearTimeout(confirmResetTimer);
    }
    setConfirmResetTimer(null);
  };

  const reviewCount = proposals.filter((entry) => {
    const state = entry.proposal.executionState ?? entry.proposal.status;
    return ["pending", "approved", "failed", "conflict"].includes(state);
  }).length;
  const groups = ["today", "yesterday", "earlier"] as const;
  // Ledger AI-09: client-side session search over title + latest preview.
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const visibleSessions = useMemo(() => {
    if (!normalizedHistoryQuery) return sessions;
    return sessions.filter((session) =>
      ((session.title ?? "") + " " + sessionPreview(session)).toLowerCase().includes(normalizedHistoryQuery),
    );
  }, [sessions, normalizedHistoryQuery]);
  const rowActionsLocked =
    navigationLocked ||
    sending ||
    renamingSessionId !== null ||
    deletingSessionId !== null;

  const saveRename = async () => {
    if (!renaming) return;
    const { id, value } = renaming;
    const trimmed = value.trim();
    if (!trimmed) return;
    const ok = await renameSession(id, trimmed);
    if (ok) {
      setRenaming(null);
    } else {
      toast.error(t("ai.history.renameFailed"));
    }
  };

  const armDelete = (sessionId: string) => {
    clearConfirmTimer();
    setConfirmDeleteId(sessionId);
    // Two-step confirm: the armed state disarms itself after a short pause.
    setConfirmResetTimer(
      window.setTimeout(() => {
        setConfirmDeleteId(null);
        setConfirmResetTimer(null);
      }, 4000),
    );
  };

  const performDelete = async (sessionId: string) => {
    clearConfirmTimer();
    setConfirmDeleteId(null);
    const ok = await deleteSession(sessionId);
    if (!ok) {
      toast.error(t("ai.history.deleteFailed"));
    }
  };

  return (
    <aside
      data-ai-work-history="true"
      className="flex h-full min-h-0 w-full flex-col border-e bg-muted/[0.035]"
    >
      {/* Ledger AI-23 residual: the two-step delete announces itself to
          assistive tech the moment it arms (visual arm state was already
          shown; the a11y arm state was missing). */}
      <p role="status" aria-live="polite" className="sr-only">
        {confirmDeleteId
          ? getAiDecisionCopy(
              locale,
              "deleteArmAnnounce",
              {
                title:
                  sessions.find((session) => session.id === confirmDeleteId)?.title ||
                  workspace.copy("newSessionTitle"),
              },
            )
          : ""}
      </p>
      <div className="flex flex-col gap-2.5 border-b px-3.5 pb-3 pt-4">
        <div>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              {getAiDecisionCopy(locale, "workHistory")}
            </h2>
            {sessions.length > 0 ? (
              <Badge
                variant="secondary"
                className="shrink-0 rounded-full px-2 text-caption font-semibold tabular-nums text-muted-foreground"
              >
                <span className="sr-only">
                  {`${workspace.copy("sessions")}: `}
                </span>
                {sessions.length}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-caption leading-4 text-muted-foreground">
            {getAiDecisionCopy(locale, "workHistoryDescription")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 justify-center"
            disabled={loadingSessions || creatingSession || sending}
            onClick={onNewAnalysis}
          >
            {creatingSession ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            {getAiDecisionCopy(locale, "newAnalysis")}
          </Button>
          {sending ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={workspace.copy("stop")}
              title={workspace.copy("stop")}
              onClick={() => workspace.stop()}
            >
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        {sessions.length > 0 ? (
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder={getAiDecisionCopy(locale, "historySearch")}
              aria-label={getAiDecisionCopy(locale, "historySearch")}
              className="h-8 rounded-full border-border/65 bg-background/60 ps-8 pe-8 text-[13px]"
            />
            {historyQuery ? (
              <button
                type="button"
                aria-label={workspace.copy("close")}
                title={workspace.copy("close")}
                onClick={() => setHistoryQuery("")}
                className="absolute end-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Work rail pulse — the shop's live present state above the session
          list. Every count is independently nullable: unmeasured renders
          nothing, never a fabricated zero. Workforce groups reuse the same
          capability truth the canvas AbilitiesPanel renders. */}
      {capabilities?.briefing || (capabilities?.groups?.length ?? 0) > 0 || (inbox?.length ?? 0) > 0 ? (
        <div data-ai-work-rail-pulse="true" className="border-b px-3.5 py-3">
          {capabilities?.briefing ? (
            <div className="grid grid-cols-3 gap-1.5">
              {capabilities.briefing.pendingOrders != null ? (
                <div className="rounded-surface border border-border/60 bg-card/70 px-2 py-1.5 text-center">
                  <p className="text-sm font-bold tabular-nums leading-5">{capabilities.briefing.pendingOrders}</p>
                  <p className="mt-0.5 truncate text-caption text-muted-foreground">
                    {getAiDecisionCopy(locale, "starterCountPending", { count: "" }).replace(/\s*\d*\s*$/, "").trim() || "—"}
                  </p>
                </div>
              ) : null}
              {capabilities.briefing.ordersToday != null ? (
                <div className="rounded-surface border border-border/60 bg-card/70 px-2 py-1.5 text-center">
                  <p className="text-sm font-bold tabular-nums leading-5">{capabilities.briefing.ordersToday}</p>
                  <p className="mt-0.5 truncate text-caption text-muted-foreground">
                    {getAiDecisionCopy(locale, "starterCountToday", { count: "" }).replace(/\s*\d*\s*$/, "").trim() || "—"}
                  </p>
                </div>
              ) : null}
              {capabilities.briefing.lowStockProducts != null ? (
                <div className="rounded-surface border border-border/60 bg-card/70 px-2 py-1.5 text-center">
                  <p className="text-sm font-bold tabular-nums leading-5">{capabilities.briefing.lowStockProducts}</p>
                  <p className="mt-0.5 truncate text-caption text-muted-foreground">
                    {getAiDecisionCopy(locale, "starterCountLowStock", { count: "" }).replace(/\s*\d*\s*$/, "").trim() || "—"}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {(inbox?.length ?? 0) > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-caption font-semibold text-warning">
              <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
              {getAiDecisionCopy(locale, "inboxStripCount", { count: inbox?.length ?? 0 })}
            </p>
          ) : null}
          {(capabilities?.groups?.length ?? 0) > 0 ? (
            <ul className="mt-2 space-y-1" aria-label={getAiDecisionCopy(locale, "abilitiesTitle")}>
              {(capabilities?.groups ?? []).map((group) => {
                const sensitive = group.tools.filter((tool) => tool.executionClass === "sensitive").length;
                return (
                  <li
                    key={group.id}
                    className="flex items-center justify-between gap-2 rounded-control px-1.5 py-1 text-caption text-muted-foreground"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          sensitive > 0 ? "bg-warning" : "bg-success",
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate font-medium text-foreground/80">
                        {getAiToolGroupLabel(locale, group.id)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {group.tools.length}
                      {sensitive > 0 ? ` · ${sensitive} ✓` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-2.5 py-3">
          {loadingSessions ? (
            // Structure-matching skeleton rows (§26.8) — no bare spinner.
            <div data-ai-history-skeleton="true" aria-hidden="true" className="space-y-2 px-1 pt-1">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="rounded-surface p-2.5">
                  <span data-ai-skeleton="true" className="block h-3.5 w-3/4 rounded-full" />
                  <span data-ai-skeleton="true" className="mt-2 block h-2.5 w-1/2 rounded-full" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <span className="mx-auto flex size-11 items-center justify-center rounded-surface border border-border/60 bg-card text-muted-foreground shadow-sm">
                <Bot className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold">{workspace.copy("noSessions")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {workspace.copy("noSessionsDescription")}
              </p>
            </div>
          ) : (
            groups.map((group) => {
              const groupedSessions = visibleSessions.filter(
                (session) => sessionDateGroup(session.updatedAt) === group,
              );
              if (groupedSessions.length === 0) return null;
              return (
                <section key={group} aria-label={groupLabel(group, workspace)}>
                  <p className="sticky top-0 z-10 bg-card/85 px-2 py-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                    {groupLabel(group, workspace)}
                  </p>
                  <div className="space-y-1">
                    {groupedSessions.map((session) => {
                      const active = session.id === activeSessionId;
                      const sessionTitle =
                        session.title || workspace.copy("newSessionTitle");
                      const rawPreview = sessionPreview(session);
                      const preview = previewRepeatsTitle(
                        session.title ?? "",
                        rawPreview,
                      )
                        ? ""
                        : rawPreview;
                      const renamingThis = renaming?.id === session.id;
                      const deleteArmed = confirmDeleteId === session.id;
                      const busy =
                        renamingSessionId === session.id ||
                        deletingSessionId === session.id;
                      if (renamingThis && renaming) {
                        return (
                          <div
                            key={session.id}
                            data-ai-session-rename="true"
                            className="flex items-center gap-1 rounded-surface border border-primary/20 bg-card px-1.5 py-1 shadow-sm"
                          >
                            <Input
                              value={renaming.value}
                              autoFocus
                              dir="auto"
                              maxLength={160}
                              aria-label={t("ai.history.rename")}
                              onChange={(event) =>
                                setRenaming({
                                  id: session.id,
                                  value: event.target.value,
                                })
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void saveRename();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setRenaming(null);
                                }
                              }}
                              className="h-8 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0"
                              aria-label={t("ai.history.renameSave")}
                              disabled={
                                !renaming.value.trim() ||
                                renamingSessionId === session.id
                              }
                              onClick={() => void saveRename()}
                            >
                              {renamingSessionId === session.id ? (
                                <Loader2
                                  className="size-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Check className="size-3.5" aria-hidden="true" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0"
                              aria-label={t("ai.history.renameCancel")}
                              disabled={renamingSessionId === session.id}
                              onClick={() => setRenaming(null)}
                            >
                              <X className="size-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={session.id}
                          className="group relative rounded-surface"
                        >
                          <button
                            type="button"
                            data-ai-session={session.id}
                            aria-current={active ? "page" : undefined}
                            disabled={navigationLocked}
                            onClick={() => onOpenSession(session.id)}
                            className={cn(
                              "w-full rounded-surface border border-transparent px-3 py-2.5 text-start transition-colors",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              "disabled:cursor-not-allowed disabled:opacity-50",
                              active
                                ? "border-primary/15 bg-primary-soft"
                                : "hover:bg-muted/55",
                              deleteArmed &&
                                "border-destructive/30 bg-destructive-subtle",
                            )}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="min-w-0 flex-1 pe-12">
                                <span
                                  className={cn(
                                    "block truncate text-sm text-foreground",
                                    active ? "font-semibold" : "font-medium",
                                  )}
                                >
                                  {sessionTitle}
                                </span>
                                {preview ? (
                                  <span
                                    dir="auto"
                                    className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground"
                                  >
                                    {preview}
                                  </span>
                                ) : null}
                              </span>
                              {active && reviewCount > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 rounded-full border-primary/25 bg-primary-soft px-2 text-caption font-semibold tabular-nums text-primary"
                                >
                                  <span className="sr-only">
                                    {`${getAiDecisionCopy(locale, "needsReview")}: `}
                                  </span>
                                  {reviewCount}
                                </Badge>
                              ) : null}
                            </span>
                            <span className="mt-1.5 block text-caption tabular-nums text-muted-foreground">
                              {sessionStamp(session.updatedAt, locale)}
                            </span>
                          </button>

                          {!busy ? (
                            <div
                              className={cn(
                                "absolute end-1 top-1.5 flex items-center gap-0.5 rounded-control border border-border/60 bg-background/90 p-0.5 shadow-sm backdrop-blur-sm transition-opacity",
                                "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-within:opacity-100",
                                (active || deleteArmed) && "md:opacity-100",
                                deleteArmed && "border-destructive/30 bg-destructive-soft",
                              )}
                            >
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-6"
                                aria-label={t("ai.history.rename")}
                                title={t("ai.history.rename")}
                                disabled={rowActionsLocked}
                                onClick={() =>
                                  setRenaming({
                                    id: session.id,
                                    value: session.title ?? "",
                                  })
                                }
                              >
                                <Pencil className="size-3" aria-hidden="true" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className={cn(
                                  "size-6",
                                  deleteArmed &&
                                    "text-destructive hover:bg-destructive-soft hover:text-destructive",
                                )}
                                data-ai-session-delete={session.id}
                                aria-label={
                                  deleteArmed
                                    ? t("ai.history.deleteConfirm")
                                    : t("ai.history.delete")
                                }
                                title={
                                  deleteArmed
                                    ? t("ai.history.deleteConfirm")
                                    : t("ai.history.delete")
                                }
                                disabled={rowActionsLocked}
                                onClick={() =>
                                  deleteArmed
                                    ? void performDelete(session.id)
                                    : armDelete(session.id)
                                }
                              >
                                <Trash2 className="size-3" aria-hidden="true" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
          {!loadingSessions &&
          sessions.length > 0 &&
          visibleSessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <span className="mx-auto flex size-9 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
                <Search className="size-4" aria-hidden="true" />
              </span>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {getAiDecisionCopy(locale, "historyNoMatches")}
              </p>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}
