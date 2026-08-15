"use client";

import { useState } from "react";

import { AiOperationalLaunchpad } from "@/components/ai/ai-operational-launchpad";
import { AiWorkspace } from "@/components/ai/ai-workspace";

/**
 * AI page composition boundary.
 *
 * Focused launch actions create a real durable session and first response through
 * the same APIs as the workspace. Refresh only the AI workspace subtree after a
 * successful launch so session state converges without a full document reload or
 * loss of application-shell state.
 */
export function AiWorkspaceShell() {
  const [workspaceVersion, setWorkspaceVersion] = useState(0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AiOperationalLaunchpad
        onSessionCreated={() =>
          setWorkspaceVersion((current) => current + 1)
        }
      />
      <div className="min-h-0 flex-1">
        <AiWorkspace key={workspaceVersion} />
      </div>
    </div>
  );
}
