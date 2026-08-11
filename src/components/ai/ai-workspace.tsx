"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  KeyRound,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  WifiOff,
  Wrench,
} from "lucide-react";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
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
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMobile } from "@/hooks/use-mobile";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import { cn } from "@/lib/utils";

function errorMessage(
  error: AiWorkspaceError,
  copy: ReturnType<typeof useAiWorkspace>["copy"],
): string {
  switch (error.code) {
    case "AI_CONSENT_REQUIRED":
      return copy("consentMissing");
    case "AI_LICENSE_REQUIRED":
      return copy("licenseRequired");
    case "AI_RATE_LIMITED":
      return copy("rateLimited");
    case "AI_INVALID_MESSAGE":
    case "AI_INVALID_REQUEST":
      return copy("invalidMessage");
    case "AI_SESSION_NOT_FOUND":
      return copy("sessionMissing");
    case "AI_RESPONSE_NOT_PERSISTED":
      return copy("responseNotPersisted");
    case "AI_SESSION_LOAD_FAILED":
      return copy("conversationLoadFailed");
    case "AI_SESSION_CREATE_FAILED":
      return copy("sessionCreateFailed");
    case "AI_PROVIDER_UNAVAILABLE":
      return copy("providerDegraded");
    default:
      return copy("genericError");
  }
}

function relativeSessionTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SessionsPane({
  workspace,
  onOpen,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  onOpen: () => void;
}) {
  const {
    sessions,
    activeSessionId,
    loadingSessions,
    creatingSession,
    selectSession,
    createSession,
    copy,
    locale,
  } = workspace;

  return (
    <aside
      data-ai-sessions="true"
      className="flex h-full min-h-0 flex-col border-e bg-muted/10"
    >
      <div className="flex min-h-14 items-center justify-between gap-2 border-b px-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold">{copy("sessions")}</p>
          <p className="text-[10px] text-muted-foreground">{copy("durableHistory")}</p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={creatingSession}
          aria-label={copy("newSession")}
          onClick={() => {
            void createSession().then((id) => {
              if (id) onOpen();
            });
          }}
        >
          {creatingSession ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-xs font-medium">{copy("noSessions")}</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {copy("noSessionsDescription")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  void createSession().then((id) => {
                    if (id) onOpen();
                  });
                }}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {copy("newSession")}
              </Button>
            </div>
          ) : (
            sessions.map((session) => {
              const active = session.id === activeSessionId;
              const preview = session.messages?.[0]?.content;
              return (
                <button
                  key={session.id}
                  type="button"
                  data-ai-session={session.id}
                  onClick={() => {
                    selectSession(session.id);
                    onOpen();
                  }}
                  className={cn(
                    "group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-start transition-colors",
                    active ? "bg-primary/8 text-foreground" : "hover:bg-muted/60",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border",
                      active ? "border-primary/20 bg-primary/10 text-primary" : "bg-background text-muted-foreground",
                    )}
                  >
                    <Bot className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {session.title || copy("newSessionTitle")}
                    </span>
                    {preview ? (
                      <span dir="auto" className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {preview}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-[9px] tabular-nums text-muted-foreground">
                      {relativeSessionTime(session.updatedAt, locale)}
                    </span>
                  </span>
                  <ChevronRight
                    className="mt-2 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function SetupNotice({ workspace }: { workspace: ReturnType<typeof useAiWorkspace> }) {
  const { setup, copy } = workspace;
  if (setup.ready) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/20 bg-warning/5 px-3 py-2 text-xs">
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div>
          <p className="font-medium text-foreground">{copy("setupNeedsAttention")}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {!setup.consentAccepted ? copy("consentMissing") : copy("keyMissing")}
          </p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/settings">
          <Settings2 className="size-3.5" aria-hidden="true" />
          {copy("openSettings")}
        </Link>
      </Button>
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
  const { copy } = workspace;
  const assistant = message.role === "assistant";
  return (
    <article
      data-ai-message={message.role}
      className={cn("flex gap-2.5", assistant ? "justify-start" : "justify-end")}
    >
      {assistant ? (
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
          <Bot className="size-3.5" aria-hidden="true" />
        </span>
      ) : null}
      <div className={cn("min-w-0 max-w-[min(44rem,88%)]", assistant ? "flex-1" : "") }>
        <div
          className={cn(
            "rounded-xl px-3.5 py-2.5 text-sm leading-6",
            assistant ? "border bg-card" : "bg-primary text-primary-foreground",
          )}
        >
          {message.content ? (
            <p dir="auto" className="whitespace-pre-wrap break-words">
              {message.content}
            </p>
          ) : message.streaming ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {copy("working")}
            </div>
          ) : message.interrupted ? (
            <p className="text-xs text-muted-foreground">{copy("stopped")}</p>
          ) : null}
        </div>

        {assistant && message.toolCalls.length > 0 ? (
          <div className="space-y-2">
            {message.toolCalls.map((tool) => (
              <AiToolResultCard key={tool.id} tool={tool} />
            ))}
          </div>
        ) : null}

        {message.persistenceWarning ? (
          <div className="mt-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-xs">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <p className="font-medium">{copy("responseNotPersisted")}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                  {copy("responseNotPersistedDescription")}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ErrorNotice({ workspace }: { workspace: ReturnType<typeof useAiWorkspace> }) {
  const { error, copy, retry } = workspace;
  if (!error) return null;
  const persistence = error.code === "AI_RESPONSE_NOT_PERSISTED";
  return (
    <div className="mx-3 mt-3 flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs">
      <div className="flex min-w-0 items-start gap-2">
        {error.code === "AI_PROVIDER_UNAVAILABLE" ? (
          <WifiOff className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="font-medium text-foreground">{errorMessage(error, copy)}</p>
          {error.detail ? (
            <p dir="auto" className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {error.detail}
            </p>
          ) : null}
        </div>
      </div>
      {!persistence ? (
        <Button type="button" size="sm" variant="ghost" onClick={() => void retry()}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {copy("retry")}
        </Button>
      ) : null}
    </div>
  );
}

function ContextRail({ workspace }: { workspace: ReturnType<typeof useAiWorkspace> }) {
  const { setup, proposals, copy, approveProposal, approvingProposalId } = workspace;
  return (
    <aside data-ai-context="true" className="flex h-full min-h-0 flex-col bg-muted/8">
      <div className="border-b px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold">{copy("context")}</p>
            <p className="text-[10px] text-muted-foreground">{copy("capabilities")}</p>
          </div>
          {proposals.length > 0 ? (
            <Badge variant="secondary" className="text-[10px]">
              {proposals.length}
            </Badge>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <section className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BrainCircuit className="size-4 text-primary" aria-hidden="true" />
                <span className="text-xs font-semibold">{copy("provider")}</span>
              </div>
              <Badge variant={setup.ready ? "secondary" : "outline"} className="text-[10px]">
                {copy("gemini")}
              </Badge>
            </div>
            <dl className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  {copy("consent")}
                </dt>
                <dd className="font-medium">
                  {setup.consentAccepted ? copy("accepted") : copy("missing")}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <KeyRound className="size-3" aria-hidden="true" />
                  API key
                </dt>
                <dd className="font-medium">
                  {setup.keyConfigured ? copy("configured") : copy("notConfigured")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-3">
            <p className="text-xs font-semibold">{copy("capabilities")}</p>
            <ul className="mt-2 space-y-2 text-[11px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <Database className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {copy("readTools")}
              </li>
              <li className="flex items-start gap-2">
                <Clock3 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {copy("externalTools")}
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {copy("sensitiveTools")}
              </li>
              <li className="flex items-start gap-2">
                <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {copy("blockedTools")}
              </li>
            </ul>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">{copy("actions")}</p>
              {proposals.length > 0 ? (
                <Badge variant="outline" className="text-[10px]">{proposals.length}</Badge>
              ) : null}
            </div>
            {proposals.length === 0 ? (
              <div className="rounded-xl border border-dashed px-3 py-5 text-center">
                <CheckCircle2 className="mx-auto size-4 text-muted-foreground" aria-hidden="true" />
                <p className="mt-2 text-xs font-medium">{copy("noActions")}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                  {copy("noActionsDescription")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {proposals.map((handle) => (
                  <AiActionProposalCard
                    key={handle.proposal.id}
                    handle={handle}
                    approving={approvingProposalId === handle.proposal.id}
                    onApprove={approveProposal}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}

function ThreadPane({
  workspace,
  onBack,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  onBack: () => void;
}) {
  const {
    activeSession,
    messages,
    loadingConversation,
    sending,
    setup,
    proposals,
    copy,
    send,
    stop,
  } = workspace;
  const [draft, setDraft] = useState("");
  const [contextOpen, setContextOpen] = useState(false);

  const submit = () => {
    const value = draft.trim();
    if (!value || sending || !activeSession || !setup.ready) return;
    setDraft("");
    void send(value);
  };

  return (
    <main data-ai-thread="true" className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b px-3 md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="md:hidden"
            aria-label={copy("backToSessions")}
            onClick={onBack}
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Button>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
            <Bot className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {activeSession?.title || copy("newSessionTitle")}
            </h2>
            <p className="text-[10px] text-muted-foreground">{copy("assistant")}</p>
          </div>
        </div>
        <Sheet open={contextOpen} onOpenChange={setContextOpen}>
          <SheetTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="xl:hidden">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {copy("reviewActions")}
              {proposals.length > 0 ? (
                <Badge variant="secondary" className="ms-1 px-1.5 text-[9px]">
                  {proposals.length}
                </Badge>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent side={workspace.locale === "ar" ? "left" : "right"} className="w-[min(420px,96vw)] p-0 sm:max-w-none">
            <SheetHeader className="sr-only">
              <SheetTitle>{copy("context")}</SheetTitle>
              <SheetDescription>{copy("actions")}</SheetDescription>
            </SheetHeader>
            <ContextRail workspace={workspace} />
          </SheetContent>
        </Sheet>
      </header>

      <SetupNotice workspace={workspace} />
      <ErrorNotice workspace={workspace} />

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-4xl px-3 py-4 md:px-6 md:py-6">
          {loadingConversation ? (
            <div className="flex min-h-64 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            </div>
          ) : !activeSession ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Bot className="size-7 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{copy("noSessions")}</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center text-center">
              <span className="flex size-11 items-center justify-center rounded-2xl border bg-primary/5 text-primary">
                <BrainCircuit className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{copy("emptyThreadTitle")}</h3>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {copy("emptyThreadDescription")}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} workspace={workspace} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t bg-background/95 p-3 backdrop-blur md:px-5 md:py-4">
        <div className="mx-auto flex w-full max-w-4xl items-end gap-2 rounded-xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={copy("composerPlaceholder")}
            aria-label={copy("composerPlaceholder")}
            rows={1}
            dir="auto"
            disabled={!activeSession || !setup.ready || sending}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
          />
          {sending ? (
            <Button type="button" size="icon" variant="outline" aria-label={copy("stop")} onClick={stop}>
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              aria-label={copy("send")}
              disabled={!activeSession || !setup.ready || !draft.trim()}
              onClick={submit}
            >
              <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

export function AiWorkspace() {
  const workspace = useAiWorkspace();
  const mobile = useMobile();
  const [mobilePane, setMobilePane] = useState<"sessions" | "thread">("sessions");

  if (mobile) {
    return (
      <div data-ai-workspace="v2" className="h-full min-h-0 overflow-hidden rounded-xl border bg-card">
        {mobilePane === "sessions" ? (
          <SessionsPane workspace={workspace} onOpen={() => setMobilePane("thread")} />
        ) : (
          <ThreadPane workspace={workspace} onBack={() => setMobilePane("sessions")} />
        )}
      </div>
    );
  }

  return (
    <div
      data-ai-workspace="v2"
      className="grid h-full min-h-0 overflow-hidden rounded-xl border bg-card md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]"
    >
      <SessionsPane workspace={workspace} onOpen={() => undefined} />
      <ThreadPane workspace={workspace} onBack={() => undefined} />
      <div className="hidden min-h-0 border-s xl:block">
        <ContextRail workspace={workspace} />
      </div>
    </div>
  );
}
