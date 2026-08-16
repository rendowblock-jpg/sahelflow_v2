"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Loader2, RefreshCw, Send, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { getInboxWorkspaceCopy } from "@/lib/i18n/inbox-workspace";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Role = "owner" | "manager" | "operator" | "viewer";
type Mode = "idle" | "loading" | "ready" | "offline" | "stale" | "denied" | "error";

type Member = {
  memberId: string;
  displayName: string | null;
  role: Role;
};

type CommentView = {
  id: string;
  authorMemberId: string;
  body: string;
  mentionMemberIds: string[];
  createdAt: string;
};

type CommentsView = {
  comments: CommentView[];
  version: number;
  members: Member[];
  permissions: { canWrite: boolean };
};

type RoutingView = {
  assignment: {
    queueId: string | null;
    state: "open" | "closed";
  };
  queues: Array<{ id: string; name: string; workgroupId: string | null }>;
  version: number;
  permissions: { canRoute: boolean };
};

type ErrorBody = { error?: string; code?: string };

function shortId(value: string): string {
  return value.length <= 10 ? value : `…${value.slice(-10)}`;
}

async function responseBody<T>(response: Response): Promise<T & ErrorBody> {
  return (await response.json()) as T & ErrorBody;
}

function needsReauthentication(response: Response, body: ErrorBody): boolean {
  return (
    response.status === 401 ||
    body.code?.includes("STALE") === true ||
    body.code?.includes("REVOKED") === true
  );
}

export function ConversationCollaborationInline({
  conversationId,
}: {
  conversationId: string;
}) {
  const { locale } = useI18n();
  const copy = useCallback(
    (
      key: Parameters<typeof getInboxWorkspaceCopy>[1],
      params?: Record<string, string | number>,
    ) => getInboxWorkspaceCopy(locale, key, params),
    [locale],
  );
  const [mode, setMode] = useState<Mode>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentsView | null>(null);
  const [routing, setRouting] = useState<RoutingView | null>(null);
  const [queueId, setQueueId] = useState("none");
  const [workState, setWorkState] = useState<"open" | "closed">("open");
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [savingRoute, setSavingRoute] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const routeRequest = useRef<{ fingerprint: string; key: string } | null>(null);
  const commentRequest = useRef<{ fingerprint: string; key: string } | null>(null);

  const keyFor = (
    ref: MutableRefObject<{ fingerprint: string; key: string } | null>,
    fingerprint: string,
  ): string => {
    if (ref.current?.fingerprint === fingerprint) return ref.current.key;
    const key = globalThis.crypto.randomUUID();
    ref.current = { fingerprint, key };
    return key;
  };

  const load = useCallback(async () => {
    if (!navigator.onLine) {
      setMode("offline");
      setNotice(copy("collaborationOffline"));
      return;
    }
    setMode("loading");
    setNotice(null);
    try {
      const encoded = encodeURIComponent(conversationId);
      const [commentsResponse, routingResponse] = await Promise.all([
        fetch(
          `/api/collaboration/comments?entityType=conversation&entityId=${encoded}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/collaboration/routing?entityType=conversation&entityId=${encoded}`,
          { cache: "no-store" },
        ),
      ]);
      const [commentsBody, routingBody] = await Promise.all([
        responseBody<CommentsView>(commentsResponse),
        responseBody<RoutingView>(routingResponse),
      ]);

      if (
        needsReauthentication(commentsResponse, commentsBody) ||
        needsReauthentication(routingResponse, routingBody)
      ) {
        setMode("stale");
        setNotice(copy("collaborationStale"));
        return;
      }

      const commentsDenied = commentsResponse.status === 403;
      const routingDenied = routingResponse.status === 403;
      if (commentsDenied && routingDenied) {
        setMode("denied");
        setNotice(copy("collaborationDenied"));
        return;
      }
      if (!commentsResponse.ok && !commentsDenied) throw new Error(commentsBody.error);
      if (!routingResponse.ok && !routingDenied) throw new Error(routingBody.error);

      setComments(commentsDenied ? null : commentsBody);
      setRouting(routingDenied ? null : routingBody);
      if (!routingDenied) {
        setQueueId(routingBody.assignment.queueId ?? "none");
        setWorkState(routingBody.assignment.state);
      }
      setMode("ready");
    } catch {
      setMode(navigator.onLine ? "error" : "offline");
      setNotice(
        navigator.onLine
          ? copy("collaborationUnavailable")
          : copy("collaborationOffline"),
      );
    }
  }, [conversationId, copy]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const handleOffline = () => {
      setMode("offline");
      setNotice(copy("collaborationOffline"));
    };
    const handleOnline = () => void load();
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [copy, load]);

  const memberById = useMemo(
    () => new Map((comments?.members ?? []).map((member) => [member.memberId, member] as const)),
    [comments?.members],
  );
  const memberLabel = (memberId: string): string => {
    const member = memberById.get(memberId);
    if (!member) return shortId(memberId);
    return `${member.displayName ?? copy(member.role)} · ${copy(member.role)}`;
  };

  const handleFailure = async (
    response: Response,
    body: ErrorBody,
  ): Promise<void> => {
    if (response.status === 409) {
      await load();
      setNotice(copy("conflictReloaded"));
      return;
    }
    if (needsReauthentication(response, body)) {
      setMode("stale");
      setNotice(copy("collaborationStale"));
      return;
    }
    if (response.status === 403) {
      setMode("denied");
      setNotice(copy("collaborationDenied"));
      return;
    }
    setNotice(copy("collaborationUnavailable"));
  };

  const saveRouting = async () => {
    if (!routing?.permissions.canRoute) return;
    const payload: Record<string, unknown> = {
      entityType: "conversation",
      entityId: conversationId,
      expectedVersion: routing.version,
      reason: reason.trim() || undefined,
    };
    if (queueId !== (routing.assignment.queueId ?? "none")) {
      if (queueId === "none") payload.clearQueue = true;
      else payload.targetQueueId = queueId;
    }
    if (workState !== routing.assignment.state) payload.targetState = workState;
    const fingerprint = JSON.stringify(payload);
    payload.idempotencyKey = keyFor(routeRequest, fingerprint);

    setSavingRoute(true);
    setNotice(null);
    try {
      const response = await fetch("/api/collaboration/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await responseBody<Record<string, never>>(response);
      if (!response.ok) {
        await handleFailure(response, body);
        return;
      }
      routeRequest.current = null;
      setReason("");
      toast.success(copy("routingSaved"));
      await load();
    } catch {
      setNotice(
        navigator.onLine
          ? copy("collaborationUnavailable")
          : copy("collaborationOffline"),
      );
    } finally {
      setSavingRoute(false);
    }
  };

  const addComment = async () => {
    if (!comments?.permissions.canWrite || !comment.trim()) return;
    const payload = {
      entityType: "conversation" as const,
      entityId: conversationId,
      body: comment.trim(),
      mentionMemberIds: mentions,
      expectedVersion: comments.version,
    };
    const fingerprint = JSON.stringify(payload);
    const body = {
      ...payload,
      idempotencyKey: keyFor(commentRequest, fingerprint),
    };

    setSavingComment(true);
    setNotice(null);
    try {
      const response = await fetch("/api/collaboration/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseJson = await responseBody<Record<string, never>>(response);
      if (!response.ok) {
        await handleFailure(response, responseJson);
        return;
      }
      commentRequest.current = null;
      setComment("");
      setMentions([]);
      toast.success(copy("noteSaved"));
      await load();
    } catch {
      setNotice(
        navigator.onLine
          ? copy("collaborationUnavailable")
          : copy("collaborationOffline"),
      );
    } finally {
      setSavingComment(false);
    }
  };

  const routingChanged = Boolean(
    routing &&
      (queueId !== (routing.assignment.queueId ?? "none") ||
        workState !== routing.assignment.state),
  );

  if (mode === "idle" || mode === "loading") {
    return (
      <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
        {copy("teamOperations")}
      </div>
    );
  }

  if (mode !== "ready" && !comments && !routing) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
        <p>{notice}</p>
        {mode === "error" || mode === "offline" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => void load()}
          >
            <RefreshCw className="me-1.5 size-3.5" aria-hidden="true" />
            {copy("retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {notice ? (
        <div className="rounded-md border bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {notice}
        </div>
      ) : null}

      {routing ? (
        <section className="space-y-3" aria-labelledby={`routing-${conversationId}`}>
          <div className="flex items-center justify-between gap-2">
            <h4 id={`routing-${conversationId}`} className="text-sm font-semibold">
              {copy("routing")}
            </h4>
            <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 min-[1500px]:grid-cols-1">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span>{copy("queue")}</span>
              <select
                value={queueId}
                onChange={(event) => setQueueId(event.target.value)}
                disabled={!routing.permissions.canRoute || savingRoute}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="none">{copy("noQueue")}</option>
                {routing.queues.map((queue) => (
                  <option key={queue.id} value={queue.id}>
                    {queue.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span>{copy("workState")}</span>
              <select
                value={workState}
                onChange={(event) =>
                  setWorkState(event.target.value === "closed" ? "closed" : "open")
                }
                disabled={!routing.permissions.canRoute || savingRoute}
                className="h-9 w-full rounded-md border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="open">{copy("openWork")}</option>
                <option value="closed">{copy("closedWork")}</option>
              </select>
            </label>
          </div>

          {routing.permissions.canRoute ? (
            <div className="space-y-2">
              <Input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={copy("handoverReason")}
                maxLength={500}
                disabled={savingRoute}
                className="h-9 text-sm"
              />
              <Button
                type="button"
                size="sm"
                disabled={!routingChanged || savingRoute}
                onClick={() => void saveRouting()}
              >
                {savingRoute ? (
                  <Loader2 className="me-1.5 size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {copy("saveRouting")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {comments ? (
        <section className="space-y-3 border-t pt-4" aria-labelledby={`notes-${conversationId}`}>
          <h4 id={`notes-${conversationId}`} className="text-sm font-semibold">
            {copy("internalNotes")}
          </h4>

          {comments.comments.length === 0 ? (
            <p className="rounded-lg bg-muted/35 p-3 text-sm leading-5 text-muted-foreground">
              {copy("noInternalNotes")}
            </p>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto pe-1">
              {comments.comments.map((entry) => (
                <article key={entry.id} className="rounded-lg bg-muted/35 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{memberLabel(entry.authorMemberId)}</span>
                    <time dateTime={entry.createdAt}>
                      {new Intl.DateTimeFormat(
                        locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB",
                        { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" },
                      ).format(new Date(entry.createdAt))}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-5">
                    {entry.body}
                  </p>
                  {entry.mentionMemberIds.length > 0 ? (
                    <p className="mt-2 text-xs text-primary">
                      {entry.mentionMemberIds.map(memberLabel).join(" · ")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}

          {comments.permissions.canWrite ? (
            <div className="space-y-2.5">
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={copy("notePlaceholder")}
                maxLength={4000}
                rows={2}
                className="min-h-20 text-sm"
              />
              {comments.members.length > 0 ? (
                <details className="rounded-md border bg-muted/15 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    {copy("mentions")}
                  </summary>
                  <div className="mt-2 grid max-h-32 gap-1.5 overflow-y-auto">
                    {comments.members.map((member) => {
                      const checked = mentions.includes(member.memberId);
                      return (
                        <label
                          key={member.memberId}
                          className={cn(
                            "flex min-h-9 items-center gap-2 rounded-md px-2 text-xs",
                            checked ? "bg-primary/8 text-foreground" : "hover:bg-muted/60",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={savingComment}
                            onChange={(event) =>
                              setMentions((current) =>
                                event.target.checked
                                  ? [...current, member.memberId]
                                  : current.filter((id) => id !== member.memberId),
                              )
                            }
                          />
                          <span className="min-w-0 truncate">{memberLabel(member.memberId)}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={!comment.trim() || savingComment}
                onClick={() => void addComment()}
              >
                {savingComment ? (
                  <Loader2 className="me-1.5 size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="me-1.5 size-3.5" aria-hidden="true" />
                )}
                {copy("addNote")}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
