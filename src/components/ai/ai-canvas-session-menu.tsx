"use client";

import { useState } from "react";
import {
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";

import type { AiSessionSummary } from "@/components/ai/ai-workspace-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { useAiWorkspace } from "@/hooks/use-ai-workspace";
import {
  formatTranscriptMarkdown,
  formatTranscriptText,
  transcriptFileName,
} from "@/lib/ai/chat/transcript";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { toast } from "@/lib/toast";

/** The header's in-place rename field: Enter or blur saves, Escape cancels. */
export function AiTitleRenameField({
  value,
  label,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <input
      autoFocus
      dir="auto"
      value={value}
      maxLength={160}
      aria-label={label}
      data-ai-title-rename="true"
      onChange={(event) => onChange(event.target.value)}
      onBlur={onSave}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSave();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      className="h-8 w-full max-w-md rounded-control border border-border bg-card px-2 text-body-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

/**
 * The open conversation's actions, one menu in the canvas header: rename,
 * pin, copy, export and delete. Pin, rename and delete share the rail's
 * durable authorities, so both surfaces always agree.
 */
export function AiCanvasSessionMenu({
  workspace,
  session,
  onRename,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  session: AiSessionSummary;
  /** Switches the header title into its inline rename field. */
  onRename: () => void;
}) {
  const { locale, messages } = workspace;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pinned = Boolean(session.pinnedAt);
  const title = session.title || workspace.copy("newSessionTitle");
  const labels = {
    you: getAiDecisionCopy(locale, "youLabel"),
    agent: getAiDecisionCopy(locale, "agentName"),
  };
  const hasTranscript = messages.some((message) => message.content.trim());

  const copyTranscript = async () => {
    const transcript = formatTranscriptText(messages, labels);
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      toast.success(getAiDecisionCopy(locale, "transcriptCopied"));
    } catch {
      // Clipboard unavailable (permissions) — non-fatal.
    }
  };

  const exportTranscript = () => {
    const markdown = formatTranscriptMarkdown(title, messages, labels);
    const url = URL.createObjectURL(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = transcriptFileName(title);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    toast.success(getAiDecisionCopy(locale, "exported"));
  };

  const togglePin = async () => {
    const ok = await workspace.pinSession(session.id, !pinned);
    if (!ok) toast.error(getAiDecisionCopy(locale, "pinFailed"));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            data-ai-session-menu="true"
            aria-label={getAiDecisionCopy(locale, "sessionActions")}
            className="text-muted-foreground hover:text-foreground"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onRename}>
            <Pencil className="size-4" aria-hidden="true" />
            {getAiDecisionCopy(locale, "renameAction")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void togglePin()}>
            {pinned ? (
              <PinOff className="size-4" aria-hidden="true" />
            ) : (
              <Pin className="size-4" aria-hidden="true" />
            )}
            {getAiDecisionCopy(locale, pinned ? "unpinSession" : "pinSession")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!hasTranscript}
            onSelect={() => void copyTranscript()}
          >
            <Copy className="size-4" aria-hidden="true" />
            {getAiDecisionCopy(locale, "copyTranscript")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasTranscript}
            data-ai-export-transcript="true"
            onSelect={exportTranscript}
          >
            <Download className="size-4" aria-hidden="true" />
            {getAiDecisionCopy(locale, "exportMarkdown")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {getAiDecisionCopy(locale, "deleteAction")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {getAiDecisionCopy(locale, "deleteConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription dir="auto">
              {getAiDecisionCopy(locale, "deleteConfirmDescription", { title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {getAiDecisionCopy(locale, "cancelAction")}
            </AlertDialogCancel>
            <AlertDialogAction
              data-ai-confirm-delete="true"
              variant="destructive"
              onClick={() => void workspace.deleteSession(session.id)}
            >
              {getAiDecisionCopy(locale, "deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
