"use client";

import { useEffect, type RefObject } from "react";

import type { useAiWorkspace } from "@/hooks/use-ai-workspace";

/**
 * Ledger AI-22 — discoverable keyboard surface for the AI decision canvas.
 *
 * "/" focuses the composer (Gmail/WhatsApp convention, inert while typing),
 * Escape stops an active stream (or cancels edit mode), Alt+↑/↓ walks the
 * session list, and Ctrl+Enter approves the focused proposal card.
 *
 * STR-01 moved this out of `ai-decision-canvas.tsx` unchanged. It is
 * window-level behaviour rather than canvas markup, and the canvas still owns
 * the composer ref this focuses — the ref is passed in rather than recreated,
 * so there is exactly one composer handle.
 */
export function useAiCanvasShortcuts({
  workspace,
  composerRef,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  composerRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const {
    activeSessionId,
    approveProposal,
    cancelEditMessage,
    editingMessageId,
    inbox,
    proposals,
    selectSession,
    sending,
    sessions,
    stop,
  } = workspace;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Radix-owned surfaces (sheets/dialogs) consume Escape first.
        if (document.querySelector('[role="dialog"]')) return;
        if (editingMessageId) {
          event.preventDefault();
          cancelEditMessage();
          return;
        }
        if (sending) {
          event.preventDefault();
          stop();
        }
        return;
      }
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        const target = event.target as HTMLElement | null;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        composerRef.current?.focus();
        return;
      }
      if (event.ctrlKey && event.key === "Enter") {
        const focused = document.activeElement?.closest<HTMLElement>(
          "[data-ai-proposal-id]",
        );
        const proposalId = focused?.dataset.aiProposalId;
        if (!proposalId) return;
        const handle =
          proposals.find((entry) => entry.proposal.id === proposalId) ??
          inbox.find((entry) => entry.proposal.id === proposalId);
        if (handle) {
          event.preventDefault();
          void approveProposal(handle);
        }
        return;
      }
      if (
        event.altKey &&
        !event.ctrlKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        if (sessions.length === 0) return;
        const index = sessions.findIndex(
          (session) => session.id === activeSessionId,
        );
        if (index < 0) return;
        const next = event.key === "ArrowUp" ? index - 1 : index + 1;
        if (next < 0 || next >= sessions.length) return;
        event.preventDefault();
        selectSession(sessions[next]!.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeSessionId,
    approveProposal,
    cancelEditMessage,
    composerRef,
    editingMessageId,
    inbox,
    proposals,
    selectSession,
    sending,
    sessions,
    stop,
  ]);
}
