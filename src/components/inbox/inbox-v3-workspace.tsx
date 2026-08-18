"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DeskQueueFilter,
  InboxAuthorityView,
  WorkflowFilter,
} from "@/components/inbox/inbox-desk-types";
import { InboxV3Header } from "@/components/inbox/inbox-v3-header";
import { InboxV3Queue } from "@/components/inbox/inbox-v3-queue";
import { InboxV3Thread } from "@/components/inbox/inbox-v3-thread";
import styles from "@/components/inbox/inbox-v3-workspace.module.css";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { useMobile } from "@/hooks/use-mobile";

export function InboxV3Workspace({
  canViewIngress,
  canRetryIngress,
}: {
  canViewIngress: boolean;
  canRetryIngress: boolean;
}) {
  const workspace = useInboxWorkspace();
  const isMobile = useMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("conversation");
  const {
    chats,
    loadingChats,
    activeChat,
    activeChatId,
    selectChat,
    clearActiveChat,
    messages,
    logoutConfirmOpen,
    setLogoutConfirmOpen,
    disconnectWhatsApp,
    t,
  } = workspace;

  const [authority, setAuthority] = useState<InboxAuthorityView | null>(null);
  const [queueFilter, setQueueFilter] = useState<DeskQueueFilter>("all");
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("all");
  const [candidateByConversation, setCandidateByConversation] = useState<
    Record<string, string>
  >({});
  const [defaultQueueResolved, setDefaultQueueResolved] = useState(false);
  const [returningToQueue, setReturningToQueue] = useState(false);
  const queueTouchedRef = useRef(false);
  const desktopPrimedRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/inbox/authority", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        setAuthority((await response.json()) as InboxAuthorityView);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setAuthority(null);
        }
      }
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (defaultQueueResolved || loadingChats || !authority) return;

    const timer = window.setTimeout(() => {
      if (!queueTouchedRef.current) {
        const currentMemberId = authority.currentMemberId;
        const hasMine = Boolean(
          currentMemberId &&
            chats.some((chat) => chat.workflow.assigneeId === currentMemberId),
        );
        const hasUnassigned = chats.some((chat) => !chat.workflow.assigneeId);
        setQueueFilter(hasMine ? "mine" : hasUnassigned ? "unassigned" : "all");
      }
      setDefaultQueueResolved(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authority, chats, defaultQueueResolved, loadingChats]);

  const visibleQueueChats = useMemo(() => {
    return chats.filter((chat) => {
      const queueMatches =
        queueFilter === "all" ||
        (queueFilter === "unread" && chat.unread > 0) ||
        (queueFilter === "unassigned" && !chat.workflow.assigneeId) ||
        (queueFilter === "mine" &&
          Boolean(authority?.currentMemberId) &&
          chat.workflow.assigneeId === authority?.currentMemberId);
      if (!queueMatches) return false;
      const status = chat.workflow.status ?? "open";
      return workflowFilter === "all" || status === workflowFilter;
    });
  }, [authority?.currentMemberId, chats, queueFilter, workflowFilter]);

  useEffect(() => {
    if (
      !defaultQueueResolved ||
      isMobile ||
      loadingChats ||
      activeChat ||
      requestedConversationId
    ) {
      return;
    }
    const first = visibleQueueChats[0];
    if (!first) return;
    const fingerprint = `${first.conversationId}:${queueFilter}:${workflowFilter}`;
    if (desktopPrimedRef.current === fingerprint) return;
    desktopPrimedRef.current = fingerprint;
    const timer = window.setTimeout(() => {
      selectChat(first);
      router.replace(
        `/inbox?conversation=${encodeURIComponent(first.conversationId)}`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activeChat,
    defaultQueueResolved,
    isMobile,
    loadingChats,
    queueFilter,
    requestedConversationId,
    router,
    selectChat,
    visibleQueueChats,
    workflowFilter,
  ]);

  useEffect(() => {
    if (!returningToQueue || requestedConversationId) return;
    const timer = window.setTimeout(() => {
      clearActiveChat();
      setReturningToQueue(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [clearActiveChat, requestedConversationId, returningToQueue]);

  const selectedCandidate = useMemo(() => {
    if (!activeChat) return null;
    const explicitId = candidateByConversation[activeChat.conversationId];
    if (explicitId) {
      const explicit = messages.find((message) => message.id === explicitId);
      if (explicit) return explicit;
    }
    return (
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.direction === "inbound" &&
            (message.messageType === undefined ||
              message.messageType === "text") &&
            message.body.trim().length > 10,
        ) ?? null
    );
  }, [activeChat, candidateByConversation, messages]);

  const handleQueueChange = (filter: DeskQueueFilter) => {
    queueTouchedRef.current = true;
    setDefaultQueueResolved(true);
    desktopPrimedRef.current = null;
    setQueueFilter(filter);
  };

  const handleWorkflowChange = (filter: WorkflowFilter) => {
    queueTouchedRef.current = true;
    setDefaultQueueResolved(true);
    desktopPrimedRef.current = null;
    setWorkflowFilter(filter);
  };

  const handleBackToQueue = () => {
    setReturningToQueue(true);
    router.replace("/inbox");
  };

  return (
    <>
      <div
        data-inbox-workspace="v2"
        data-inbox-version="v3"
        data-inbox-operations-desk="true"
        className={`${styles.workspace} flex h-full min-h-0 flex-col overflow-hidden bg-background`}
      >
        <InboxV3Header
          workspace={workspace}
          canViewIngress={canViewIngress}
          canRetryIngress={canRetryIngress}
        />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!isMobile || !activeChat ? (
            <InboxV3Queue
              workspace={workspace}
              chats={chats}
              activeChatId={activeChatId}
              currentMemberId={authority?.currentMemberId ?? null}
              queueFilter={queueFilter}
              workflowFilter={workflowFilter}
              onQueueFilterChange={handleQueueChange}
              onWorkflowFilterChange={handleWorkflowChange}
            />
          ) : null}

          {!isMobile || activeChat ? (
            <InboxV3Thread
              workspace={workspace}
              selectedCandidate={selectedCandidate}
              onBackToQueue={handleBackToQueue}
              onSelectCandidate={(messageId) => {
                if (!activeChat) return;
                setCandidateByConversation((current) => ({
                  ...current,
                  [activeChat.conversationId]: messageId,
                }));
              }}
            />
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        title={t("inbox.confirmLogout")}
        description={t("inbox.confirmLogoutDesc")}
        confirmLabel={t("inbox.logout")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={disconnectWhatsApp}
      />
    </>
  );
}
