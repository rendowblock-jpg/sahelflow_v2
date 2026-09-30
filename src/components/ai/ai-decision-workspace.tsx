"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AiDecisionCanvas } from "@/components/ai/ai-decision-canvas";
import {
  AiReviewEvidence,
  aiReviewHasWork,
} from "@/components/ai/ai-review-evidence";
import { AiWorkHistory } from "@/components/ai/ai-work-history";
import { ConnectedAgentsSurface } from "@/components/ai/connected/connected-agents-surface";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useConnectedAgents } from "@/hooks/use-connected-agents";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type PendingPrompt = {
  sessionId: string;
  prompt: string;
  sawConversationLoad: boolean;
};

const RAIL_STORAGE_KEY = "sahelflow-agents-rail";
const RAIL_EVENT = "sahelflow:agents-rail";

/** The sidebar preference, as an external store: server renders expanded. */
function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function subscribeRail(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(RAIL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RAIL_EVENT, onChange);
  };
}

function writeRailCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Storage unavailable — the event below still updates this visit.
  }
  window.dispatchEvent(new Event(RAIL_EVENT));
}

/**
 * The Agents page: a collapsible conversation sidebar and the canvas. A new
 * chat is a draft until its first message (`startNewChat`), the review column
 * appears only when it has work at ≥1500px (IA-03/IA-04), and phones drill
 * from the sidebar into the canvas and back.
 *
 * Keyboard: Ctrl/⌘+Shift+O opens a new chat, Ctrl/⌘+Shift+S shows or hides
 * the sidebar. The canvas owns the composer shortcuts.
 */
export function AiDecisionWorkspace({
  initialPrompt = "",
  initialView = "session",
}: {
  /** Composer prefill from a /agents?q= deep link (record-surface "Ask AI"). */
  initialPrompt?: string;
  /** `/agents?view=connected` opens the Connected agents surface (MCP-13). */
  initialView?: "session" | "connected";
}) {
  const workspace = useAiWorkspace();
  const mobile = useMobile();
  // The canvas shows either the in-app agent conversation or the control
  // surface for external MCP agents; the sidebar switches between them.
  const [view, setView] = useState<"session" | "connected">(initialView);
  const agents = useConnectedAgents(view === "connected");
  const connectedOffered = !agents.forbidden;
  const showConnected = view === "connected" && connectedOffered;
  const wideViewport = useMediaQuery("(min-width: 1500px)");
  const showReviewColumn =
    !showConnected && wideViewport && aiReviewHasWork(workspace);
  const [mobilePane, setMobilePane] = useState<"history" | "canvas">(
    initialView === "connected" || initialPrompt ? "canvas" : "history",
  );
  const storedRailCollapsed = useSyncExternalStore(
    subscribeRail,
    readRailCollapsed,
    () => false,
  );
  // Session-local override for when storage is unavailable.
  const [railOverride, setRailOverride] = useState<boolean | null>(null);
  const railCollapsed = railOverride ?? storedRailCollapsed;
  const [reviewOpen, setReviewOpen] = useState(false);
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const pendingPromptRef = useRef<PendingPrompt | null>(null);
  const navigationLocked = workspace.creatingSession;
  const approvalsCount = workspace.inboxError
    ? workspace.proposals.length
    : workspace.inbox.length;

  const toggleRail = useCallback(() => {
    const next = !railCollapsed;
    setRailOverride(next);
    writeRailCollapsed(next);
  }, [railCollapsed]);

  useEffect(() => {
    const pending = pendingPromptRef.current;
    if (!pending || workspace.activeSessionId !== pending.sessionId) return;

    if (workspace.loadingConversation) {
      pending.sawConversationLoad = true;
      return;
    }
    if (!pending.sawConversationLoad) return;

    pendingPromptRef.current = null;
    void workspace.send(pending.prompt).finally(() => {
      setStartingAnalysis(false);
    });
  }, [
    workspace.activeSessionId,
    workspace.loadingConversation,
    workspace.send,
  ]);

  const openSession = (sessionId: string) => {
    if (navigationLocked) return;

    const pending = pendingPromptRef.current;
    if (pending && pending.sessionId !== sessionId) {
      pendingPromptRef.current = null;
      setStartingAnalysis(false);
    }
    setView("session");
    workspace.selectSession(sessionId);
    if (mobile) setMobilePane("canvas");
  };

  const openConnected = () => {
    setView("connected");
    if (mobile) setMobilePane("canvas");
  };

  const newChat = useCallback(() => {
    if (workspace.sending || startingAnalysis) return;
    pendingPromptRef.current = null;
    setView("session");
    workspace.startNewChat();
    if (mobile) setMobilePane("canvas");
  }, [mobile, startingAnalysis, workspace]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        newChat();
      } else if (key === "s" && !mobile) {
        event.preventDefault();
        toggleRail();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobile, newChat, toggleRail]);

  const queuePromptInNewSession = async (prompt: string) => {
    if (
      workspace.loadingSessions ||
      startingAnalysis ||
      workspace.creatingSession ||
      workspace.sending
    ) {
      return false;
    }
    setView("session");
    setStartingAnalysis(true);
    const sessionId = await workspace.createSession();
    if (!sessionId) {
      setStartingAnalysis(false);
      return false;
    }
    pendingPromptRef.current = {
      sessionId,
      prompt,
      sawConversationLoad: false,
    };
    if (mobile) setMobilePane("canvas");
    return true;
  };

  const sendPrompt = async (message: string) => {
    if (workspace.activeSessionId && !workspace.composingNewChat) {
      return workspace.send(message);
    }
    return queuePromptInNewSession(message);
  };

  const startPrompt = async (prompt: string) => {
    if (
      workspace.activeSessionId &&
      !workspace.composingNewChat &&
      workspace.messages.length === 0
    ) {
      return workspace.send(prompt);
    }
    return queuePromptInNewSession(prompt);
  };

  const sidebar = (collapsed: boolean) => (
    <AiWorkHistory
      workspace={workspace}
      collapsed={collapsed}
      navigationLocked={navigationLocked}
      draftActive={!showConnected && workspace.composingNewChat}
      approvalsCount={approvalsCount}
      connectedOffered={connectedOffered}
      connectedActive={showConnected}
      connectedCount={agents.activeCount}
      onToggleCollapsed={mobile ? undefined : toggleRail}
      onOpenSession={openSession}
      onNewChat={newChat}
      onOpenApprovals={() => {
        setView("session");
        if (mobile) setMobilePane("canvas");
        setReviewOpen(true);
      }}
      onOpenConnected={openConnected}
    />
  );

  const canvas = showConnected ? (
    <ConnectedAgentsSurface
      agents={agents}
      locale={workspace.locale}
      onOpenSession={openSession}
      onBack={mobile ? () => setMobilePane("history") : undefined}
    />
  ) : (
    <AiDecisionCanvas
      workspace={workspace}
      wideReview={showReviewColumn}
      mobile={mobile}
      startingAnalysis={startingAnalysis}
      initialDraft={initialPrompt}
      reviewOpen={reviewOpen}
      onReviewOpenChange={setReviewOpen}
      onBack={() => setMobilePane("history")}
      onNewChat={newChat}
      onSend={sendPrompt}
      onStart={startPrompt}
    />
  );

  if (mobile) {
    return (
      <div
        data-ai-decision-workspace="true"
        data-ai-layout="mobile"
        className="h-full min-h-0 overflow-hidden bg-background"
      >
        {mobilePane === "history" ? sidebar(false) : canvas}
      </div>
    );
  }

  return (
    <div
      data-ai-decision-workspace="true"
      data-ai-layout={showReviewColumn ? "wide" : "desktop"}
      className="flex h-full min-h-0 overflow-hidden bg-background"
    >
      <div
        className={cn(
          "h-full shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none",
          railCollapsed ? "w-14" : "w-66",
        )}
      >
        {sidebar(railCollapsed)}
      </div>
      <div className="min-w-0 flex-1">{canvas}</div>
      {showReviewColumn ? (
        <div className="h-full w-80 shrink-0 border-s">
          <AiReviewEvidence workspace={workspace} />
        </div>
      ) : null}
    </div>
  );
}
