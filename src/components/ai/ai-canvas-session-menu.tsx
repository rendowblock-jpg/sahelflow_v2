"use client";

import { Copy, MoreHorizontal, Pin, PinOff } from "lucide-react";

import type { AiSessionSummary } from "@/components/ai/ai-workspace-types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { toast } from "@/lib/toast";

/**
 * The canvas header's overflow menu for the open conversation: copy the whole
 * transcript as plain text, and pin/unpin it in the rail. Pinning shares the
 * rail's durable authority (`pinSession`), so both surfaces always agree.
 */
export function AiCanvasSessionMenu({
  workspace,
  session,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  session: AiSessionSummary;
}) {
  const { locale, messages } = workspace;
  const pinned = Boolean(session.pinnedAt);

  const copyTranscript = async () => {
    const you = getAiDecisionCopy(locale, "youLabel");
    const agent = getAiDecisionCopy(locale, "agentName");
    const transcript = messages
      .filter((message) => message.content.trim())
      .map(
        (message) =>
          `${message.role === "assistant" ? agent : you}:\n${message.content.trim()}`,
      )
      .join("\n\n");
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      toast.success(getAiDecisionCopy(locale, "transcriptCopied"));
    } catch {
      // Clipboard unavailable (permissions) — non-fatal.
    }
  };

  const togglePin = async () => {
    const ok = await workspace.pinSession(session.id, !pinned);
    if (!ok) toast.error(getAiDecisionCopy(locale, "pinFailed"));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={getAiDecisionCopy(locale, "sessionActions")}
          className="text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          disabled={messages.length === 0}
          onSelect={() => void copyTranscript()}
        >
          <Copy className="size-4" aria-hidden="true" />
          {getAiDecisionCopy(locale, "copyTranscript")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void togglePin()}>
          {pinned ? (
            <PinOff className="size-4" aria-hidden="true" />
          ) : (
            <Pin className="size-4" aria-hidden="true" />
          )}
          {getAiDecisionCopy(locale, pinned ? "unpinSession" : "pinSession")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
