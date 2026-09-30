"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus, Search, Sparkles, X } from "lucide-react";

import {
  AiSessionRenameRow,
  AiSessionRow,
  sessionStamp,
} from "@/components/ai/ai-session-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import { parseMcpRequestLine } from "@/lib/ai/mcp-request-line";
import { getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import { getConnectedAgentsCopy } from "@/lib/i18n/connected-agents";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

type SessionGroup = "pinned" | "today" | "yesterday" | "week" | "earlier";

const GROUP_ORDER: readonly SessionGroup[] = [
  "pinned",
  "today",
  "yesterday",
  "week",
  "earlier",
];

function sessionDateGroup(value: string): Exclude<SessionGroup, "pinned"> {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "earlier";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 7);
  if (date >= startToday) return "today";
  if (date >= startYesterday) return "yesterday";
  if (date >= startWeek) return "week";
  return "earlier";
}

function groupLabel(
  group: SessionGroup,
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  switch (group) {
    case "pinned":
      return getAiDecisionCopy(workspace.locale, "pinnedGroup");
    case "today":
      return workspace.copy("today");
    case "yesterday":
      return workspace.copy("yesterday");
    case "week":
      return getAiDecisionCopy(workspace.locale, "lastWeek");
    default:
      return getAiDecisionCopy(workspace.locale, "earlier");
  }
}

function sessionPreview(session: {
  messages?: Array<{ content?: string | null } | null> | null;
}): string {
  const msgs = session.messages ?? [];
  for (let index = msgs.length - 1; index >= 0; index -= 1) {
    const content = msgs[index]?.content?.trim();
    if (content) return content;
  }
  return "";
}

/**
 * UI-05 — the title comes from the FIRST message and the preview from the
 * LATEST. In a one-question session those are the same text, so the row would
 * print the prompt twice. Comparing on the title's body (the ellipsis is a
 * rendering artefact) catches that without hiding a genuine reply.
 */
function previewRepeatsTitle(title: string, preview: string): boolean {
  if (!title || !preview) return false;
  const normalize = (value: string) => value.replace(/\s+/gu, " ").trim();
  const body = normalize(title).replace(/…$/u, "");
  if (!body) return false;
  return normalize(preview).startsWith(body);
}

function previewPlainText(value: string): string {
  return value.replace(/[*_#>`]+/gu, " ").replace(/\s+/gu, " ").trim();
}

/**
 * The Agents rail: agent identity, a new-conversation action, search, and the
 * durable conversation list grouped Pinned → Today → Yesterday → Previous 7
 * days → Earlier. Flat hairline surface; selection is a neutral fill, not a
 * gradient card, so the canvas stays the loudest thing on the page.
 */
export function AiWorkHistory({
  workspace,
  navigationLocked,
  onOpenSession,
  onNewAnalysis,
  footer,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  navigationLocked: boolean;
  onOpenSession: (sessionId: string) => void;
  onNewAnalysis: () => void;
  /** Pinned entry below the history (the Connected agents surface). */
  footer?: ReactNode;
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
    setup,
    renamingSessionId,
    deletingSessionId,
    pinningSessionId,
    renameSession,
    pinSession,
    deleteSession,
    inbox,
  } = workspace;
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(
    null,
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [confirmResetTimer, setConfirmResetTimer] = useState<number | null>(null);

  // Disarm a pending two-step delete when its row unmounts or re-arms.
  useEffect(() => {
    if (confirmResetTimer === null) return;
    return () => window.clearTimeout(confirmResetTimer);
  }, [confirmResetTimer]);

  const clearConfirmTimer = () => {
    if (confirmResetTimer !== null) window.clearTimeout(confirmResetTimer);
    setConfirmResetTimer(null);
  };

  const reviewCount = proposals.filter((entry) => {
    const state = entry.proposal.executionState ?? entry.proposal.status;
    return ["pending", "approved", "failed", "conflict"].includes(state);
  }).length;

  // Ledger AI-09: client-side session search over title + latest preview.
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const visibleSessions = useMemo(() => {
    if (!normalizedHistoryQuery) return sessions;
    return sessions.filter((session) =>
      ((session.title ?? "") + " " + sessionPreview(session))
        .toLowerCase()
        .includes(normalizedHistoryQuery),
    );
  }, [sessions, normalizedHistoryQuery]);

  const grouped = useMemo(() => {
    const buckets = new Map<SessionGroup, typeof visibleSessions>();
    for (const session of visibleSessions) {
      const group: SessionGroup = session.pinnedAt
        ? "pinned"
        : sessionDateGroup(session.updatedAt);
      buckets.set(group, [...(buckets.get(group) ?? []), session]);
    }
    return GROUP_ORDER.flatMap((group) => {
      const entries = buckets.get(group);
      return entries?.length ? [{ group, entries }] : [];
    });
  }, [visibleSessions]);

  const rowActionsLocked =
    navigationLocked ||
    sending ||
    renamingSessionId !== null ||
    deletingSessionId !== null ||
    pinningSessionId !== null;

  const saveRename = async () => {
    if (!renaming) return;
    const trimmed = renaming.value.trim();
    if (!trimmed) return;
    const ok = await renameSession(renaming.id, trimmed);
    if (ok) setRenaming(null);
    else toast.error(t("ai.history.renameFailed"));
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
    if (!ok) toast.error(t("ai.history.deleteFailed"));
  };

  const togglePin = async (sessionId: string, pinned: boolean) => {
    const ok = await pinSession(sessionId, pinned);
    if (!ok) toast.error(getAiDecisionCopy(locale, "pinFailed"));
  };

  const statusKey = !setup
    ? "statusChecking"
    : setup.ready
      ? sending
        ? "statusWorking"
        : "statusReady"
      : "statusSetup";

  return (
    <aside
      data-ai-work-history="true"
      className="flex h-full min-h-0 w-full flex-col border-e bg-sidebar"
    >
      {/* Ledger AI-23 residual: the two-step delete announces itself to
          assistive tech the moment it arms. */}
      <p role="status" aria-live="polite" className="sr-only">
        {confirmDeleteId
          ? getAiDecisionCopy(locale, "deleteArmAnnounce", {
              title:
                sessions.find((session) => session.id === confirmDeleteId)
                  ?.title || workspace.copy("newSessionTitle"),
            })
          : ""}
      </p>

      <div className="space-y-3 px-3 pb-3 pt-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            data-ai-agent-mark="true"
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-surface bg-primary-soft text-primary"
          >
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-title-3">
              {getAiDecisionCopy(locale, "agentName")}
            </h2>
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <span
                data-ai-status-dot={
                  !setup ? undefined : setup.ready ? "ready" : "attention"
                }
                aria-hidden="true"
                className={cn("size-1.5 rounded-full", !setup && "bg-muted-foreground")}
              />
              {getAiDecisionCopy(locale, statusKey)}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2 bg-card"
          disabled={loadingSessions || creatingSession || sending}
          onClick={onNewAnalysis}
        >
          {creatingSession ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <MessageSquarePlus className="size-4" aria-hidden="true" />
          )}
          {getAiDecisionCopy(locale, "newChat")}
        </Button>

        {sessions.length > 0 ? (
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder={getAiDecisionCopy(locale, "historySearch")}
              aria-label={getAiDecisionCopy(locale, "historySearch")}
              className="h-8 border-transparent bg-muted/50 ps-8 pe-8 text-body-sm shadow-none focus-visible:border-border"
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

        {(inbox?.length ?? 0) > 0 ? (
          <p
            data-ai-work-rail-pulse="true"
            className="flex items-center gap-2 rounded-control bg-warning-subtle px-2.5 py-1.5 text-caption font-medium text-warning"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {getAiDecisionCopy(locale, "inboxStripCount", {
                count: inbox?.length ?? 0,
              })}
            </span>
          </p>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t border-sidebar-border">
        <div className="space-y-4 px-2 py-3">
          {loadingSessions ? (
            // Structure-matching skeleton rows (§26.8) — no bare spinner.
            <div data-ai-history-skeleton="true" aria-hidden="true" className="space-y-1 px-1">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="rounded-control px-2.5 py-2">
                  <span data-ai-skeleton="true" className="block h-3.5 w-3/4 rounded-full" />
                  <span data-ai-skeleton="true" className="mt-2 block h-2.5 w-1/2 rounded-full" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-body-sm font-medium">{workspace.copy("noSessions")}</p>
              <p className="mt-1 text-caption text-muted-foreground">
                {workspace.copy("noSessionsDescription")}
              </p>
            </div>
          ) : (
            grouped.map(({ group, entries }) => (
              <section key={group} aria-label={groupLabel(group, workspace)}>
                <p className="px-2.5 pb-1 text-caption font-medium text-muted-foreground">
                  {groupLabel(group, workspace)}
                </p>
                <div className="space-y-0.5">
                  {entries.map((session) => {
                    if (renaming?.id === session.id) {
                      return (
                        <AiSessionRenameRow
                          key={session.id}
                          value={renaming.value}
                          saving={renamingSessionId === session.id}
                          onChange={(value) => setRenaming({ id: session.id, value })}
                          onSave={() => void saveRename()}
                          onCancel={() => setRenaming(null)}
                        />
                      );
                    }
                    const title = session.title || workspace.copy("newSessionTitle");
                    const latest = sessionPreview(session);
                    const agentRequest = parseMcpRequestLine(latest);
                    const rawPreview = agentRequest
                      ? getConnectedAgentsCopy(locale, "agentRequest", {
                          tool: getAiToolLabel(locale, agentRequest.tool),
                        })
                      : previewPlainText(latest);
                    const active = session.id === activeSessionId;
                    return (
                      <AiSessionRow
                        key={session.id}
                        locale={locale}
                        session={{
                          id: session.id,
                          title,
                          preview: previewRepeatsTitle(session.title ?? "", rawPreview)
                            ? ""
                            : rawPreview,
                          stamp: sessionStamp(session.updatedAt, locale),
                          pinned: Boolean(session.pinnedAt),
                          active,
                          reviewCount: active ? reviewCount : 0,
                        }}
                        navigationLocked={navigationLocked}
                        actionsLocked={rowActionsLocked}
                        busy={
                          renamingSessionId === session.id ||
                          deletingSessionId === session.id
                        }
                        deleteArmed={confirmDeleteId === session.id}
                        onOpen={() => onOpenSession(session.id)}
                        onRename={() =>
                          setRenaming({ id: session.id, value: session.title ?? "" })
                        }
                        onTogglePin={() => void togglePin(session.id, !session.pinnedAt)}
                        onArmDelete={() => armDelete(session.id)}
                        onConfirmDelete={() => void performDelete(session.id)}
                        onCancelDelete={() => {
                          clearConfirmTimer();
                          setConfirmDeleteId(null);
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          )}
          {!loadingSessions && sessions.length > 0 && visibleSessions.length === 0 ? (
            <p className="px-3 py-6 text-center text-caption text-muted-foreground">
              {getAiDecisionCopy(locale, "historyNoMatches")}
            </p>
          ) : null}
        </div>
      </ScrollArea>
      {footer}
    </aside>
  );
}
