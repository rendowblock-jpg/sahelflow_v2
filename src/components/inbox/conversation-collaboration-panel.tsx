"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  Loader2,
  MessageSquareText,
  RefreshCw,
  Route,
  Send,
  ShieldAlert,
  UsersRound,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

const COPY = {
  en: {
    trigger: "Team",
    title: "Team workspace",
    description: "Route this conversation and keep private, audited team notes.",
    loading: "Loading current team authority…",
    offline: "You are offline. No collaboration change was submitted.",
    stale: "Your authority is stale or revoked. Sign in again before continuing.",
    noAccess: "You do not have permission to view collaboration details.",
    loadError: "Team workspace could not be loaded. Existing work remains unchanged.",
    retry: "Retry safely",
    routing: "Queue and state",
    queue: "Queue",
    noQueue: "Unassigned queue",
    state: "Work state",
    open: "Open",
    closed: "Closed",
    reason: "Handover reason (optional)",
    saveRoute: "Save routing",
    routeConflict: "Routing changed elsewhere. The latest state was loaded.",
    routeSaved: "Routing saved.",
    comments: "Internal comments",
    emptyComments: "No internal comments yet.",
    commentPlaceholder: "Add an internal note. Customers cannot see this.",
    mentions: "Mention teammates",
    addComment: "Add comment",
    commentConflict: "A teammate added a comment first. The timeline was refreshed.",
    commentSaved: "Internal comment added.",
    saveError: "The change could not be saved. It is safe to retry.",
    permission: "Permission denied. No change was made.",
    owner: "Owner",
    manager: "Manager",
    operator: "Operator",
    viewer: "Viewer",
  },
  fr: {
    trigger: "Équipe",
    title: "Espace d’équipe",
    description: "Acheminez cette conversation et conservez des notes privées et auditées.",
    loading: "Chargement de l’autorité d’équipe actuelle…",
    offline: "Vous êtes hors ligne. Aucun changement de collaboration n’a été envoyé.",
    stale: "Votre autorité est obsolète ou révoquée. Reconnectez-vous avant de continuer.",
    noAccess: "Vous n’avez pas l’autorisation de voir les détails de collaboration.",
    loadError: "Impossible de charger l’espace d’équipe. Le travail existant reste inchangé.",
    retry: "Réessayer en sécurité",
    routing: "File et état",
    queue: "File",
    noQueue: "Aucune file",
    state: "État du travail",
    open: "Ouvert",
    closed: "Fermé",
    reason: "Motif du transfert (facultatif)",
    saveRoute: "Enregistrer l’acheminement",
    routeConflict: "L’acheminement a changé ailleurs. Le dernier état a été chargé.",
    routeSaved: "Acheminement enregistré.",
    comments: "Commentaires internes",
    emptyComments: "Aucun commentaire interne.",
    commentPlaceholder: "Ajoutez une note interne. Le client ne la verra pas.",
    mentions: "Mentionner des coéquipiers",
    addComment: "Ajouter le commentaire",
    commentConflict: "Un coéquipier a commenté avant vous. La chronologie a été actualisée.",
    commentSaved: "Commentaire interne ajouté.",
    saveError: "Impossible d’enregistrer le changement. Vous pouvez réessayer sans risque.",
    permission: "Autorisation refusée. Aucun changement n’a été effectué.",
    owner: "Propriétaire",
    manager: "Responsable",
    operator: "Opérateur",
    viewer: "Lecteur",
  },
  ar: {
    trigger: "الفريق",
    title: "مساحة عمل الفريق",
    description: "وجّه المحادثة واحتفظ بملاحظات داخلية خاصة ومسجلة.",
    loading: "جارٍ تحميل صلاحيات الفريق الحالية…",
    offline: "أنت غير متصل. لم يتم إرسال أي تغيير.",
    stale: "صلاحيتك قديمة أو مسحوبة. سجّل الدخول من جديد قبل المتابعة.",
    noAccess: "ليست لديك صلاحية لعرض تفاصيل التعاون.",
    loadError: "تعذر تحميل مساحة الفريق. بقي العمل الحالي دون تغيير.",
    retry: "إعادة المحاولة بأمان",
    routing: "قائمة الانتظار والحالة",
    queue: "قائمة الانتظار",
    noQueue: "بدون قائمة انتظار",
    state: "حالة العمل",
    open: "مفتوح",
    closed: "مغلق",
    reason: "سبب التسليم (اختياري)",
    saveRoute: "حفظ التوجيه",
    routeConflict: "تغير التوجيه في مكان آخر. تم تحميل أحدث حالة.",
    routeSaved: "تم حفظ التوجيه.",
    comments: "التعليقات الداخلية",
    emptyComments: "لا توجد تعليقات داخلية بعد.",
    commentPlaceholder: "أضف ملاحظة داخلية. لن يراها العميل.",
    mentions: "الإشارة إلى أعضاء الفريق",
    addComment: "إضافة التعليق",
    commentConflict: "أضاف زميل تعليقاً قبلك. تم تحديث السجل.",
    commentSaved: "تمت إضافة التعليق الداخلي.",
    saveError: "تعذر حفظ التغيير. يمكنك إعادة المحاولة بأمان.",
    permission: "تم رفض الصلاحية. لم يتم إجراء أي تغيير.",
    owner: "المالك",
    manager: "مدير",
    operator: "مشغّل",
    viewer: "مشاهد",
  },
} as const;

type Role = "owner" | "manager" | "operator" | "viewer";
type WorkspaceMode = "idle" | "loading" | "ready" | "offline" | "stale" | "permission" | "error";
type Notice = "route-conflict" | "comment-conflict" | "offline" | "stale" | "permission" | "error";

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

function authorityRequiresReauthentication(
  response: Response,
  body: ErrorBody,
): boolean {
  return (
    response.status === 401 ||
    body.code?.includes("STALE") === true ||
    body.code?.includes("REVOKED") === true
  );
}

export function ConversationCollaborationPanel({
  conversationId,
}: {
  conversationId: string;
}) {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
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
      return;
    }
    setMode("loading");
    setNotice(null);
    try {
      const encoded = encodeURIComponent(conversationId);
      const [commentsResponse, routingResponse] = await Promise.all([
        fetch(`/api/collaboration/comments?entityType=conversation&entityId=${encoded}`, {
          cache: "no-store",
        }),
        fetch(`/api/collaboration/routing?entityType=conversation&entityId=${encoded}`, {
          cache: "no-store",
        }),
      ]);
      const [commentsBody, routingBody] = await Promise.all([
        responseBody<CommentsView>(commentsResponse),
        responseBody<RoutingView>(routingResponse),
      ]);
      if (
        authorityRequiresReauthentication(commentsResponse, commentsBody) ||
        authorityRequiresReauthentication(routingResponse, routingBody)
      ) {
        setMode("stale");
        return;
      }
      const commentsDenied = commentsResponse.status === 403;
      const routingDenied = routingResponse.status === 403;
      if (commentsDenied && routingDenied) {
        setMode("permission");
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
    }
  }, [conversationId]);

  useEffect(() => {
    if (!open) return;
    const onOffline = () => setMode("offline");
    const onOnline = () => void load();
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [load, open]);

  const memberById = useMemo(
    () => new Map((comments?.members ?? []).map((member) => [member.memberId, member] as const)),
    [comments?.members],
  );
  const memberLabel = (memberId: string): string => {
    const member = memberById.get(memberId);
    if (!member) return shortId(memberId);
    return `${member.displayName ?? copy[member.role]} · ${copy[member.role]}`;
  };

  const handleFailure = async (
    response: Response,
    body: ErrorBody,
    conflict: Notice,
  ): Promise<void> => {
    if (response.status === 409) {
      setNotice(conflict);
      await load();
      setNotice(conflict);
      return;
    }
    if (authorityRequiresReauthentication(response, body)) {
      setNotice("stale");
      return;
    }
    if (response.status === 403) {
      setNotice("permission");
      return;
    }
    setNotice("error");
  };

  const saveRouting = async () => {
    if (!routing || !routing.permissions.canRoute) return;
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
      const body = await responseBody<{ assignment?: RoutingView["assignment"] }>(response);
      if (!response.ok) {
        await handleFailure(response, body, "route-conflict");
        return;
      }
      routeRequest.current = null;
      setReason("");
      toast.success(copy.routeSaved);
      await load();
    } catch {
      setNotice(navigator.onLine ? "error" : "offline");
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
      mentionMemberIds: [...mentions].sort(),
      expectedVersion: comments.version,
    };
    const fingerprint = JSON.stringify(payload);
    setSavingComment(true);
    setNotice(null);
    try {
      const response = await fetch("/api/collaboration/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          idempotencyKey: keyFor(commentRequest, fingerprint),
        }),
      });
      const body = await responseBody<Record<string, never>>(response);
      if (!response.ok) {
        await handleFailure(response, body, "comment-conflict");
        return;
      }
      commentRequest.current = null;
      setComment("");
      setMentions([]);
      toast.success(copy.commentSaved);
      await load();
    } catch {
      setNotice(navigator.onLine ? "error" : "offline");
    } finally {
      setSavingComment(false);
    }
  };

  const routingChanged = Boolean(
    routing &&
      (queueId !== (routing.assignment.queueId ?? "none") ||
        workState !== routing.assignment.state),
  );
  const noticeText = notice === "route-conflict"
    ? copy.routeConflict
    : notice === "comment-conflict"
      ? copy.commentConflict
      : notice === "offline"
        ? copy.offline
        : notice === "stale"
          ? copy.stale
          : notice === "permission"
            ? copy.permission
            : notice === "error"
              ? copy.saveError
              : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9">
          <UsersRound className="me-2 h-4 w-4" />
          {copy.trigger}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[min(94vw,42rem)] gap-0 sm:max-w-xl">
        <SheetHeader className="border-b pe-12">
          <SheetTitle>{copy.title}</SheetTitle>
          <SheetDescription>{copy.description}</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite">
          {mode === "loading" || mode === "idle" ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.loading}
            </div>
          ) : mode !== "ready" ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
              {mode === "offline" ? <WifiOff className="h-6 w-6 text-warning" /> : <ShieldAlert className="h-6 w-6 text-destructive" />}
              <p className="max-w-sm text-sm text-muted-foreground">
                {mode === "offline"
                  ? copy.offline
                  : mode === "stale"
                    ? copy.stale
                    : mode === "permission"
                      ? copy.noAccess
                      : copy.loadError}
              </p>
              {mode !== "permission" ? (
                <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => void load()}>
                  <RefreshCw className="me-2 h-4 w-4" />
                  {copy.retry}
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-6">
              {noticeText ? (
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  {noticeText}
                </div>
              ) : null}

              {routing ? (
                <section className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{copy.routing}</h3>
                    <Badge variant="outline">{copy[routing.assignment.state]}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1.5 text-sm">
                      <span>{copy.queue}</span>
                      <select
                        className="h-11 rounded-md border bg-background px-3 sm:h-10"
                        value={queueId}
                        disabled={!routing.permissions.canRoute || savingRoute}
                        onChange={(event) => setQueueId(event.target.value)}
                      >
                        <option value="none">{copy.noQueue}</option>
                        {routing.queues.map((queue) => (
                          <option key={queue.id} value={queue.id}>{queue.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm">
                      <span>{copy.state}</span>
                      <select
                        className="h-11 rounded-md border bg-background px-3 sm:h-10"
                        value={workState}
                        disabled={!routing.permissions.canRoute || savingRoute}
                        onChange={(event) => setWorkState(event.target.value as "open" | "closed")}
                      >
                        <option value="open">{copy.open}</option>
                        <option value="closed">{copy.closed}</option>
                      </select>
                    </label>
                  </div>
                  {routing.permissions.canRoute ? (
                    <>
                      <Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={copy.reason} />
                      <Button type="button" className="min-h-11 sm:min-h-9" disabled={!routingChanged || savingRoute} onClick={() => void saveRouting()}>
                        {savingRoute ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Route className="me-2 h-4 w-4" />}
                        {copy.saveRoute}
                      </Button>
                    </>
                  ) : null}
                </section>
              ) : null}

              {comments ? (
                <section className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">{copy.comments}</h3>
                  </div>
                  {comments.comments.length === 0 ? (
                    <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{copy.emptyComments}</p>
                  ) : (
                    <div className="space-y-2">
                      {comments.comments.map((entry) => (
                        <article key={entry.id} className="rounded-lg bg-muted/40 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{memberLabel(entry.authorMemberId)}</span>
                            <time dateTime={entry.createdAt}>
                              {new Date(entry.createdAt).toLocaleString(locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB")}
                            </time>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{entry.body}</p>
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
                    <div className="space-y-3 border-t pt-3">
                      <Textarea value={comment} maxLength={4000} onChange={(event) => setComment(event.target.value)} placeholder={copy.commentPlaceholder} />
                      {comments.members.length > 0 ? (
                        <fieldset className="space-y-2">
                          <legend className="text-xs font-medium text-muted-foreground">{copy.mentions}</legend>
                          <div className="grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2">
                            {comments.members.map((member) => (
                              <label key={member.memberId} className="flex min-h-11 items-center gap-2 rounded-md border p-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={mentions.includes(member.memberId)}
                                  disabled={savingComment}
                                  onChange={(event) => setMentions((current) => event.target.checked ? [...current, member.memberId] : current.filter((id) => id !== member.memberId))}
                                />
                                <span className="truncate">{memberLabel(member.memberId)}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : null}
                      <Button type="button" className="min-h-11 sm:min-h-9" disabled={!comment.trim() || savingComment} onClick={() => void addComment()}>
                        {savingComment ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Send className="me-2 h-4 w-4" />}
                        {copy.addComment}
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
