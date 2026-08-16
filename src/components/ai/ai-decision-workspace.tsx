"use client";

import { useEffect, useRef, useState } from "react";

import { AiDecisionCanvas } from "@/components/ai/ai-decision-canvas";
import { AiReviewEvidence } from "@/components/ai/ai-review-evidence";
import { AiWorkHistory } from "@/components/ai/ai-work-history";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

type PendingPrompt = {
  sessionId: string;
  prompt: string;
  sawConversationLoad: boolean;
};

export function AiDecisionWorkspace() {
  const workspace = useAiWorkspace();
  const mobile = useMobile();
  const wideReview = useMediaQuery("(min-width: 1500px)");
  const [mobilePane, setMobilePane] = useState<"history" | "canvas">("history");
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
    window.setTimeout(() => {
      void workspace.send(pending.prompt).finally(() => {
        setStartingAnalysis(false);
      });
    }, 0);
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
    workspace.selectSession(sessionId);
    if (mobile) setMobilePane("canvas");
  };

  const newAnalysis = async () => {
    if (
      workspace.loadingSessions ||
      startingAnalysis ||
      workspace.creatingSession ||
      workspace.sending
    ) {
      return;
    }
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
          />
        ) : (
          <AiDecisionCanvas
            workspace={workspace}
            wideReview={false}
            mobile
            startingAnalysis={startingAnalysis}
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
      data-ai-layout={wideReview ? "wide" : "desktop"}
      className={cn(
        "grid h-full min-h-0 overflow-hidden bg-background",
        wideReview
          ? "grid-cols-[17.5rem_minmax(0,1fr)_20rem]"
          : "grid-cols-[17.5rem_minmax(0,1fr)]",
      )}
    >
      <AiWorkHistory
        workspace={workspace}
        navigationLocked={navigationLocked}
        onOpenSession={openSession}
        onNewAnalysis={() => void newAnalysis()}
      />
      <AiDecisionCanvas
        workspace={workspace}
        wideReview={wideReview}
        mobile={false}
        startingAnalysis={startingAnalysis}
        onBack={() => undefined}
        onSend={sendPrompt}
        onStart={startPrompt}
      />
      {wideReview ? (
        <div className="min-h-0 border-s">
          <AiReviewEvidence workspace={workspace} />
        </div>
      ) : null}
    </div>
  );
}
