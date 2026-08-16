"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  DeskQueueFilter,
  InboxAuthorityView,
  WorkflowFilter,
} from "@/components/inbox/inbox-desk-types";
import { InboxOperationsHeader } from "@/components/inbox/inbox-operations-header";
import { InboxThreadWorkbench } from "@/components/inbox/inbox-thread-workbench";
import { InboxWorkQueue } from "@/components/inbox/inbox-work-queue";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { useMobile } from "@/hooks/use-mobile";

export function InboxOperationsDesk({
  canViewIngress,
  canRetryIngress,
}: {
  canViewIngress: boolean;
  canRetryIngress: boolean;
}) {
  const workspace = useInboxWorkspace();
  const isMobile = useMobile();
  const searchParams = useSearchParams();
  const requestedConversationId = searchParams.get("conversation");
  const {
    chats,
    loadingChats,
    activeChat,
    activeChatId,
    selectChat,
    messages,
    logoutConfirmOpen,
    setLogoutConfirmOpen,
    disconnectWhatsApp,
    t,
    locale,
  } = workspace;

  const [authority, setAuthority] = useState<InboxAuthorityView | null>(null);
  const [queueFilter, setQueueFilter] = useState<DeskQueueFilter>("all");
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("all");
  const [candidateByConversation, setCandidateByConversation] = useState<Record<string, string>>({});
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
        const next = (await response.json()) as InboxAuthorityView;
        setAuthority(next);
        if (!queueTouchedRef.current && next.currentMemberId) {
          setQueueFilter("mine");
        }
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
    if (isMobile || loadingChats || activeChat || requestedConversationId) return;
    const first = visibleQueueChats[0] ?? chats[0];
    if (!first) return;
    const fingerprint = `${first.conversationId}:${queueFilter}:${workflowFilter}`;
    if (desktopPrimedRef.current === fingerprint) return;
    desktopPrimedRef.current = fingerprint;
    const timer = window.setTimeout(() => selectChat(first), 0);
    return () => window.clearTimeout(timer);
  }, [
    activeChat,
    chats,
    isMobile,
    loadingChats,
    queueFilter,
    requestedConversationId,
    selectChat,
    visibleQueueChats,
    workflowFilter,
  ]);

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
            (message.messageType === undefined || message.messageType === "text") &&
            message.body.trim().length > 10,
        ) ?? null
    );
  }, [activeChat, candidateByConversation, messages]);

  const handleQueueChange = (filter: DeskQueueFilter) => {
    queueTouchedRef.current = true;
    desktopPrimedRef.current = null;
    setQueueFilter(filter);
  };

  const handleWorkflowChange = (filter: WorkflowFilter) => {
    desktopPrimedRef.current = null;
    setWorkflowFilter(filter);
  };

  return (
    <>
      <div
        data-inbox-workspace="v2"
        data-inbox-operations-desk="true"
        className="flex h-full min-h-0 flex-col overflow-hidden border bg-background"
      >
        <InboxOperationsHeader
          workspace={workspace}
          canViewIngress={canViewIngress}
          canRetryIngress={canRetryIngress}
        />

        <div
          className="flex min-h-0 flex-1 overflow-hidden"
          style={{ direction: locale === "ar" ? "rtl" : "ltr" }}
        >
          {!isMobile || !activeChat ? (
            <InboxWorkQueue
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
            <InboxThreadWorkbench
              workspace={workspace}
              selectedCandidate={selectedCandidate}
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
