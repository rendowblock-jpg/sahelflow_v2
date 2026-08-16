"use client";

import { Bot, Loader2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAiWorkspace } from "@/hooks/use-ai-workspace";
import {
  getAiDecisionCopy,
  type AiDecisionLocale,
} from "@/lib/i18n/ai-decision-workspace";
import { cn } from "@/lib/utils";

function sessionDateGroup(value: string): "today" | "yesterday" | "earlier" {
  const date = new Date(value);
  const now = new Date();
  if (Number.isNaN(date.getTime())) return "earlier";

  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  if (date >= startToday) return "today";
  if (date >= startYesterday) return "yesterday";
  return "earlier";
}

function sessionTime(value: string, locale: AiDecisionLocale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-DZ",
    { hour: "2-digit", minute: "2-digit" },
  ).format(date);
}

function groupLabel(
  group: "today" | "yesterday" | "earlier",
  workspace: ReturnType<typeof useAiWorkspace>,
): string {
  if (group === "today") return workspace.copy("today");
  if (group === "yesterday") return workspace.copy("yesterday");
  return getAiDecisionCopy(workspace.locale, "earlier");
}

export function AiWorkHistory({
  workspace,
  navigationLocked,
  onOpenSession,
  onNewAnalysis,
}: {
  workspace: ReturnType<typeof useAiWorkspace>;
  navigationLocked: boolean;
  onOpenSession: (sessionId: string) => void;
  onNewAnalysis: () => void;
}) {
  const {
    sessions,
    activeSessionId,
    loadingSessions,
    creatingSession,
    sending,
    proposals,
    locale,
  } = workspace;
  const reviewCount = proposals.filter((entry) => {
    const state = entry.proposal.executionState ?? entry.proposal.status;
    return ["pending", "approved", "failed", "conflict"].includes(state);
  }).length;
  const groups = ["today", "yesterday", "earlier"] as const;

  return (
    <aside
      data-ai-work-history="true"
      className="flex h-full min-h-0 w-full flex-col border-e bg-muted/[0.035]"
    >
      <div className="border-b px-4 py-4">
        <h2 className="text-sm font-semibold">
          {getAiDecisionCopy(locale, "workHistory")}
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {getAiDecisionCopy(locale, "workHistoryDescription")}
        </p>
        <Button
          type="button"
          size="sm"
          className="mt-3 w-full justify-center"
          disabled={loadingSessions || creatingSession || sending}
          onClick={onNewAnalysis}
        >
          {creatingSession ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          {getAiDecisionCopy(locale, "newAnalysis")}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 px-2.5 py-3">
          {loadingSessions ? (
            <div className="flex min-h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Bot className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{workspace.copy("noSessions")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {workspace.copy("noSessionsDescription")}
              </p>
            </div>
          ) : (
            groups.map((group) => {
              const groupedSessions = sessions.filter(
                (session) => sessionDateGroup(session.updatedAt) === group,
              );
              if (groupedSessions.length === 0) return null;
              return (
                <section key={group} aria-label={groupLabel(group, workspace)}>
                  <p className="px-2 pb-1.5 text-xs font-semibold text-muted-foreground">
                    {groupLabel(group, workspace)}
                  </p>
                  <div className="space-y-1">
                    {groupedSessions.map((session) => {
                      const active = session.id === activeSessionId;
                      const preview = session.messages?.[0]?.content?.trim();
                      return (
                        <button
                          key={session.id}
                          type="button"
                          data-ai-session={session.id}
                          aria-current={active ? "page" : undefined}
                          disabled={navigationLocked}
                          onClick={() => onOpenSession(session.id)}
                          className={cn(
                            "w-full rounded-lg border border-transparent px-3 py-2.5 text-start transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            active
                              ? "border-primary/15 bg-primary/[0.055]"
                              : "hover:bg-muted/55",
                          )}
                        >
                          <span className="flex items-start justify-between gap-2">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                {session.title || workspace.copy("newSessionTitle")}
                              </span>
                              {preview ? (
                                <span
                                  dir="auto"
                                  className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground"
                                >
                                  {preview}
                                </span>
                              ) : null}
                            </span>
                            {active && reviewCount > 0 ? (
                              <Badge variant="outline" className="shrink-0 text-xs">
                                {reviewCount}
                              </Badge>
                            ) : null}
                          </span>
                          <span className="mt-2 block text-xs tabular-nums text-muted-foreground">
                            {sessionTime(session.updatedAt, locale)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
