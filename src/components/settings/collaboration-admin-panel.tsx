"use client";

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2, Plus, RefreshCw, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

const COPY = {
  en: {
    title: "Workgroups and queues",
    description: "Organize current-shop work with versioned, audited member authority.",
    loading: "Loading collaboration authority…",
    loadError: "Collaboration authority could not be loaded.",
    refresh: "Refresh",
    workgroups: "Workgroups",
    queues: "Queues",
    createWorkgroup: "Create workgroup",
    workgroupName: "Workgroup name",
    descriptionLabel: "Description (optional)",
    members: "Members",
    add: "Add selected",
    remove: "Remove selected",
    archive: "Archive",
    createQueue: "Create queue",
    queueKey: "Stable queue key",
    queueName: "Queue name",
    entityType: "Work type",
    conversation: "Conversations",
    order: "Orders",
    confirmation: "Confirmation work",
    workgroup: "Workgroup (optional)",
    none: "None",
    emptyWorkgroups: "No workgroups yet.",
    emptyQueues: "No queues yet.",
    archived: "Archived",
    active: "Active",
    owner: "Owner",
    manager: "Manager",
    operator: "Operator",
    viewer: "Viewer",
    conflict: "The record changed elsewhere. Refresh and try again.",
    saveError: "The collaboration change could not be saved.",
  },
  fr: {
    title: "Groupes de travail et files",
    description: "Organisez le travail de la boutique avec une autorité versionnée et auditée.",
    loading: "Chargement de l’autorité de collaboration…",
    loadError: "Impossible de charger l’autorité de collaboration.",
    refresh: "Actualiser",
    workgroups: "Groupes de travail",
    queues: "Files",
    createWorkgroup: "Créer un groupe",
    workgroupName: "Nom du groupe",
    descriptionLabel: "Description (facultative)",
    members: "Membres",
    add: "Ajouter la sélection",
    remove: "Retirer la sélection",
    archive: "Archiver",
    createQueue: "Créer une file",
    queueKey: "Clé stable de la file",
    queueName: "Nom de la file",
    entityType: "Type de travail",
    conversation: "Conversations",
    order: "Commandes",
    confirmation: "Travail de confirmation",
    workgroup: "Groupe (facultatif)",
    none: "Aucun",
    emptyWorkgroups: "Aucun groupe de travail.",
    emptyQueues: "Aucune file.",
    archived: "Archivé",
    active: "Actif",
    owner: "Propriétaire",
    manager: "Responsable",
    operator: "Opérateur",
    viewer: "Lecteur",
    conflict: "L’enregistrement a changé ailleurs. Actualisez puis réessayez.",
    saveError: "Impossible d’enregistrer le changement de collaboration.",
  },
  ar: {
    title: "مجموعات العمل وقوائم الانتظار",
    description: "نظّم عمل المتجر بصلاحيات مضبوطة بالإصدار والتدقيق.",
    loading: "جارٍ تحميل صلاحيات التعاون…",
    loadError: "تعذر تحميل صلاحيات التعاون.",
    refresh: "تحديث",
    workgroups: "مجموعات العمل",
    queues: "قوائم الانتظار",
    createWorkgroup: "إنشاء مجموعة عمل",
    workgroupName: "اسم مجموعة العمل",
    descriptionLabel: "الوصف (اختياري)",
    members: "الأعضاء",
    add: "إضافة المحددين",
    remove: "إزالة المحددين",
    archive: "أرشفة",
    createQueue: "إنشاء قائمة انتظار",
    queueKey: "المفتاح الثابت للقائمة",
    queueName: "اسم قائمة الانتظار",
    entityType: "نوع العمل",
    conversation: "المحادثات",
    order: "الطلبات",
    confirmation: "عمل التأكيد",
    workgroup: "مجموعة العمل (اختياري)",
    none: "بدون",
    emptyWorkgroups: "لا توجد مجموعات عمل بعد.",
    emptyQueues: "لا توجد قوائم انتظار بعد.",
    archived: "مؤرشف",
    active: "نشط",
    owner: "المالك",
    manager: "مدير",
    operator: "مشغّل",
    viewer: "مشاهد",
    conflict: "تغيّر السجل في مكان آخر. حدّث ثم أعد المحاولة.",
    saveError: "تعذر حفظ تغيير التعاون.",
  },
} as const;

type Role = "owner" | "manager" | "operator" | "viewer";
type EntityType = "conversation" | "order" | "confirmation";

type Member = {
  memberId: string;
  displayName: string | null;
  role: Role;
};

type Workgroup = {
  id: string;
  name: string;
  description: string | null;
  state: "active" | "archived";
  version: number;
  memberships: Array<{ memberId: string; role: "lead" | "member" }>;
};

type Queue = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  entityType: EntityType;
  workgroupId: string | null;
  state: "active" | "archived";
  version: number;
};

type View = {
  workgroups: Workgroup[];
  queues: Queue[];
  activeMembers: Member[];
  permissions: {
    workgroupsRead: boolean;
    workgroupsManage: boolean;
    queuesRead: boolean;
    queuesManage: boolean;
  };
  error?: string;
};

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

function shortId(value: string): string {
  return value.length <= 10 ? value : `…${value.slice(-10)}`;
}

export function CollaborationAdminPanel() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [queueKey, setQueueKey] = useState("");
  const [queueName, setQueueName] = useState("");
  const [queueDescription, setQueueDescription] = useState("");
  const [queueType, setQueueType] = useState<EntityType>("conversation");
  const [queueGroupId, setQueueGroupId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/collaboration/administration", {
        cache: "no-store",
      });
      const body = (await response.json()) as View;
      if (!response.ok) throw new Error(body.error ?? copy.loadError);
      setView(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const mutate = async (payload: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/collaboration/administration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? copy.conflict
            : body.error ?? copy.saveError,
        );
      }
      await load();
      return true;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : copy.saveError;
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {copy.loading}
        </div>
      </section>
    );
  }

  if (!view) {
    return (
      <section className="rounded-xl border p-5">
        <p className="text-sm text-destructive">{error ?? copy.loadError}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="me-2 h-4 w-4" />
          {copy.refresh}
        </Button>
      </section>
    );
  }

  const memberLabel = (member: Member): string =>
    `${member.displayName ?? copy.owner} · ${copy[member.role]}`;

  return (
    <section className="space-y-6 rounded-xl border p-5">
      <div>
        <div className="flex items-center gap-2">
          <UsersRound className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">{copy.title}</h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>

      {view.permissions.workgroupsRead ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{copy.workgroups}</h4>
          {view.permissions.workgroupsManage ? (
            <div className="grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-2">
              <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder={copy.workgroupName} />
              <Input value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder={copy.descriptionLabel} />
              <div className="grid gap-2 md:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
                {view.activeMembers.map((member) => (
                  <label key={member.memberId} className="flex items-center gap-2 rounded-md border bg-background p-2 text-xs">
                    <input
                      type="checkbox"
                      checked={newGroupMembers.includes(member.memberId)}
                      onChange={(event) =>
                        setNewGroupMembers((current) =>
                          event.target.checked
                            ? [...current, member.memberId]
                            : current.filter((id) => id !== member.memberId),
                        )
                      }
                    />
                    <span className="truncate">{memberLabel(member)}</span>
                  </label>
                ))}
              </div>
              <Button
                disabled={saving || !groupName.trim()}
                onClick={async () => {
                  const saved = await mutate({
                    kind: "workgroup",
                    operation: "create",
                    name: groupName.trim(),
                    description: groupDescription.trim() || null,
                    memberIds: newGroupMembers,
                    expectedVersion: 0,
                    idempotencyKey: requestId(),
                  });
                  if (saved) {
                    setGroupName("");
                    setGroupDescription("");
                    setNewGroupMembers([]);
                  }
                }}
              >
                <Plus className="me-2 h-4 w-4" />
                {copy.createWorkgroup}
              </Button>
            </div>
          ) : null}

          {view.workgroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.emptyWorkgroups}</p>
          ) : (
            <div className="space-y-2">
              {view.workgroups.map((group) => {
                const activeIds = group.memberships.map((entry) => entry.memberId);
                const selected = selectedByGroup[group.id] ?? [];
                return (
                  <div key={group.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{group.name}</p>
                        {group.description ? <p className="text-xs text-muted-foreground">{group.description}</p> : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {group.state === "active" ? copy.active : copy.archived} · {activeIds.length} {copy.members.toLowerCase()}
                        </p>
                      </div>
                      {view.permissions.workgroupsManage && group.state === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => void mutate({
                            kind: "workgroup",
                            operation: "archive",
                            workgroupId: group.id,
                            memberIds: [],
                            expectedVersion: group.version,
                            idempotencyKey: requestId(),
                          })}
                        >
                          <Archive className="me-2 h-4 w-4" />
                          {copy.archive}
                        </Button>
                      ) : null}
                    </div>
                    {view.permissions.workgroupsManage && group.state === "active" ? (
                      <div className="mt-3 space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {view.activeMembers.map((member) => (
                            <label key={member.memberId} className="flex items-center gap-2 rounded-md bg-muted/30 p-2 text-xs">
                              <input
                                type="checkbox"
                                checked={selected.includes(member.memberId)}
                                onChange={(event) =>
                                  setSelectedByGroup((current) => ({
                                    ...current,
                                    [group.id]: event.target.checked
                                      ? [...selected, member.memberId]
                                      : selected.filter((id) => id !== member.memberId),
                                  }))
                                }
                              />
                              <span className="truncate">
                                {member.displayName ?? copy.owner}{activeIds.includes(member.memberId) ? " ✓" : ""}
                              </span>
                            </label>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={saving || selected.every((id) => activeIds.includes(id))}
                            onClick={() => void mutate({
                              kind: "workgroup",
                              operation: "add_members",
                              workgroupId: group.id,
                              memberIds: selected.filter((id) => !activeIds.includes(id)),
                              expectedVersion: group.version,
                              idempotencyKey: requestId(),
                            })}
                          >
                            {copy.add}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving || selected.every((id) => !activeIds.includes(id))}
                            onClick={() => void mutate({
                              kind: "workgroup",
                              operation: "remove_members",
                              workgroupId: group.id,
                              memberIds: selected.filter((id) => activeIds.includes(id)),
                              expectedVersion: group.version,
                              idempotencyKey: requestId(),
                            })}
                          >
                            {copy.remove}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {view.permissions.queuesRead ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">{copy.queues}</h4>
          {view.permissions.queuesManage ? (
            <div className="grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-2">
              <Input value={queueKey} onChange={(event) => setQueueKey(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} placeholder={copy.queueKey} />
              <Input value={queueName} onChange={(event) => setQueueName(event.target.value)} placeholder={copy.queueName} />
              <Input value={queueDescription} onChange={(event) => setQueueDescription(event.target.value)} placeholder={copy.descriptionLabel} />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={queueType} onChange={(event) => setQueueType(event.target.value as EntityType)}>
                <option value="conversation">{copy.conversation}</option>
                <option value="order">{copy.order}</option>
                <option value="confirmation">{copy.confirmation}</option>
              </select>
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={queueGroupId} onChange={(event) => setQueueGroupId(event.target.value)}>
                <option value="">{copy.none}</option>
                {view.workgroups.filter((group) => group.state === "active").map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              <Button
                disabled={saving || !queueKey || !queueName.trim()}
                onClick={async () => {
                  const saved = await mutate({
                    kind: "queue",
                    operation: "create",
                    key: queueKey,
                    name: queueName.trim(),
                    description: queueDescription.trim() || null,
                    entityType: queueType,
                    workgroupId: queueGroupId || null,
                    expectedVersion: 0,
                    idempotencyKey: requestId(),
                  });
                  if (saved) {
                    setQueueKey("");
                    setQueueName("");
                    setQueueDescription("");
                    setQueueGroupId("");
                  }
                }}
              >
                <Plus className="me-2 h-4 w-4" />
                {copy.createQueue}
              </Button>
            </div>
          ) : null}

          {view.queues.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.emptyQueues}</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {view.queues.map((queue) => (
                <div key={queue.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{queue.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {queue.key} · {copy[queue.entityType]} · {queue.state === "active" ? copy.active : copy.archived}
                      </p>
                      {queue.workgroupId ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {copy.workgroup}: {view.workgroups.find((group) => group.id === queue.workgroupId)?.name ?? shortId(queue.workgroupId)}
                        </p>
                      ) : null}
                    </div>
                    {view.permissions.queuesManage && queue.state === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void mutate({
                          kind: "queue",
                          operation: "archive",
                          queueId: queue.id,
                          expectedVersion: queue.version,
                          idempotencyKey: requestId(),
                        })}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
