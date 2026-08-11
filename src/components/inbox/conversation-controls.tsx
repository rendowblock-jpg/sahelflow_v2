"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import { ConversationStatusBadge } from "./conversation-status-badge";
import {
  ChevronDown,
  Flag,
  UserPlus,
  UserMinus,
  BellOff,
  Tag,
  X,
  Plus,
  Circle,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react";

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";
export type ConversationPriority = "urgent" | "high" | "medium" | "low";

export interface ConversationWorkflowState {
  status: ConversationStatus;
  assigneeId: string | null;
  assignmentVersion: number;
  priority: ConversationPriority | null;
  labels: string[] | null;
  snoozedUntil: string | null;
  waitingSince: string | null;
  firstReplyAt: string | null;
}

async function patchJSON(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PATCH ${url} failed: ${response.status}`);
  }
}

export function StatusControl({
  conversationId,
  initialStatus,
  onUpdated,
}: {
  conversationId: string;
  initialStatus: ConversationStatus;
  onUpdated?: (status: ConversationStatus) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ConversationStatus>(initialStatus);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const change = useCallback(
    async (newStatus: ConversationStatus, snoozedUntil?: string) => {
      try {
        await patchJSON(`/api/conversations/${conversationId}/status`, {
          status: newStatus,
          ...(snoozedUntil ? { snoozedUntil } : {}),
        });
        setStatus(newStatus);
        onUpdated?.(newStatus);
      } catch {
        toast.error(t("common.error"));
      }
    },
    [conversationId, onUpdated, t],
  );

  const snoozePresets: { label: string; until: () => string }[] = [
    {
      label: t("inbox.snooze.1hour"),
      until: () => new Date(Date.now() + 3_600_000).toISOString(),
    },
    {
      label: t("inbox.snooze.tomorrow"),
      until: () => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setHours(9, 0, 0, 0);
        return date.toISOString();
      },
    },
    {
      label: t("inbox.snooze.3days"),
      until: () => new Date(Date.now() + 3 * 86_400_000).toISOString(),
    },
    {
      label: t("inbox.snooze.1week"),
      until: () => new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted">
            <ConversationStatusBadge status={status} />
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => void change("open")}>
            <Circle className="me-2 h-4 w-4 text-blue-500" />
            {t("inbox.status.open")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void change("pending")}>
            <Clock className="me-2 h-4 w-4 text-amber-500" />
            {t("inbox.status.pending")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void change("resolved")}>
            <CheckCircle2 className="me-2 h-4 w-4 text-success" />
            {t("inbox.status.resolved")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSnoozeOpen(true)}>
            <BellOff className="me-2 h-4 w-4 text-muted-foreground" />
            {t("inbox.status.snooze")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inbox.snooze.title")}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {snoozePresets.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                onClick={() => {
                  setSnoozeOpen(false);
                  void change("snoozed", preset.until());
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSnoozeOpen(false)}>
              {t("inbox.snooze.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const PRIORITY_CONFIG: Record<
  ConversationPriority,
  { dot: string; label: string }
> = {
  urgent: { dot: "bg-destructive", label: "inbox.priority.urgent" },
  high: { dot: "bg-orange-500", label: "inbox.priority.high" },
  medium: { dot: "bg-blue-500", label: "inbox.priority.medium" },
  low: { dot: "bg-gray-400", label: "inbox.priority.low" },
};

export function PriorityControl({
  conversationId,
  initialPriority,
  onUpdated,
}: {
  conversationId: string;
  initialPriority: ConversationPriority | null;
  onUpdated?: (priority: ConversationPriority | null) => void;
}) {
  const { t } = useI18n();
  const [priority, setPriority] = useState<ConversationPriority | null>(
    initialPriority,
  );

  const change = async (next: ConversationPriority | null) => {
    try {
      await patchJSON(`/api/conversations/${conversationId}/priority`, {
        priority: next,
      });
      setPriority(next);
      onUpdated?.(next);
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted">
          {priority ? (
            <>
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  PRIORITY_CONFIG[priority].dot,
                )}
              />
              {t(PRIORITY_CONFIG[priority].label)}
            </>
          ) : (
            <>
              <Flag className="h-3 w-3 opacity-50" />
              {t("inbox.priority.set")}
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["urgent", "high", "medium", "low"] as ConversationPriority[]).map(
          (value) => (
            <DropdownMenuItem key={value} onClick={() => void change(value)}>
              <span
                className={cn(
                  "me-2 h-2 w-2 rounded-full",
                  PRIORITY_CONFIG[value].dot,
                )}
              />
              {t(PRIORITY_CONFIG[value].label)}
            </DropdownMenuItem>
          ),
        )}
        {priority ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void change(null)}>
              <X className="me-2 h-4 w-4" />
              {t("inbox.priority.clear")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CollaborationAction =
  | "conversations.read"
  | "conversations.claim"
  | "conversations.assign";
type AssignableRole = "owner" | "manager" | "operator";

type AssignmentAuthority = {
  assignment: {
    conversationId: string;
    assigneeId: string | null;
    version: number;
  };
  currentActor: {
    personId: string | null;
    memberId: string | null;
    role: "owner" | "manager" | "operator" | "viewer" | null;
    allowedActions: CollaborationAction[];
    shopId: string;
  };
  assignableMembers: Array<{
    memberId: string;
    displayName: string | null;
    role: AssignableRole;
  }>;
  error?: string;
};

const ASSIGNMENT_COPY = {
  en: {
    unassigned: "Unassigned",
    owner: "Workspace owner",
    loading: "Loading assignment…",
    loadError: "Assignment authority could not be loaded.",
    refresh: "Refresh",
    claim: "Claim conversation",
    release: "Release my assignment",
    assign: "Assign or hand over",
    remove: "Remove assignment",
    noTargets: "No active members are available for this shop.",
    conflict: "Assignment changed elsewhere. The latest state was loaded.",
    saveError: "The assignment could not be saved.",
    manager: "Manager",
    operator: "Operator",
  },
  fr: {
    unassigned: "Non attribuée",
    owner: "Propriétaire de l’espace",
    loading: "Chargement de l’attribution…",
    loadError: "Impossible de charger l’autorité d’attribution.",
    refresh: "Actualiser",
    claim: "Prendre la conversation",
    release: "Libérer mon attribution",
    assign: "Attribuer ou transférer",
    remove: "Retirer l’attribution",
    noTargets: "Aucun membre actif n’est disponible pour cette boutique.",
    conflict: "L’attribution a changé ailleurs. Le dernier état a été chargé.",
    saveError: "Impossible d’enregistrer l’attribution.",
    manager: "Responsable",
    operator: "Opérateur",
  },
  ar: {
    unassigned: "غير مسندة",
    owner: "مالك مساحة العمل",
    loading: "جارٍ تحميل الإسناد…",
    loadError: "تعذر تحميل صلاحية الإسناد.",
    refresh: "تحديث",
    claim: "استلام المحادثة",
    release: "تحرير الإسناد الخاص بي",
    assign: "إسناد أو تسليم",
    remove: "إزالة الإسناد",
    noTargets: "لا يوجد أعضاء نشطون متاحون لهذا المتجر.",
    conflict: "تغيّر الإسناد في مكان آخر. تم تحميل أحدث حالة.",
    saveError: "تعذر حفظ الإسناد.",
    manager: "مدير",
    operator: "مشغّل",
  },
} as const;

function shortMemberId(value: string): string {
  return value.length <= 12 ? value : `…${value.slice(-12)}`;
}

export function AssigneeControl({
  conversationId,
  initialAssignee,
  initialVersion,
  onUpdated,
}: {
  conversationId: string;
  initialAssignee: string | null;
  initialVersion: number;
  onUpdated?: (assigneeId: string | null, version: number) => void;
}) {
  const { locale } = useI18n();
  const copy = ASSIGNMENT_COPY[locale];
  const [assigneeId, setAssigneeId] = useState<string | null>(initialAssignee);
  const [version, setVersion] = useState(initialVersion);
  const [authority, setAuthority] = useState<
    AssignmentAuthority["currentActor"] | null
  >(null);
  const [members, setMembers] = useState<
    AssignmentAuthority["assignableMembers"]
  >([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<{ fingerprint: string; key: string } | null>(null);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/assign`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as AssignmentAuthority;
      if (!response.ok) throw new Error(body.error ?? copy.loadError);
      setAssigneeId(body.assignment.assigneeId);
      setVersion(body.assignment.version);
      setAuthority(body.currentActor);
      setMembers(body.assignableMembers);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [conversationId, copy.loadError]);

  useEffect(() => {
    requestRef.current = null;
    const timeoutId = globalThis.setTimeout(() => {
      void hydrate();
    }, 0);
    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [hydrate]);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.memberId, member] as const)),
    [members],
  );
  const assigneeLabel = useMemo(() => {
    if (!assigneeId) return copy.unassigned;
    const member = memberById.get(assigneeId);
    if (member?.displayName) return member.displayName;
    if (
      authority?.memberId === assigneeId &&
      authority.role === "owner"
    ) {
      return copy.owner;
    }
    return shortMemberId(assigneeId);
  }, [assigneeId, authority, copy.owner, copy.unassigned, memberById]);

  const canClaim =
    authority?.allowedActions.includes("conversations.claim") ?? false;
  const canAssign =
    authority?.allowedActions.includes("conversations.assign") ?? false;
  const isSelf = Boolean(
    assigneeId && authority?.memberId && assigneeId === authority.memberId,
  );
  const canClaimNow = canClaim && !assigneeId;
  const canReleaseNow = canClaim && isSelf;
  const hasAvailableAction = canAssign || canClaimNow || canReleaseNow;

  const idempotencyKey = (fingerprint: string): string => {
    if (requestRef.current?.fingerprint === fingerprint) {
      return requestRef.current.key;
    }
    const key = globalThis.crypto.randomUUID();
    requestRef.current = { fingerprint, key };
    return key;
  };

  const submit = async (
    operation: "claim" | "release" | "assign" | "unassign",
    targetMemberId?: string,
  ) => {
    const fingerprint = JSON.stringify({
      conversationId,
      operation,
      targetMemberId: targetMemberId ?? null,
      expectedVersion: version,
    });
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/conversations/${encodeURIComponent(conversationId)}/assign`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation,
            ...(targetMemberId ? { targetMemberId } : {}),
            expectedVersion: version,
            idempotencyKey: idempotencyKey(fingerprint),
          }),
        },
      );
      const body = (await response.json()) as {
        assignment?: {
          assignee: { memberId: string } | null;
          version: number;
        };
        error?: string;
      };
      if (!response.ok) {
        if (response.status === 409) {
          requestRef.current = null;
          await hydrate();
          throw new Error(copy.conflict);
        }
        throw new Error(body.error ?? copy.saveError);
      }
      if (!body.assignment) throw new Error(copy.saveError);
      const nextAssigneeId = body.assignment.assignee?.memberId ?? null;
      setAssigneeId(nextAssigneeId);
      setVersion(body.assignment.version);
      requestRef.current = null;
      setOpen(false);
      onUpdated?.(nextAssigneeId, body.assignment.version);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : copy.saveError;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && !error && !hasAvailableAction) {
    return (
      <span className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-muted-foreground">
        <UserPlus className="h-3 w-3 opacity-50" />
        {assigneeLabel}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UserPlus className="h-3 w-3 opacity-50" />
          )}
          {loading ? copy.loading : assigneeLabel}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        {error ? (
          <div className="mb-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <p>{error}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1 h-7 px-2"
              onClick={() => void hydrate()}
            >
              <RefreshCw className="me-1 h-3 w-3" />
              {copy.refresh}
            </Button>
          </div>
        ) : null}

        {canClaimNow ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mb-2 w-full justify-start"
            disabled={submitting}
            onClick={() => void submit("claim")}
          >
            <UserPlus className="me-2 h-4 w-4" />
            {copy.claim}
          </Button>
        ) : null}
        {canReleaseNow ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mb-2 w-full justify-start"
            disabled={submitting}
            onClick={() => void submit("release")}
          >
            <UserMinus className="me-2 h-4 w-4" />
            {copy.release}
          </Button>
        ) : null}

        {canAssign ? (
          <>
            <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
              {copy.assign}
            </p>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {members.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  {copy.noTargets}
                </p>
              ) : (
                members.map((member) => (
                  <Button
                    key={member.memberId}
                    type="button"
                    size="sm"
                    variant={
                      member.memberId === assigneeId ? "secondary" : "ghost"
                    }
                    className="w-full justify-between"
                    disabled={submitting || member.memberId === assigneeId}
                    onClick={() => void submit("assign", member.memberId)}
                  >
                    <span className="truncate">
                      {member.displayName ?? copy.owner}
                    </span>
                    <span className="ms-2 text-[11px] text-muted-foreground">
                      {member.role === "owner"
                        ? copy.owner
                        : member.role === "manager"
                          ? copy.manager
                          : copy.operator}
                    </span>
                  </Button>
                ))
              )}
            </div>
            {assigneeId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2 w-full justify-start text-destructive hover:text-destructive"
                disabled={submitting}
                onClick={() => void submit("unassign")}
              >
                <UserMinus className="me-2 h-4 w-4" />
                {copy.remove}
              </Button>
            ) : null}
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function LabelsControl({
  conversationId,
  initialLabels,
  onUpdated,
}: {
  conversationId: string;
  initialLabels: string[] | null;
  onUpdated?: (labels: string[]) => void;
}) {
  const { t } = useI18n();
  const [labels, setLabels] = useState<string[]>(initialLabels ?? []);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const putLabels = async (next: string[]) => {
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/labels`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ labels: next }),
        },
      );
      if (!response.ok) throw new Error(`PUT labels failed: ${response.status}`);
      setLabels(next);
      setDraft("");
      onUpdated?.(next);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const addLabel = () => {
    const value = draft.trim();
    if (!value || labels.includes(value)) {
      setDraft("");
      return;
    }
    if (labels.length >= 50) return;
    void putLabels([...labels, value]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted">
          <Tag className="h-3 w-3 opacity-50" />
          {labels.length > 0
            ? t("inbox.labels.count", { count: labels.length })
            : t("inbox.labels.add")}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {labels.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} variant="secondary" className="gap-1 text-xs">
                {label}
                <button
                  onClick={() =>
                    void putLabels(labels.filter((entry) => entry !== label))
                  }
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex gap-1">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("inbox.labels.placeholder")}
            className="h-8 text-xs"
            onKeyDown={(event) => {
              if (event.key === "Enter") addLabel();
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-8 px-2"
            disabled={!draft.trim()}
            onClick={addLabel}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type AssignmentActivityPayload = {
  kind: "conversation_assignment";
  activityType:
    | "assignment_claimed"
    | "assignment_released"
    | "assignment_assigned"
    | "assignment_handed_over"
    | "assignment_unassigned";
  toDisplayName: string | null;
  toMemberId: string | null;
};

function assignmentActivityText(
  body: string,
  locale: "ar" | "fr" | "en",
): string {
  let payload: AssignmentActivityPayload;
  try {
    payload = JSON.parse(body) as AssignmentActivityPayload;
  } catch {
    return body;
  }
  if (payload.kind !== "conversation_assignment") return body;
  const target =
    payload.toDisplayName ??
    (payload.toMemberId ? shortMemberId(payload.toMemberId) : "");

  if (locale === "ar") {
    switch (payload.activityType) {
      case "assignment_claimed":
        return "تم استلام المحادثة";
      case "assignment_released":
        return "تم تحرير الإسناد";
      case "assignment_assigned":
        return `تم إسناد المحادثة إلى ${target}`;
      case "assignment_handed_over":
        return `تم تسليم المحادثة إلى ${target}`;
      case "assignment_unassigned":
        return "تمت إزالة الإسناد";
    }
  }
  if (locale === "fr") {
    switch (payload.activityType) {
      case "assignment_claimed":
        return "Conversation prise en charge";
      case "assignment_released":
        return "Attribution libérée";
      case "assignment_assigned":
        return `Conversation attribuée à ${target}`;
      case "assignment_handed_over":
        return `Conversation transférée à ${target}`;
      case "assignment_unassigned":
        return "Attribution retirée";
    }
  }
  switch (payload.activityType) {
    case "assignment_claimed":
      return "Conversation claimed";
    case "assignment_released":
      return "Assignment released";
    case "assignment_assigned":
      return `Conversation assigned to ${target}`;
    case "assignment_handed_over":
      return `Conversation handed over to ${target}`;
    case "assignment_unassigned":
      return "Assignment removed";
  }
}

export function ActivityMessage({
  body,
  timestamp,
}: {
  body: string;
  timestamp: number;
}) {
  const { locale } = useI18n();
  return (
    <div className="flex justify-center py-1">
      <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        <span>{assignmentActivityText(body, locale)}</span>
        <span className="opacity-60">
          {new Date(timestamp).toLocaleTimeString(
            locale === "ar" ? "ar" : locale === "en" ? "en-US" : "fr-FR",
            { hour: "2-digit", minute: "2-digit" },
          )}
        </span>
      </div>
    </div>
  );
}

export function ConversationControls({
  conversationId,
  initial,
  canUpdate,
  onUpdated,
}: {
  conversationId: string;
  initial: Partial<ConversationWorkflowState>;
  canUpdate: boolean;
  onUpdated?: () => void;
}) {
  const labelsKey = (initial.labels ?? []).join("\u001f");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canUpdate ? (
        <>
          <StatusControl
            key={`status:${conversationId}:${initial.status ?? "open"}`}
            conversationId={conversationId}
            initialStatus={initial.status ?? "open"}
            onUpdated={onUpdated}
          />
          <PriorityControl
            key={`priority:${conversationId}:${initial.priority ?? "none"}`}
            conversationId={conversationId}
            initialPriority={initial.priority ?? null}
            onUpdated={onUpdated}
          />
        </>
      ) : null}
      <AssigneeControl
        key={`assignee:${conversationId}:${initial.assignmentVersion ?? 0}:${initial.assigneeId ?? "none"}`}
        conversationId={conversationId}
        initialAssignee={initial.assigneeId ?? null}
        initialVersion={initial.assignmentVersion ?? 0}
        onUpdated={onUpdated}
      />
      {canUpdate ? (
        <LabelsControl
          key={`labels:${conversationId}:${labelsKey}`}
          conversationId={conversationId}
          initialLabels={initial.labels ?? null}
          onUpdated={onUpdated}
        />
      ) : null}
    </div>
  );
}
