"use client";

import { useEffect, useState } from "react";

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
};

export function AiDecisionWorkspace() {
  const workspace = useAiWorkspace();
  const mobile = useMobile();
  const wideReview = useMediaQuery("(min-width: 1500px)");
  const [mobilePane, setMobilePane] = useState<"history" | "canvas">("history");
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);
  const [startingAnalysis, setStartingAnalysis] = useState(false);

  useEffect(() => {
    if (
      !pendingPrompt ||
      workspace.activeSessionId !== pendingPrompt.sessionId ||
      workspace.sending
    ) {
      return;
    }

    let cancelled = false;
    void workspace.send(pendingPrompt.prompt).finally(() => {
      if (cancelled) return;
      setPendingPrompt(null);
      setStartingAnalysis(false);
    });

    return () => {
      cancelled = true;
    };
  }, [pendingPrompt, workspace.activeSessionId, workspace.send, workspace.sending]);

  const openSession = (sessionId: string) => {
    workspace.selectSession(sessionId);
    if (mobile) setMobilePane("canvas");
  };

  const newAnalysis = async () => {
    if (startingAnalysis || workspace.creatingSession) return;
    setStartingAnalysis(true);
    const sessionId = await workspace.createSession();
    setStartingAnalysis(false);
    if (sessionId && mobile) setMobilePane("canvas");
  };

  const queuePromptInNewSession = async (prompt: string) => {
    if (startingAnalysis || workspace.creatingSession) return false;
    setStartingAnalysis(true);
    const sessionId = await workspace.createSession();
    if (!sessionId) {
      setStartingAnalysis(false);
      return false;
    }
    setPendingPrompt({ sessionId, prompt });
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
