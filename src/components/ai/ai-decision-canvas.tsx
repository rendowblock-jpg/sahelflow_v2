"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  BrainCircuit,
  CircleDollarSign,
  ClipboardCheck,
  Loader2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
} from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import { AiReviewEvidence } from "@/components/ai/ai-review-evidence";
import { AiToolResultCard } from "@/components/ai/ai-tool-result-card";
import type {
  AiMessageView,
  AiWorkspaceError,
} from "@/components/ai/ai-workspace-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { getAiDecisionCopy } from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

function errorMessage(
  error: AiWorkspaceError,
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  switch (error.code) {
    case "AI_CONSENT_REQUIRED":
      return workspace.copy("consentMissing");
    case "AI_LICENSE_REQUIRED":
      return workspace.copy("licenseRequired");
    case "AI_RATE_LIMITED":
      return workspace.copy("rateLimited");
    case "AI_INVALID_MESSAGE":
    case "AI_INVALID_REQUEST":
      return workspace.copy("invalidMessage");
    case "AI_SESSION_NOT_FOUND":
      return workspace.copy("sessionMissing");
    case "AI_RESPONSE_NOT_PERSISTED":
      return workspace.copy("responseNotPersisted");
    case "AI_SESSION_LOAD_FAILED":
      return workspace.copy("conversationLoadFailed");
    case "AI_SESSION_CREATE_FAILED":
      return workspace.copy("sessionCreateFailed");
    case "AI_PROVIDER_UNAVAILABLE":
      return workspace.copy("providerDegraded");
    default:
      return workspace.copy("genericError");
  }
}

const STARTERS = [
  {
    id: "pending",
    title: "launchPendingTitle",
    description: "launchPendingDescription",
    prompt: "launchPendingPrompt",
    icon: ClipboardCheck,
  },
  {
    id: "revenue",
    title: "launchRevenueTitle",
    description: "launchRevenueDescription",
    prompt: "launchRevenuePrompt",
    icon: CircleDollarSign,
  },
  {
    id: "returns",
    title: "launchReturnsTitle",
    description: "launchReturnsDescription",
    prompt: "launchReturnsPrompt",
    icon: RotateCcw,
  },
  {
    id: "products",
    title: "launchProductsTitle",
    description: "launchProductsDescription",
    prompt: "launchProductsPrompt",
    icon: PackageSearch,
  },
] as const;

function SetupNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { setup, setupError, refreshSetup, locale } = workspace;
  if (setup?.ready === true) return null;

  if (!setup && !setupError) {
    return (
      <div className="flex items-center gap-2 border-b bg-muted/25 px-4 py-2 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {getAiDecisionCopy(locale, "setupChecking")}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-4 py-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-warning"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {setupError
              ? workspace.copy("setupUnavailable")
              : getAiDecisionCopy(locale, "setupAttention")}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {setupError
              ? workspace.copy("setupUnavailableDescription")
              : !setup?.consentAccepted
                ? workspace.copy("consentMissing")
                : workspace.copy("keyMissing")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {setupError ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refreshSetup()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {workspace.copy("retry")}
          </Button>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">
            <Settings2 className="size-4" aria-hidden="true" />
            {workspace.copy("openSettings")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

function ErrorNotice({
  workspace,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const { error, retry } = workspace;
  if (!error) return null;
  const persistenceOnly = error.code === "AI_RESPONSE_NOT_PERSISTED";

  return (
    <div className="mx-4 mt-3 flex items-start justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{errorMessage(error, workspace)}</p>
          {error.detail ? (
            <p dir="auto" className="mt-1 text-xs leading-5 text-muted-foreground">
              {error.detail}
            </p>
          ) : null}
        </div>
      </div>
      {!persistenceOnly ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => void retry()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {workspace.copy("retry")}
        </Button>
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  workspace,
}: {
  message: AiMessageView;
  workspace: ReturnType<typeof useAiWorkspace>;
}) {
  const assistant = message.role === "assistant";

  return (
    <article
      data-ai-message={message.role}
      className={cn("flex gap-3", assistant ? "justify-start" : "justify-end")}
    >
      {assistant ? (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
          <Bot className="size-4" aria-hidden="true" />
        </span>
      ) : null}
      <div className={cn("min-w-0", assistant ? "w-full max-w-3xl" : "max-w-[85%]") }>
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm leading-6",
            assistant
              ? "border bg-card/75 text-foreground"
              : "bg-primary text-primary-foreground",
          )}
        >
          {message.content ? (
            <p dir="auto" className="whitespace-pre-wrap break-words">
              {message.content}
            </p>
          ) : message.streaming ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              {workspace.copy("working")}
            </div>
          ) : message.interrupted ? (
            <p className="text-xs text-muted-foreground">{workspace.copy("stopped")}</p>
          ) : null}
        </div>

        {assistant && message.toolCalls.length > 0 ? (
          <div className="space-y-2 pt-2">
            {message.toolCalls.map((tool) => (
              <AiToolResultCard key={tool.id} tool={tool} />
            ))}
          </div>
        ) : null}

        {message.persistenceWarning ? (
          <div className="mt-2 rounded-xl border border-warning/25 bg-warning/5 px-3 py-2.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-semibold">
                  {workspace.copy("responseNotPersisted")}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {workspace.copy("responseNotPersistedDescription")}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function StartSurface({
  workspace,
  starting,
  onStart,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  starting: boolean;
  onStart: (prompt: string) => Promise<boolean>;
}) {
  const ready = workspace.setup?.ready === true;

  return (
    <div data-ai-start-state="true" className="mx-auto flex w-full max-w-3xl flex-col justify-center py-8">
      <span className="flex size-11 items-center justify-center rounded-2xl border bg-primary/5 text-primary">
        <BrainCircuit className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-xl font-semibold tracking-tight">
        {getAiDecisionCopy(workspace.locale, "startTitle")}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {getAiDecisionCopy(workspace.locale, "startDescription")}
      </p>
      <p className="mt-2 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {getAiDecisionCopy(workspace.locale, "safeStartNote")}
      </p>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {STARTERS.map((starter) => {
          const Icon = starter.icon;
          return (
            <button
              key={starter.id}
              type="button"
              disabled={!ready || starting}
              onClick={() => void onStart(workspace.copy(starter.prompt))}
              className={cn(
                "rounded-xl border bg-card/70 p-3.5 text-start transition-colors",
                "hover:border-primary/25 hover:bg-primary/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <span className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/7 text-primary">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {workspace.copy(starter.title)}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {workspace.copy(starter.description)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AiDecisionCanvas({
  workspace,
  wideReview,
  mobile,
  startingAnalysis,
  onBack,
  onSend,
  onStart,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  wideReview: boolean;
  mobile: boolean;
  startingAnalysis: boolean;
  onBack: () => void;
  onSend: (message: string) => Promise<boolean>;
  onStart: (prompt: string) => Promise<boolean>;
}) {
  const {
    activeSession,
    messages,
    proposals,
    loadingConversation,
    sending,
    setup,
    stop,
  } = workspace;
  const [draft, setDraft] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);
  const followTailRef = useRef(true);
  const setupReady = setup?.ready === true;

  useEffect(() => {
    const viewport = scrollRootRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) return;
    const updateFollowState = () => {
      const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      followTailRef.current = remaining < 96;
    };
    updateFollowState();
    viewport.addEventListener("scroll", updateFollowState, { passive: true });
    return () => viewport.removeEventListener("scroll", updateFollowState);
  }, [activeSession?.id]);

  useEffect(() => {
    followTailRef.current = true;
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [activeSession?.id]);

  useEffect(() => {
    if (!sending || !followTailRef.current) return;
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  const submit = async () => {
    const value = draft.trim();
    if (!value || sending || !setupReady || startingAnalysis) return;
    const accepted = await onSend(value);
    if (accepted) setDraft("");
  };

  return (
    <main data-ai-decision-canvas="true" className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b px-4 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {mobile ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={workspace.copy("backToSessions")}
              onClick={onBack}
            >
              <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
          ) : null}
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-primary/5 text-primary">
            <Bot className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight">
              {activeSession?.title || workspace.copy("newSessionTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {activeSession
                ? getAiDecisionCopy(workspace.locale, "durableSession")
                : getAiDecisionCopy(workspace.locale, "newAnalysis")}
            </p>
          </div>
        </div>

        {!wideReview ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setReviewOpen(true)}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {getAiDecisionCopy(workspace.locale, "reviewEvidence")}
            {proposals.length > 0 ? (
              <Badge variant="secondary" className="ms-1 text-xs">
                {proposals.length}
              </Badge>
            ) : null}
          </Button>
        ) : null}
      </header>

      <SetupNotice workspace={workspace} />
      <ErrorNotice workspace={workspace} />

      <div ref={scrollRootRef} className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label={workspace.copy("messageLog")}
            className="mx-auto w-full max-w-5xl px-4 py-5 md:px-7 md:py-6"
          >
            {loadingConversation ? (
              <div className="flex min-h-72 items-center justify-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              </div>
            ) : messages.length === 0 ? (
              <StartSurface
                workspace={workspace}
                starting={startingAnalysis || sending}
                onStart={onStart}
              />
            ) : (
              <div className="space-y-5">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} workspace={workspace} />
                ))}

                {proposals.length > 0 ? (
                  <section
                    data-ai-inline-proposals="true"
                    className="ms-11 max-w-3xl border-s-2 border-primary/20 ps-4"
                    aria-labelledby="ai-proposed-changes-title"
                  >
                    <div className="mb-3">
                      <h2 id="ai-proposed-changes-title" className="text-sm font-semibold">
                        {getAiDecisionCopy(workspace.locale, "proposedChanges")}
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {getAiDecisionCopy(workspace.locale, "proposedChangesDescription")}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {proposals.map((handle) => (
                        <AiActionProposalCard
                          key={handle.proposal.id}
                          handle={handle}
                          approving={workspace.approvingProposalId === handle.proposal.id}
                          onApprove={workspace.approveProposal}
                          interactive={false}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )}
            <div ref={tailRef} className="h-px" aria-hidden="true" />
          </div>
        </ScrollArea>
      </div>

      <div className="border-t bg-background/96 px-4 py-3 backdrop-blur md:px-6 md:py-4">
        <div className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-xl border bg-card/80 p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder={workspace.copy("composerPlaceholder")}
            aria-label={workspace.copy("composerPlaceholder")}
            rows={1}
            dir="auto"
            disabled={!setupReady || sending || startingAnalysis}
            className="max-h-36 min-h-11 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm shadow-none focus-visible:ring-0"
          />
          {sending ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label={workspace.copy("stop")}
              onClick={stop}
            >
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              aria-label={workspace.copy("send")}
              disabled={!setupReady || !draft.trim() || startingAnalysis}
              onClick={() => void submit()}
            >
              {startingAnalysis ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      </div>

      <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
        <SheetContent side="end" className="w-[min(440px,96vw)] p-0 sm:max-w-none">
          <SheetHeader className="sr-only">
            <SheetTitle>{getAiDecisionCopy(workspace.locale, "reviewEvidence")}</SheetTitle>
            <SheetDescription>
              {getAiDecisionCopy(workspace.locale, "reviewEvidenceDescription")}
            </SheetDescription>
          </SheetHeader>
          <AiReviewEvidence workspace={workspace} />
        </SheetContent>
      </Sheet>
    </main>
  );
}
