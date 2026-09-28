"use client";

import { useEffect, useRef, useState } from "react";

import { AiDecisionCanvas } from "@/components/ai/ai-decision-canvas";
import {
  AiReviewEvidence,
  aiReviewHasWork,
} from "@/components/ai/ai-review-evidence";
import { AiWorkHistory } from "@/components/ai/ai-work-history";
import { ConnectedAgentsRailEntry } from "@/components/ai/connected/connected-agents-rail-entry";
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
  // surface for external MCP agents; the rail entry switches between them.
  const [view, setView] = useState<"session" | "connected">(initialView);
  const agents = useConnectedAgents(view === "connected");
  const connectedOffered = !agents.forbidden;
  const showConnected = view === "connected" && connectedOffered;
  const wideViewport = useMediaQuery("(min-width: 1500px)");
  const showReviewColumn =
    !showConnected && wideViewport && aiReviewHasWork(workspace);
  const [mobilePane, setMobilePane] = useState<"history" | "canvas">(
    initialView === "connected" ? "canvas" : "history",
  );
  const [startingAnalysis, setStartingAnalysis] = useState(false);
  const pendingPromptRef = useRef<PendingPrompt | null>(null);
  const navigationLocked = workspace.creatingSession;

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

  const railFooter = connectedOffered ? (
    <ConnectedAgentsRailEntry
      locale={workspace.locale}
      activeCount={agents.activeCount}
      selected={showConnected}
      onOpen={openConnected}
    />
  ) : null;

  const newAnalysis = async () => {
    if (
      workspace.loadingSessions ||
      startingAnalysis ||
      workspace.creatingSession ||
      workspace.sending
    ) {
      return;
    }
    setView("session");
    setStartingAnalysis(true);
    const sessionId = await workspace.createSession();
    setStartingAnalysis(false);
    if (sessionId && mobile) setMobilePane("canvas");
  };

  const queuePromptInNewSession = async (prompt: string) => {
    if (
      workspace.loadingSessions ||
      startingAnalysis ||
      workspace.creatingSession ||
      workspace.sending
    ) {
      return false;
    }
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
    if (workspace.activeSessionId) return workspace.send(message);
    return queuePromptInNewSession(message);
  };

  const startPrompt = async (prompt: string) => {
    if (workspace.activeSessionId && workspace.messages.length === 0) {
      return workspace.send(prompt);
    }
    return queuePromptInNewSession(prompt);
  };

  if (mobile) {
    return (
      <div
        data-ai-decision-workspace="true"
        data-ai-layout="mobile"
        className="h-full min-h-0 overflow-hidden bg-background"
      >
        {mobilePane === "history" ? (
          <AiWorkHistory
            workspace={workspace}
            navigationLocked={navigationLocked}
            onOpenSession={openSession}
            onNewAnalysis={() => void newAnalysis()}
            footer={railFooter}
          />
        ) : showConnected ? (
          <ConnectedAgentsSurface
            agents={agents}
            locale={workspace.locale}
            onOpenSession={openSession}
            onBack={() => setMobilePane("history")}
          />
        ) : (
          <AiDecisionCanvas
            workspace={workspace}
            wideReview={false}
            mobile
            startingAnalysis={startingAnalysis}
            initialDraft={initialPrompt}
            onBack={() => setMobilePane("history")}
            onSend={sendPrompt}
            onStart={startPrompt}
          />
        )}
      </div>
    );
  }

  return (
    <div
      data-ai-decision-workspace="true"
      data-ai-layout={showReviewColumn ? "wide" : "desktop"}
      className={cn(
        "grid h-full min-h-0 overflow-hidden bg-background",
        showReviewColumn
          ? "grid-cols-[16rem_minmax(0,1fr)_20rem]"
          : "grid-cols-[16rem_minmax(0,1fr)]",
      )}
    >
      <AiWorkHistory
        workspace={workspace}
        navigationLocked={navigationLocked}
        onOpenSession={openSession}
        onNewAnalysis={() => void newAnalysis()}
        footer={railFooter}
      />
      {showConnected ? (
        <ConnectedAgentsSurface
          agents={agents}
          locale={workspace.locale}
          onOpenSession={openSession}
        />
      ) : (
      <AiDecisionCanvas
        workspace={workspace}
        wideReview={showReviewColumn}
        mobile={false}
        startingAnalysis={startingAnalysis}
        initialDraft={initialPrompt}
        onBack={() => undefined}
        onSend={sendPrompt}
        onStart={startPrompt}
      />
      )}
      {showReviewColumn ? (
        <div className="min-h-0 border-s">
          <AiReviewEvidence workspace={workspace} />
        </div>
      ) : null}
    </div>
  );
}
