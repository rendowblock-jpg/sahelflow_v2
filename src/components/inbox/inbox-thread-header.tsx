"use client";

import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ArrowLeft, Mail, PanelRight, Search, Sparkles } from "lucide-react";

import { StatusControl } from "@/components/inbox/conversation-controls";
import { ConversationStatusBadge } from "@/components/inbox/conversation-status-badge";
import type { InboxMessage } from "@/components/inbox/inbox-workspace-types";
import { MessageExtraction } from "@/components/inbox/message-extraction";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useInboxWorkspace } from "@/hooks/use-inbox-workspace";
import { intlLocale } from "@/lib/utils";

/** "Active …" hint appears only after the thread has been idle this long. */
const LAST_ACTIVE_MIN_IDLE_MS = 5 * 60_000;
const LAST_ACTIVE_REFRESH_MS = 30_000;

function relativeLastActive(
  value: number,
  now: number,
  locale: "ar" | "fr" | "en",
): string {
  const diff = Math.max(0, now - value);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

/**
 * Last-seen fallback (R4-a liveness). The WhatsApp sidecar emits no
 * presence/typing events (SidecarEvent is status/qr/message/message-update
 * only), so the thread header leans on persisted `lastMessageAt` instead of
 * live presence: an obviously-live conversation stays quiet, and once the
 * thread has been idle for 5+ minutes a muted "Active 12 minutes ago" hint
 * appears and refreshes on a slow 30s cadence.
 */
function ThreadLastActive({
  lastMessageAt,
  locale,
  t,
}: {
  lastMessageAt: number | undefined;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastMessageAt) return;
    const idleMs = Date.now() - lastMessageAt;
    // Self-scheduling wake-up: sleep until the indicator becomes visible,
    // then refresh on a slow cadence — never a busy interval.
    const delay =
      idleMs < LAST_ACTIVE_MIN_IDLE_MS
        ? LAST_ACTIVE_MIN_IDLE_MS - idleMs + 1_000
        : LAST_ACTIVE_REFRESH_MS;
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [lastMessageAt, now]);

  if (!lastMessageAt) return null;
  if (now - lastMessageAt < LAST_ACTIVE_MIN_IDLE_MS) return null;

  return (
    <>
      <span aria-hidden="true">·</span>
      <span
        dir="auto"
        data-inbox-last-active="true"
        className="shrink-0 truncate"
      >
        {t("inbox.liveness.lastActive", {
          time: relativeLastActive(lastMessageAt, now, locale),
        })}
      </span>
    </>
  );
}

/**
 * STR-01 header seam: the thread header cluster (identity + liveness hint,
 * status control, in-thread search toggle, mark-unread, the reviewed AI
 * extraction sheet and the end-side context sheet) extracted verbatim from
 * `inbox-v3-thread.tsx`. The conversation context surface is composed by the
 * thread and passed in as `contextPanel`; the search panel below the header
 * and the view state stay in the thread hook.
 */
export function InboxThreadHeader({
  activeChat,
  selectedCandidate,
  isMobile,
  isWhatsAppConversation,
  canUpdateConversation,
  locale,
  t,
  copy,
  markUnread,
  refreshChats,
  threadSearchOpen,
  setThreadSearchOpen,
  onBackToQueue,
  contextPanel,
}: {
  activeChat: NonNullable<ReturnType<typeof useInboxWorkspace>["activeChat"]>;
  selectedCandidate: InboxMessage | null;
  isMobile: boolean;
  isWhatsAppConversation: boolean;
  canUpdateConversation: boolean;
  locale: "ar" | "fr" | "en";
  t: ReturnType<typeof useInboxWorkspace>["t"];
  copy: ReturnType<typeof useInboxWorkspace>["copy"];
  markUnread: ReturnType<typeof useInboxWorkspace>["markUnread"];
  refreshChats: ReturnType<typeof useInboxWorkspace>["refreshChats"];
  threadSearchOpen: boolean;
  setThreadSearchOpen: Dispatch<SetStateAction<boolean>>;
  onBackToQueue: () => void;
  contextPanel: ReactNode;
}) {
  return (
    <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/95 px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {isMobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onBackToQueue}
            aria-label={t("common.backToConversations")}
          >
            <ArrowLeft
              className="size-4 icon-rtl-flip"
              aria-hidden="true"
            />
          </Button>
        ) : null}

        <Avatar className="size-9 border border-border/70 bg-background">
          <AvatarFallback className="bg-primary-soft text-[13px] font-semibold text-primary">
            {activeChat.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h3 dir="auto" className="truncate text-[13px] font-semibold">
              {activeChat.name}
            </h3>
            {canUpdateConversation ? (
              <StatusControl
                key={`${activeChat.conversationId}:${activeChat.workflow.status ?? "open"}`}
                conversationId={activeChat.conversationId}
                initialStatus={activeChat.workflow.status ?? "open"}
                appearance="badge"
                onUpdated={() => void refreshChats()}
              />
            ) : (
              <ConversationStatusBadge
                status={activeChat.workflow.status ?? "open"}
              />
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
            {activeChat.phone ? (
              <span dir="ltr" className="truncate tabular-nums">
                {activeChat.phone}
              </span>
            ) : null}
            {activeChat.phone ? <span aria-hidden="true">·</span> : null}
            <span className="truncate">
              {isWhatsAppConversation ? "WhatsApp" : copy("savedHistory")}
            </span>
            <ThreadLastActive
              lastMessageAt={activeChat.lastMessageAt}
              locale={locale}
              t={t}
            />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copy("searchInChat")}
              aria-pressed={threadSearchOpen}
              onClick={() => setThreadSearchOpen((open) => !open)}
            >
              <Search className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {copy("searchInChat")}
          </TooltipContent>
        </Tooltip>
        {canUpdateConversation ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copy("markUnread")}
                onClick={() => {
                  void markUnread(activeChat).then((updated) => {
                    if (updated) onBackToQueue();
                  });
                }}
              >
                <Mail className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {copy("markUnread")}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {/* The order review is a workspace, not a side drawer: the customer's
            message and the order being built sit side by side, so the
            conversation is never hidden behind a cramped form. */}
        <Dialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={!selectedCandidate || !activeChat.transportId}
                    aria-label={t("inbox.extractOrderProfessionally")}
                  >
                    <Sparkles className="size-4" aria-hidden="true" />
                  </Button>
                </DialogTrigger>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t("inbox.extractOrderProfessionally")}
            </TooltipContent>
          </Tooltip>
          <DialogContent
            data-order-review="true"
            className="order-review-dialog flex flex-col gap-0 overflow-hidden p-0 sm:p-0"
          >
            <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pe-14 text-start">
              <DialogTitle className="flex items-center gap-2.5 text-title-3">
                <span className="flex size-8 items-center justify-center rounded-control bg-primary-soft text-primary">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
                {t("inbox.aiOrderAssistant")}
              </DialogTitle>
              <DialogDescription className="text-body-sm">
                {copy("orderCandidateHint")}
              </DialogDescription>
            </DialogHeader>
            {selectedCandidate && activeChat.transportId ? (
              <MessageExtraction
                key={`${activeChat.conversationId}:${selectedCandidate.id}:header`}
                layout="workspace"
                contactName={activeChat.name}
                conversationId={activeChat.transportId}
                messageId={selectedCandidate.id}
                messageBody={selectedCandidate.body}
                knownPhone={activeChat.phone}
              />
            ) : null}
          </DialogContent>
        </Dialog>

        <Sheet>
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copy("conversationContext")}
                >
                  <PanelRight
                    className="size-4 icon-rtl-flip"
                    aria-hidden="true"
                  />
                </Button>
              </SheetTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {copy("conversationContext")}
            </TooltipContent>
          </Tooltip>
          <SheetContent
            side="end"
            className="w-[min(400px,94vw)] p-0 sm:max-w-none"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{copy("conversationContext")}</SheetTitle>
              <SheetDescription>{activeChat.name}</SheetDescription>
            </SheetHeader>
            {contextPanel}
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
