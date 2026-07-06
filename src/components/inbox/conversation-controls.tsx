"use client";

/**
 * Conversation workflow controls (B1 — Session 28).
 *
 * Self-contained controls for the inbox thread header:
 *   - StatusControl  (open / pending / resolved / snoozed + snooze dialog)
 *   - PriorityControl (urgent / high / medium / low / clear)
 *   - AssigneeControl (free-text combobox — no User table)
 *   - LabelsControl   (add / remove chips, PUT full array)
 *   - ActivityMessage (renders direction:"system" / messageType:"activity")
 *
 * Each control takes a `conversationId` + initial value and PATCHes the
 * matching API route on change. State is held locally so the controls work
 * without a full SWR refactor of inbox-live.tsx.
 *
 * NOTE: live WhatsApp chats have no Conversation DB row (their id is a JID).
 * The GET /api/conversations/[id] 404s for them, so controls default to
 * "open"/null and PATCHes fail silently (best-effort, matching the prior
 * ConversationStatusDropdown behaviour). Lazy-hydration is a follow-up.
 */
import { useState, useCallback } from "react";
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
} from "lucide-react";

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";
export type ConversationPriority = "urgent" | "high" | "medium" | "low";

export interface ConversationWorkflowState {
  status: ConversationStatus;
  assigneeId: string | null;
  priority: ConversationPriority | null;
  labels: string[] | null;
  snoozedUntil: string | null;
  waitingSince: string | null;
  firstReplyAt: string | null;
}

// ── helpers ──────────────────────────────────────────────────────────────
async function patchJSON(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── StatusControl (with snooze dialog) ───────────────────────────────────
export function StatusControl({
  conversationId,
  initialStatus,
  onUpdated,
}: {
  conversationId: string;
  initialStatus: ConversationStatus;
  onUpdated?: (s: ConversationStatus) => void;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<ConversationStatus>(initialStatus);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const change = useCallback(async (newStatus: ConversationStatus, snoozedUntil?: string) => {
    const ok = await patchJSON(`/api/conversations/${conversationId}/status`, {
      status: newStatus,
      ...(snoozedUntil ? { snoozedUntil } : {}),
    });
    if (ok) {
      setStatus(newStatus);
      onUpdated?.(newStatus);
    }
  }, [conversationId, onUpdated]);

  const snooze = async (until: string) => {
    setSnoozeOpen(false);
    await change("snoozed", until);
  };

  const snoozePresets: { label: string; until: () => string }[] = [
    { label: t("inbox.snooze.1hour") || "1 hour", until: () => new Date(Date.now() + 3600_000).toISOString() },
    { label: t("inbox.snooze.tomorrow") || "Tomorrow 9am", until: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d.toISOString(); } },
    { label: t("inbox.snooze.3days") || "3 days", until: () => new Date(Date.now() + 3 * 86400_000).toISOString() },
    { label: t("inbox.snooze.1week") || "1 week", until: () => new Date(Date.now() + 7 * 86400_000).toISOString() },
  ];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors">
            <ConversationStatusBadge status={status} />
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => change("open")}>
            <Circle className="me-2 h-4 w-4 text-blue-500" />
            {t("inbox.status.open") || "Open"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => change("pending")}>
            <Clock className="me-2 h-4 w-4 text-amber-500" />
            {t("inbox.status.pending") || "Pending"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => change("resolved")}>
            <CheckCircle2 className="me-2 h-4 w-4 text-emerald-500" />
            {t("inbox.status.resolved") || "Resolve"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSnoozeOpen(true)}>
            <BellOff className="me-2 h-4 w-4 text-muted-foreground" />
            {t("inbox.status.snooze") || "Snooze"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("inbox.snooze.title") || "Snooze conversation"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {snoozePresets.map((p) => (
              <Button key={p.label} variant="outline" onClick={() => snooze(p.until())}>
                {p.label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSnoozeOpen(false)}>
              {t("inbox.snooze.cancel") || "Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── PriorityControl ──────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<ConversationPriority, { dot: string; label: string }> = {
  urgent: { dot: "bg-red-500", label: "inbox.priority.urgent" },
  high: { dot: "bg-orange-500", label: "inbox.priority.high" },
  medium: { dot: "bg-blue-500", label: "inbox.priority.medium" },
  low: { dot: "bg-gray-400", label: "inbox.priority.low" },
};

export function PriorityControl({
  conversationId,
  initialPriority,
}: {
  conversationId: string;
  initialPriority: ConversationPriority | null;
}) {
  const { t } = useI18n();
  const [priority, setPriority] = useState<ConversationPriority | null>(initialPriority);

  const change = async (p: ConversationPriority | null) => {
    const ok = await patchJSON(`/api/conversations/${conversationId}/priority`, { priority: p });
    if (ok) setPriority(p);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors">
          {priority ? (
            <>
              <span className={cn("h-2 w-2 rounded-full", PRIORITY_CONFIG[priority].dot)} />
              {t(PRIORITY_CONFIG[priority].label) || priority}
            </>
          ) : (
            <>
              <Flag className="h-3 w-3 opacity-50" />
              {t("inbox.priority.set") || "Set priority"}
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(["urgent", "high", "medium", "low"] as ConversationPriority[]).map((p) => (
          <DropdownMenuItem key={p} onClick={() => change(p)}>
            <span className={cn("me-2 h-2 w-2 rounded-full", PRIORITY_CONFIG[p].dot)} />
            {t(PRIORITY_CONFIG[p].label) || p}
          </DropdownMenuItem>
        ))}
        {priority && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => change(null)}>
              <X className="me-2 h-4 w-4" />
              {t("inbox.priority.clear") || "Clear priority"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── AssigneeControl (free-text — no User table) ──────────────────────────
export function AssigneeControl({
  conversationId,
  initialAssignee,
}: {
  conversationId: string;
  initialAssignee: string | null;
}) {
  const { t } = useI18n();
  const [assignee, setAssignee] = useState<string | null>(initialAssignee);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const assign = async (name: string | null) => {
    const ok = await patchJSON(`/api/conversations/${conversationId}/assign`, { assignee: name });
    if (ok) { setAssignee(name); setOpen(false); setDraft(""); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors">
          <UserPlus className="h-3 w-3 opacity-50" />
          {assignee ?? (t("inbox.assignee.unassigned") || "Unassigned")}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="flex gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("inbox.assignee.placeholder") || "Type a name…"}
            className="h-8 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) assign(draft.trim()); }}
          />
          <Button size="sm" variant="secondary" className="h-8 px-2" disabled={!draft.trim()} onClick={() => assign(draft.trim())}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {assignee && (
          <Button size="sm" variant="ghost" className="mt-2 w-full justify-start text-xs" onClick={() => assign(null)}>
            <UserMinus className="me-2 h-3 w-3" />
            {t("inbox.assignee.clear") || "Clear assignment"}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── LabelsControl (PUT full array) ───────────────────────────────────────
export function LabelsControl({
  conversationId,
  initialLabels,
}: {
  conversationId: string;
  initialLabels: string[] | null;
}) {
  const { t } = useI18n();
  const [labels, setLabels] = useState<string[]>(initialLabels ?? []);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  // Session 30 (AUDIT-5 C9): the old save() function was dead code — it
  // PATCHed a PUT-only route and discarded the result (`void ok`). Removed.
  const putLabels = async (next: string[]) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/labels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: next }),
      });
      if (res.ok) { setLabels(next); setDraft(""); }
    } catch { /* best-effort */ }
  };

  const addLabel = () => {
    const v = draft.trim();
    if (!v || labels.includes(v)) { setDraft(""); return; }
    if (labels.length >= 50) return;
    void putLabels([...labels, v]);
  };
  const removeLabel = (l: string) => void putLabels(labels.filter((x) => x !== l));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors">
          <Tag className="h-3 w-3 opacity-50" />
          {labels.length > 0
            ? (t("inbox.labels.count", { count: labels.length }) || `${labels.length} labels`)
            : (t("inbox.labels.add") || "Add label")}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {labels.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {labels.map((l) => (
              <Badge key={l} variant="secondary" className="gap-1 text-xs">
                {l}
                <button onClick={() => removeLabel(l)} className="hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("inbox.labels.placeholder") || "Label name…"}
            className="h-8 text-xs"
            onKeyDown={(e) => { if (e.key === "Enter") addLabel(); }}
          />
          <Button size="sm" variant="secondary" className="h-8 px-2" disabled={!draft.trim()} onClick={addLabel}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── ActivityMessage (renders system/activity messages as a centered pill) ─
export function ActivityMessage({ body, timestamp }: { body: string; timestamp: number }) {
  const { t, locale } = useI18n();
  void t;
  return (
    <div className="flex justify-center py-1">
      <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        <span>{body}</span>
        <span className="opacity-60">
          {new Date(timestamp).toLocaleTimeString(locale === "ar" ? "ar" : locale === "en" ? "en-US" : "fr-FR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}

// ── Cluster wrapper ──────────────────────────────────────────────────────
export function ConversationControls({
  conversationId,
  initial,
}: {
  conversationId: string;
  initial: Partial<ConversationWorkflowState>;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <StatusControl
        conversationId={conversationId}
        initialStatus={initial.status ?? "open"}
      />
      <PriorityControl
        conversationId={conversationId}
        initialPriority={initial.priority ?? null}
      />
      <AssigneeControl
        conversationId={conversationId}
        initialAssignee={initial.assigneeId ?? null}
      />
      <LabelsControl
        conversationId={conversationId}
        initialLabels={initial.labels ?? null}
      />
    </div>
  );
}
