"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  Plug,
  Search,
  ShieldCheck,
  SquarePen,
} from "lucide-react";

import {
  AiSessionRenameRow,
  AiSessionRow,
  sessionStamp,
} from "@/components/ai/ai-session-row";
import {
  AiSidebarHeader,
  AiSidebarSearch,
  AiSidebarStatus,
  GROUP_ORDER,
  groupLabel,
  RailButton,
  sessionDateGroup,
  sessionSearchText,
  useModifierLabel,
  type SessionGroup,
} from "@/components/ai/ai-sidebar-nav";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useI18n } from "@/hooks/use-i18n";
import { getConnectedAgentsCopy } from "@/lib/i18n/connected-agents";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

/**
 * The Agents sidebar: identity and collapse control, the four places a seller
 * goes (new chat, search, approvals, connected agents), and the durable
 * conversation list grouped Pinned → Today → Yesterday → Previous 7 days →
 * Earlier. Collapsed, it becomes an icon rail that keeps every destination one
 * click away. A draft that was never sent is not history, so conversations
 * without a message stay out of the list unless they are the open one.
 */
export function AiWorkHistory({
  workspace,
  collapsed = false,
  navigationLocked,
  draftActive,
  approvalsCount,
  connectedOffered,
  connectedActive,
  connectedCount,
  onToggleCollapsed,
  onOpenSession,
  onNewChat,
  onOpenApprovals,
  onOpenConnected,
  header,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  collapsed?: boolean;
  navigationLocked: boolean;
  draftActive: boolean;
  approvalsCount: number;
  connectedOffered: boolean;
  connectedActive: boolean;
  connectedCount: number;
  onToggleCollapsed?: () => void;
  onOpenSession: (sessionId: string) => void;
  onNewChat: () => void;
  onOpenApprovals: () => void;
  onOpenConnected: () => void;
  /** Mobile replaces the collapse control with its own leading control. */
  header?: ReactNode;
}) {
  const { t } = useI18n();
  const modifier = useModifierLabel();
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
  } = workspace;
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(
    null,
  );
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [confirmResetTimer, setConfirmResetTimer] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Disarm a pending two-step delete when its row unmounts or re-arms.
  useEffect(() => {
    if (confirmResetTimer === null) return;
    return () => window.clearTimeout(confirmResetTimer);
  }, [confirmResetTimer]);

  useEffect(() => {
    if (searchOpen && !collapsed) searchRef.current?.focus();
  }, [searchOpen, collapsed]);

  const clearConfirmTimer = () => {
    if (confirmResetTimer !== null) window.clearTimeout(confirmResetTimer);
    setConfirmResetTimer(null);
  };

  const reviewCount = proposals.filter((entry) => {
    const state = entry.proposal.executionState ?? entry.proposal.status;
    return ["pending", "approved", "failed", "conflict"].includes(state);
  }).length;

  const listed = useMemo(
    () =>
      sessions.filter(
        (session) =>
          session.id === activeSessionId ||
          session.messages === undefined ||
          session.messages.length > 0,
      ),
    [activeSessionId, sessions],
  );

  // Ledger AI-09: client-side search over the title and the latest turn.
  const normalizedHistoryQuery = historyQuery.trim().toLowerCase();
  const visibleSessions = useMemo(() => {
    if (!normalizedHistoryQuery) return listed;
    return listed.filter((session) =>
      sessionSearchText(session).includes(normalizedHistoryQuery),
    );
  }, [listed, normalizedHistoryQuery]);

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

  const openSearch = () => {
    if (collapsed) onToggleCollapsed?.();
    setSearchOpen(true);
  };

  const closeSearch = () => {
    setHistoryQuery("");
    setSearchOpen(false);
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
      data-ai-rail={collapsed ? "collapsed" : "expanded"}
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

      <AiSidebarHeader
        collapsed={collapsed}
        title={getAiDecisionCopy(locale, "agentName")}
        toggleLabel={getAiDecisionCopy(locale, collapsed ? "openSidebar" : "closeSidebar")}
        shortcut={`${modifier}+Shift+S`}
        onToggle={onToggleCollapsed}
      >
        {header}
      </AiSidebarHeader>

      <nav
        aria-label={getAiDecisionCopy(locale, "agentName")}
        className={cn("space-y-0.5 pb-2", collapsed ? "px-2" : "px-2")}
      >
        <RailButton
          icon={SquarePen}
          label={getAiDecisionCopy(locale, "newChat")}
          hint={`${modifier} ⇧ O`}
          active={draftActive}
          collapsed={collapsed}
          disabled={loadingSessions || creatingSession || sending}
          onClick={onNewChat}
          dataAttr={{ "data-ai-new-chat": "true" }}
        />
        {searchOpen && !collapsed ? (
          <AiSidebarSearch
            inputRef={searchRef}
            value={historyQuery}
            placeholder={getAiDecisionCopy(locale, "searchChats")}
            closeLabel={workspace.copy("close")}
            onChange={setHistoryQuery}
            onClose={closeSearch}
          />
        ) : (
          <RailButton
            icon={Search}
            label={getAiDecisionCopy(locale, "searchChats")}
            collapsed={collapsed}
            onClick={openSearch}
          />
        )}
        <RailButton
          icon={ShieldCheck}
          label={getAiDecisionCopy(locale, "approvals")}
          badge={approvalsCount}
          collapsed={collapsed}
          onClick={onOpenApprovals}
          dataAttr={{ "data-ai-rail-approvals": "true" }}
        />
        {connectedOffered ? (
          <RailButton
            icon={Plug}
            label={getConnectedAgentsCopy(locale, "railTitle")}
            active={connectedActive}
            count={connectedCount}
            collapsed={collapsed}
            onClick={onOpenConnected}
            dataAttr={{ "data-connected-agents-entry": "true" }}
          />
        ) : null}
      </nav>

      {!collapsed ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-2 pb-4 pt-2">
            {loadingSessions ? (
              // Structure-matching skeleton rows (§26.8) — no bare spinner.
              <div data-ai-history-skeleton="true" aria-hidden="true" className="space-y-1 px-1">
                {[0, 1, 2, 3, 4].map((row) => (
                  <div key={row} className="px-2 py-2.5">
                    <span data-ai-skeleton="true" className="block h-3.5 w-3/4 rounded-full" />
                  </div>
                ))}
              </div>
            ) : listed.length === 0 ? (
              <p className="px-3 py-6 text-caption text-muted-foreground">
                {getAiDecisionCopy(locale, "noChatsYet")}
              </p>
            ) : (
              grouped.map(({ group, entries }) => (
                <section key={group} aria-label={groupLabel(group, workspace)}>
                  <p className="px-2.5 pb-1 text-caption font-medium text-muted-foreground">
                    {groupLabel(group, workspace)}
                  </p>
                  <div className="space-y-px">
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
                      const active = session.id === activeSessionId && !connectedActive;
                      return (
                        <AiSessionRow
                          key={session.id}
                          locale={locale}
                          session={{
                            id: session.id,
                            title: session.title || workspace.copy("newSessionTitle"),
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
            {!loadingSessions && listed.length > 0 && visibleSessions.length === 0 ? (
              <p className="px-3 py-6 text-center text-caption text-muted-foreground">
                {getAiDecisionCopy(locale, "historyNoMatches")}
              </p>
            ) : null}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1" />
      )}

      <AiSidebarStatus
        collapsed={collapsed}
        setup={setup}
        statusLabel={getAiDecisionCopy(locale, statusKey)}
        setupLabel={getAiDecisionCopy(locale, "setupBannerAction")}
      />
    </aside>
  );
}
