"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Crown,
  KeyRound,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  UserMinus,
  UserPlus,
  UserRoundCog,
  Users,
} from "lucide-react";

import {
  Field,
  Section,
  SectionStack,
  StateSurface,
} from "@/components/system";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import {
  getTeamCopy,
  TEAM_ROLE_ORDER,
  type TeamCopyKey,
} from "@/lib/i18n/team-workspace";
import { toast } from "@/lib/toast";
import { cn, formatRelative } from "@/lib/utils";

/** PRODUCT §5: ten active team members besides the owner. */
const TEAM_MEMBER_LIMIT = 10;
const MIN_PIN_LENGTH = 8;
const EXPIRY_OPTIONS = [24, 72, 168] as const;

type InviteRole = "manager" | "operator" | "viewer";
type Action = string;

type Invitation = {
  id: string;
  role: InviteRole;
  permissions: Action[] | null;
  shopIds: string[];
  createdAt: string;
  expiresAt: string;
  state: "pending" | "expired" | "revoked" | "accepted";
};

type ShopOption = { id: string; name: string; current: boolean };

type Inventory = {
  authority: { revision: number; invitations: Invitation[] };
  shopOptions: ShopOption[];
  permissionCatalog: {
    actions: Action[];
    ceilings: Record<InviteRole, Action[]>;
  };
};

type Member = {
  memberId: string;
  displayName: string;
  loginId: string;
  role: InviteRole;
  permissions: Action[] | null;
  shopIds: string[];
  createdAt: string;
  revokedAt: string | null;
  sessions: Array<{
    databaseLastSeenAt: string | null;
    databaseIssuedAt: string | null;
  }>;
};

type AccessDraft = {
  role: InviteRole;
  shopIds: string[];
  customize: boolean;
  permissions: Action[];
};

type Dialogs =
  | { kind: "none" }
  | { kind: "invite" }
  | {
      kind: "invite-ready";
      token: string | null;
      role: InviteRole;
      expiresAt: string;
    }
  | { kind: "edit"; member: Member }
  | { kind: "reset"; member: Member }
  | { kind: "remove"; member: Member };

type ApiResult = {
  ok: boolean;
  body: Record<string, unknown> & { code?: string };
};

/** Permission labels in each language; the role ceilings come from the server. */
const ACTION_LABELS: Record<"en" | "fr" | "ar", Record<string, string>> = {
  en: {
    "shops.read": "View shops",
    "shops.switch": "Switch shops",
    "shops.create": "Create shops",
    "shops.delete": "Delete shops",
    "members.read": "View members",
    "members.manage": "Manage members",
    "devices.read": "View devices",
    "devices.manage": "Manage devices",
    "sessions.read": "View sessions",
    "sessions.revoke": "Revoke sessions",
    "workgroups.read": "View workgroups",
    "workgroups.manage": "Manage workgroups",
    "queues.read": "View queues",
    "queues.manage": "Manage queues",
    "comments.read": "View internal comments",
    "comments.write": "Write internal comments",
    "conversations.read": "View conversations",
    "conversations.update": "Update conversation workflow",
    "conversations.reply": "Reply to conversations",
    "conversations.claim": "Claim conversations",
    "conversations.assign": "Assign conversations",
    "whatsapp.connection.manage": "Manage WhatsApp connection",
    "orders.read": "View orders",
    "orders.create": "Create orders",
    "orders.update": "Update orders",
    "orders.delete": "Delete orders",
    "orders.assign": "Assign orders",
    "customers.contact.read": "View customer contact details",
    "customers.contact.update": "Update customer contact details",
    "orders.financials.read": "View order financial fields",
    "orders.financials.update": "Update order financial fields",
    "products.read": "View products and stock",
    "products.manage": "Manage products and stock",
    "products.cost.read": "View product costs",
    "products.cost.update": "Update product costs",
    "customers.read": "View customer records",
    "customers.manage": "Manage customer records",
    "accounting.read": "View accounting",
    "accounting.update": "Update accounting",
    "analytics.read": "View operational analytics",
    "analytics.financials.read": "View financial analytics",
    "deliveries.read": "View deliveries",
    "deliveries.manage": "Manage deliveries",
    "delivery.credentials.manage": "Manage delivery credentials",
    "automations.read": "View automations",
    "automations.manage": "Manage automations",
    "ai.use": "Use AI assistance",
    "backups.read": "View and download backups",
    "backups.create": "Create backups",
    "backups.restore": "Restore or delete backups",
    "data.export": "Export data",
    "data.import": "Import data",
    "integrations.read": "View integrations",
    "integrations.manage": "Manage integrations and secrets",
    "risk.read": "View risk information",
    "risk.manage": "Manage risk policy",
    "settings.read": "View settings",
    "settings.manage": "Manage settings",
    "storefront.read": "View storefronts",
    "storefront.manage": "Manage storefronts",
    "storefront.publish": "Publish and allocate storefronts",
    "license.read": "View licence status",
    "license.manage": "Manage licence authority",
    "approvals.request": "Request approvals",
    "approvals.approve": "Approve high-risk actions",
  },
  fr: {
    "shops.read": "Voir les boutiques",
    "shops.switch": "Changer de boutique",
    "shops.create": "Créer des boutiques",
    "shops.delete": "Supprimer des boutiques",
    "members.read": "Voir les membres",
    "members.manage": "Gérer les membres",
    "devices.read": "Voir les appareils",
    "devices.manage": "Gérer les appareils",
    "sessions.read": "Voir les sessions",
    "sessions.revoke": "Révoquer les sessions",
    "workgroups.read": "Voir les groupes de travail",
    "workgroups.manage": "Gérer les groupes de travail",
    "queues.read": "Voir les files",
    "queues.manage": "Gérer les files",
    "comments.read": "Voir les commentaires internes",
    "comments.write": "Écrire des commentaires internes",
    "conversations.read": "Voir les conversations",
    "conversations.update": "Modifier le flux des conversations",
    "conversations.reply": "Répondre aux conversations",
    "conversations.claim": "Prendre les conversations",
    "conversations.assign": "Attribuer les conversations",
    "whatsapp.connection.manage": "Gérer la connexion WhatsApp",
    "orders.read": "Voir les commandes",
    "orders.create": "Créer des commandes",
    "orders.update": "Modifier les commandes",
    "orders.delete": "Supprimer les commandes",
    "orders.assign": "Attribuer les commandes",
    "customers.contact.read": "Voir les coordonnées client",
    "customers.contact.update": "Modifier les coordonnées client",
    "orders.financials.read": "Voir les champs financiers des commandes",
    "orders.financials.update": "Modifier les champs financiers des commandes",
    "products.read": "Voir les produits et le stock",
    "products.manage": "Gérer les produits et le stock",
    "products.cost.read": "Voir les coûts des produits",
    "products.cost.update": "Modifier les coûts des produits",
    "customers.read": "Voir les fiches clients",
    "customers.manage": "Gérer les fiches clients",
    "accounting.read": "Voir la comptabilité",
    "accounting.update": "Modifier la comptabilité",
    "analytics.read": "Voir les analyses opérationnelles",
    "analytics.financials.read": "Voir les analyses financières",
    "deliveries.read": "Voir les livraisons",
    "deliveries.manage": "Gérer les livraisons",
    "delivery.credentials.manage": "Gérer les identifiants de livraison",
    "automations.read": "Voir les automatisations",
    "automations.manage": "Gérer les automatisations",
    "ai.use": "Utiliser l’assistance IA",
    "backups.read": "Voir et télécharger les sauvegardes",
    "backups.create": "Créer des sauvegardes",
    "backups.restore": "Restaurer ou supprimer des sauvegardes",
    "data.export": "Exporter les données",
    "data.import": "Importer les données",
    "integrations.read": "Voir les intégrations",
    "integrations.manage": "Gérer les intégrations et les secrets",
    "risk.read": "Voir les informations de risque",
    "risk.manage": "Gérer la politique de risque",
    "settings.read": "Voir les paramètres",
    "settings.manage": "Gérer les paramètres",
    "storefront.read": "Voir les vitrines",
    "storefront.manage": "Gérer les vitrines",
    "storefront.publish": "Publier et attribuer les vitrines",
    "license.read": "Voir l’état de la licence",
    "license.manage": "Gérer l’autorité de licence",
    "approvals.request": "Demander une approbation",
    "approvals.approve": "Approuver les actions sensibles",
  },
  ar: {
    "shops.read": "عرض المتاجر",
    "shops.switch": "تبديل المتجر",
    "shops.create": "إنشاء المتاجر",
    "shops.delete": "حذف المتاجر",
    "members.read": "عرض الأعضاء",
    "members.manage": "إدارة الأعضاء",
    "devices.read": "عرض الأجهزة",
    "devices.manage": "إدارة الأجهزة",
    "sessions.read": "عرض الجلسات",
    "sessions.revoke": "إلغاء الجلسات",
    "workgroups.read": "عرض مجموعات العمل",
    "workgroups.manage": "إدارة مجموعات العمل",
    "queues.read": "عرض قوائم الانتظار",
    "queues.manage": "إدارة قوائم الانتظار",
    "comments.read": "عرض التعليقات الداخلية",
    "comments.write": "كتابة التعليقات الداخلية",
    "conversations.read": "عرض المحادثات",
    "conversations.update": "تعديل سير عمل المحادثات",
    "conversations.reply": "الرد على المحادثات",
    "conversations.claim": "استلام المحادثات",
    "conversations.assign": "إسناد المحادثات",
    "whatsapp.connection.manage": "إدارة اتصال واتساب",
    "orders.read": "عرض الطلبات",
    "orders.create": "إنشاء الطلبات",
    "orders.update": "تعديل الطلبات",
    "orders.delete": "حذف الطلبات",
    "orders.assign": "إسناد الطلبات",
    "customers.contact.read": "عرض بيانات تواصل العميل",
    "customers.contact.update": "تعديل بيانات تواصل العميل",
    "orders.financials.read": "عرض الحقول المالية للطلب",
    "orders.financials.update": "تعديل الحقول المالية للطلب",
    "products.read": "عرض المنتجات والمخزون",
    "products.manage": "إدارة المنتجات والمخزون",
    "products.cost.read": "عرض تكاليف المنتجات",
    "products.cost.update": "تعديل تكاليف المنتجات",
    "customers.read": "عرض سجلات العملاء",
    "customers.manage": "إدارة سجلات العملاء",
    "accounting.read": "عرض المحاسبة",
    "accounting.update": "تعديل المحاسبة",
    "analytics.read": "عرض التحليلات التشغيلية",
    "analytics.financials.read": "عرض التحليلات المالية",
    "deliveries.read": "عرض عمليات التوصيل",
    "deliveries.manage": "إدارة عمليات التوصيل",
    "delivery.credentials.manage": "إدارة بيانات اعتماد التوصيل",
    "automations.read": "عرض الأتمتة",
    "automations.manage": "إدارة الأتمتة",
    "ai.use": "استخدام مساعدة الذكاء الاصطناعي",
    "backups.read": "عرض النسخ الاحتياطية وتنزيلها",
    "backups.create": "إنشاء نسخ احتياطية",
    "backups.restore": "استعادة النسخ الاحتياطية أو حذفها",
    "data.export": "تصدير البيانات",
    "data.import": "استيراد البيانات",
    "integrations.read": "عرض عمليات التكامل",
    "integrations.manage": "إدارة عمليات التكامل والأسرار",
    "risk.read": "عرض معلومات المخاطر",
    "risk.manage": "إدارة سياسة المخاطر",
    "settings.read": "عرض الإعدادات",
    "settings.manage": "إدارة الإعدادات",
    "storefront.read": "عرض واجهات المتاجر",
    "storefront.manage": "إدارة واجهات المتاجر",
    "storefront.publish": "نشر واجهات المتاجر وتخصيصها",
    "license.read": "عرض حالة الترخيص",
    "license.manage": "إدارة صلاحية الترخيص",
    "approvals.request": "طلب الموافقة",
    "approvals.approve": "الموافقة على الإجراءات الحساسة",
  },
};

type TeamSnapshot = { inventory: Inventory; members: Member[] };

async function fetchTeam(): Promise<TeamSnapshot> {
  const [invitationsResponse, membersResponse] = await Promise.all([
    fetch("/api/auth/invitations", { cache: "no-store" }),
    fetch("/api/auth/members", { cache: "no-store" }),
  ]);
  if (!invitationsResponse.ok || !membersResponse.ok) throw new Error("load");
  const inventory = (await invitationsResponse.json()) as Inventory;
  const memberBody = (await membersResponse.json()) as {
    authority: { members: Member[] };
  };
  return { inventory, members: memberBody.authority.members };
}

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function lastActive(member: Member): string | null {
  const stamps = member.sessions
    .map((session) => session.databaseLastSeenAt ?? session.databaseIssuedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  return stamps.at(-1) ?? null;
}

/**
 * The Team page: who is on the team, what each person may do, and the
 * everyday changes an owner makes — invite, change access, reset a forgotten
 * PIN, remove. Every rule is enforced on the server; owner changes ask for the
 * owner PIN when it has not been entered recently.
 */
export function TeamAccessAuthorityPanel() {
  const { locale } = useI18n();
  const c = useCallback(
    (key: TeamCopyKey, params?: Record<string, string | number>) =>
      getTeamCopy(locale, key, params),
    [locale],
  );
  const actionLabel = useCallback(
    (action: Action) =>
      ACTION_LABELS[locale]?.[action] ?? ACTION_LABELS.en[action] ?? action,
    [locale],
  );

  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dialog, setDialog] = useState<Dialogs>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [pinGate, setPinGate] = useState<null | (() => Promise<void>)>(null);

  const apply = useCallback((team: TeamSnapshot) => {
    setInventory(team.inventory);
    setMembers(team.members);
    setLoadFailed(false);
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await fetchTeam());
    } catch {
      setLoadFailed(true);
    }
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchTeam()
      .then((team) => {
        if (!cancelled) apply(team);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  /** Run an owner request; ask for the PIN once if the server wants fresh proof. */
  const ownerRequest = useCallback(
    async (
      url: string,
      init: RequestInit,
      onSuccess: (result: ApiResult) => void | Promise<void>,
    ): Promise<void> => {
      const attempt = async (): Promise<void> => {
        setBusy(true);
        try {
          const response = await fetch(url, {
            ...init,
            headers: {
              "Content-Type": "application/json",
              ...(init.headers ?? {}),
            },
          });
          const body = (await response
            .json()
            .catch(() => ({}))) as ApiResult["body"];
          if (
            response.status === 403 &&
            body.code === "REAUTHENTICATION_REQUIRED"
          ) {
            setPinGate(() => attempt);
            return;
          }
          if (!response.ok) {
            toast.error(
              body.code === "MEMBER_LIMIT_REACHED"
                ? c("team.seatsFull", { limit: TEAM_MEMBER_LIMIT })
                : c("team.error"),
            );
            return;
          }
          await onSuccess({ ok: true, body });
          await load();
        } catch {
          toast.error(c("team.error"));
        } finally {
          setBusy(false);
        }
      };
      await attempt();
    },
    [c, load],
  );

  const activeMembers = useMemo(
    () => (members ?? []).filter((member) => !member.revokedAt),
    [members],
  );
  const formerMembers = useMemo(
    () => (members ?? []).filter((member) => member.revokedAt),
    [members],
  );
  const pendingInvitations = useMemo(
    () =>
      (inventory?.authority.invitations ?? []).filter(
        (invitation) => invitation.state === "pending",
      ),
    [inventory],
  );
  const seatsFull = activeMembers.length >= TEAM_MEMBER_LIMIT;
  const shopName = useCallback(
    (id: string) =>
      inventory?.shopOptions.find((shop) => shop.id === id)?.name ?? id,
    [inventory],
  );

  if (loadFailed) {
    return (
      <StateSurface
        icon={Users}
        title={c("team.loadError")}
        tone="danger"
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            {c("team.retry")}
          </Button>
        }
      />
    );
  }
  if (!inventory || !members) {
    return (
      <div className="flex justify-center p-8" role="status" aria-live="polite">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  }

  const roleLabel = (role: InviteRole | "owner") =>
    c(`role.${role}` as TeamCopyKey);

  return (
    <SectionStack data-team-workspace="owner">
      <Section
        title={c("team.seats", {
          active: activeMembers.length,
          limit: TEAM_MEMBER_LIMIT,
        })}
        description={
          seatsFull
            ? c("team.seatsFull", { limit: TEAM_MEMBER_LIMIT })
            : undefined
        }
        actions={
          <Button
            onClick={() => setDialog({ kind: "invite" })}
            disabled={seatsFull || busy}
          >
            <UserPlus className="me-2 size-4" aria-hidden="true" />
            {c("team.invite")}
          </Button>
        }
      >
        <div
          className="h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={TEAM_MEMBER_LIMIT}
          aria-valuenow={activeMembers.length}
          aria-label={c("team.seats", {
            active: activeMembers.length,
            limit: TEAM_MEMBER_LIMIT,
          })}
        >
          <div
            className={cn(
              "h-full rounded-full",
              seatsFull ? "bg-warning" : "bg-primary",
            )}
            style={{
              width: `${(activeMembers.length / TEAM_MEMBER_LIMIT) * 100}%`,
            }}
          />
        </div>

        <ul className="mt-4 divide-y divide-border/70 rounded-surface border border-border/80 bg-card">
          <li className="flex items-center gap-3 p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
              <Crown className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-title-3">
                {roleLabel("owner")} · {c("team.you")}
              </p>
              <p className="text-body-sm text-muted-foreground">
                {c("role.owner.description")}
              </p>
            </div>
          </li>
          {activeMembers.map((member) => {
            const seen = lastActive(member);
            return (
              <li
                key={member.memberId}
                className="flex items-center gap-3 p-4"
                data-team-member={member.loginId}
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-caption font-semibold"
                >
                  {initials(member.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span dir="auto" className="truncate text-title-3">
                      {member.displayName}
                    </span>
                    <Badge variant="secondary">{roleLabel(member.role)}</Badge>
                    {member.permissions ? (
                      <Badge variant="outline">{c("team.custom")}</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-body-sm text-muted-foreground">
                    <span dir="ltr" className="font-mono">
                      {member.loginId}
                    </span>
                    <span>
                      {member.shopIds.length > 1
                        ? c("team.shopsCount", { count: member.shopIds.length })
                        : shopName(member.shopIds[0] ?? "")}
                    </span>
                    <span>
                      {seen
                        ? c("team.lastActive", {
                            when: formatRelative(seen, locale),
                          })
                        : c("team.notSignedIn")}
                    </span>
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={c("team.actions", {
                        name: member.displayName,
                      })}
                      disabled={busy}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => setDialog({ kind: "edit", member })}
                    >
                      <UserRoundCog
                        className="me-2 size-4"
                        aria-hidden="true"
                      />
                      {c("team.editAccess")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setDialog({ kind: "reset", member })}
                    >
                      <KeyRound className="me-2 size-4" aria-hidden="true" />
                      {c("team.resetPin")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setDialog({ kind: "remove", member })}
                    >
                      <UserMinus className="me-2 size-4" aria-hidden="true" />
                      {c("team.remove")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
        {activeMembers.length === 0 ? (
          <p className="mt-3 max-w-prose text-body-sm text-muted-foreground">
            {c("team.empty")}
          </p>
        ) : null}
      </Section>

      {pendingInvitations.length ? (
        <Section title={c("team.invitations")} as="h3">
          <ul className="divide-y divide-border/70 rounded-surface border border-border/80 bg-card">
            {pendingInvitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground">
                  <UserPlus className="size-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-title-3">{roleLabel(invitation.role)}</p>
                  <p className="text-body-sm text-muted-foreground">
                    {c("team.invitationExpires", {
                      when: formatRelative(invitation.expiresAt, locale),
                    })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void ownerRequest(
                      `/api/auth/invitations/${encodeURIComponent(invitation.id)}/revoke`,
                      { method: "POST" },
                      () => {
                        toast.success(c("invitation.cancelled"));
                      },
                    )
                  }
                >
                  {c("team.cancelInvitation")}
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={c("team.howTitle")} as="h3">
        <ol className="grid gap-3 sm:grid-cols-3">
          {(["team.how1", "team.how2", "team.how3"] as const).map(
            (key, index) => (
              <li
                key={key}
                className="flex gap-3 rounded-surface border border-border/80 bg-card p-4"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-subtle text-caption font-semibold text-primary tabular-nums">
                  {index + 1}
                </span>
                <p className="text-body-sm text-muted-foreground">{c(key)}</p>
              </li>
            ),
          )}
        </ol>
      </Section>

      {formerMembers.length ? (
        <Section title={c("team.removedTitle")} as="h3">
          <ul className="flex flex-wrap gap-2">
            {formerMembers.map((member) => (
              <li key={member.memberId}>
                <Badge
                  variant="outline"
                  className="font-normal text-muted-foreground"
                >
                  <span dir="auto">{member.displayName}</span>
                  <span dir="ltr" className="ms-1 font-mono">
                    ({member.loginId})
                  </span>
                </Badge>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <AccessDialog
        open={dialog.kind === "invite" || dialog.kind === "edit"}
        mode={dialog.kind === "edit" ? "edit" : "invite"}
        member={dialog.kind === "edit" ? dialog.member : null}
        inventory={inventory}
        busy={busy}
        c={c}
        actionLabel={actionLabel}
        onClose={() => setDialog({ kind: "none" })}
        onSubmit={(draft, expiresInHours) => {
          const permissions = draft.customize ? draft.permissions : null;
          if (dialog.kind === "edit") {
            const member = dialog.member;
            void ownerRequest(
              `/api/auth/members/${encodeURIComponent(member.memberId)}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  role: draft.role,
                  permissions,
                  shopIds: draft.shopIds,
                }),
              },
              ({ body }) => {
                toast.success(
                  body.changed
                    ? c("edit.saved", { name: member.displayName })
                    : c("edit.unchanged"),
                );
                setDialog({ kind: "none" });
              },
            );
            return;
          }
          void ownerRequest(
            "/api/auth/invitations",
            {
              method: "POST",
              body: JSON.stringify({
                requestId: newRequestId(),
                role: draft.role,
                permissions,
                shopIds: draft.shopIds,
                expiresInHours,
              }),
            },
            ({ body }) => {
              const invitation = body.invitation as Invitation;
              setDialog({
                kind: "invite-ready",
                token: (body.token as string | null) ?? null,
                role: invitation.role,
                expiresAt: invitation.expiresAt,
              });
            },
          );
        }}
      />

      <InviteReadyDialog
        state={dialog.kind === "invite-ready" ? dialog : null}
        c={c}
        roleLabel={roleLabel}
        locale={locale}
        onClose={() => setDialog({ kind: "none" })}
      />

      <ResetPinDialog
        member={dialog.kind === "reset" ? dialog.member : null}
        busy={busy}
        c={c}
        onClose={() => setDialog({ kind: "none" })}
        onSubmit={(member, newPin) =>
          void ownerRequest(
            `/api/auth/members/${encodeURIComponent(member.memberId)}/reset-pin`,
            { method: "POST", body: JSON.stringify({ newPin }) },
            () => {
              toast.success(c("reset.done", { name: member.displayName }));
              setDialog({ kind: "none" });
            },
          )
        }
      />

      <AlertDialog
        open={dialog.kind === "remove"}
        onOpenChange={(open) =>
          !open ? setDialog({ kind: "none" }) : undefined
        }
      >
        {dialog.kind === "remove" ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {c("remove.title", { name: dialog.member.displayName })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {c("remove.body")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{c("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const member = dialog.member;
                  void ownerRequest(
                    `/api/auth/members/${encodeURIComponent(member.memberId)}/revoke`,
                    { method: "POST" },
                    () => {
                      toast.success(
                        c("remove.done", { name: member.displayName }),
                      );
                    },
                  );
                  setDialog({ kind: "none" });
                }}
              >
                {c("remove.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

      <OwnerPinDialog
        open={pinGate !== null}
        c={c}
        onCancel={() => setPinGate(null)}
        onVerified={() => {
          const resume = pinGate;
          setPinGate(null);
          if (resume) void resume();
        }}
      />
    </SectionStack>
  );
}

type CopyFn = (
  key: TeamCopyKey,
  params?: Record<string, string | number>,
) => string;

type AccessDialogProps = {
  open: boolean;
  mode: "invite" | "edit";
  member: Member | null;
  inventory: Inventory;
  busy: boolean;
  c: CopyFn;
  actionLabel: (action: Action) => string;
  onClose: () => void;
  onSubmit: (draft: AccessDraft, expiresInHours: number) => void;
};

/** The form mounts only while open, so each opening starts from fresh state. */
function AccessDialog(props: AccessDialogProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => (!next ? props.onClose() : undefined)}
    >
      {props.open ? <AccessDialogForm {...props} /> : null}
    </Dialog>
  );
}

function AccessDialogForm({
  mode,
  member,
  inventory,
  busy,
  c,
  actionLabel,
  onClose,
  onSubmit,
}: AccessDialogProps) {
  const currentShop = inventory.shopOptions.find((shop) => shop.current)?.id;
  const initialDraft = (): AccessDraft => {
    if (member) {
      return {
        role: member.role,
        shopIds: [...member.shopIds],
        customize: member.permissions !== null,
        permissions: [
          ...(member.permissions ??
            inventory?.permissionCatalog.ceilings[member.role] ??
            []),
        ],
      };
    }
    return {
      role: "operator",
      shopIds: currentShop ? [currentShop] : [],
      customize: false,
      permissions: [...(inventory?.permissionCatalog.ceilings.operator ?? [])],
    };
  };

  const [draft, setDraft] = useState<AccessDraft>(initialDraft);
  const [expiry, setExpiry] = useState<number>(72);

  const role = draft.role;
  // The server's catalog order and the role ceiling decide what can be granted.
  const grantable = (inventory?.permissionCatalog.actions ?? []).filter(
    (action) => inventory?.permissionCatalog.ceilings[role]?.includes(action),
  );
  const valid =
    draft.shopIds.length > 0 &&
    (!draft.customize || draft.permissions.length > 0);

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {mode === "edit" && member
            ? c("edit.title", { name: member.displayName })
            : c("invite.title")}
        </DialogTitle>
        {mode === "edit" && member ? (
          <DialogDescription>
            {c("edit.note", { name: member.displayName })}
          </DialogDescription>
        ) : null}
      </DialogHeader>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-title-3">{c("invite.role")}</legend>
        <div className="grid gap-2" role="radiogroup">
          {TEAM_ROLE_ORDER.map((option) => {
            const selected = draft.role === option;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    role: option,
                    permissions: [
                      ...(inventory?.permissionCatalog.ceilings[option] ?? []),
                    ],
                  }))
                }
                className={cn(
                  "flex items-start gap-3 rounded-surface border p-3 text-start transition-colors",
                  selected
                    ? "border-primary bg-primary-subtle"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground/40",
                  )}
                >
                  {selected ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-title-3">
                    {c(`role.${option}` as TeamCopyKey)}
                  </span>
                  <span className="block text-body-sm text-muted-foreground">
                    {c(`role.${option}.description` as TeamCopyKey)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {inventory.shopOptions.length > 1 ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-title-3">{c("invite.shops")}</legend>
          {inventory.shopOptions.map((shop) => (
            <label
              key={shop.id}
              className="flex items-center gap-2 text-body-sm"
            >
              <Checkbox
                checked={draft.shopIds.includes(shop.id)}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    shopIds: checked
                      ? [...new Set([...current.shopIds, shop.id])]
                      : current.shopIds.filter((id) => id !== shop.id),
                  }))
                }
              />
              <span dir="auto">{shop.name}</span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {mode === "invite" ? (
        <fieldset>
          <legend className="mb-2 text-title-3">{c("invite.expiry")}</legend>
          <div
            className="inline-flex rounded-control border p-0.5"
            role="radiogroup"
          >
            {EXPIRY_OPTIONS.map((hours) => (
              <button
                key={hours}
                type="button"
                role="radio"
                aria-checked={expiry === hours}
                onClick={() => setExpiry(hours)}
                className={cn(
                  "rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-body-sm",
                  expiry === hours
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
              >
                {c(`invite.expiry.${hours}` as TeamCopyKey)}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <details
        open={draft.customize}
        onToggle={(event) => {
          const isOpen = (event.currentTarget as HTMLDetailsElement).open;
          setDraft((current) =>
            isOpen === current.customize
              ? current
              : { ...current, customize: isOpen },
          );
        }}
        className="rounded-surface border p-3"
      >
        <summary className="cursor-pointer text-title-3">
          {c("invite.customize")}
        </summary>
        <p className="mt-1 text-body-sm text-muted-foreground">
          {c("invite.customizeHint")}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {grantable.map((action) => (
            <label key={action} className="flex items-start gap-2 text-body-sm">
              <Checkbox
                className="mt-0.5"
                checked={draft.permissions.includes(action)}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    permissions: checked
                      ? [...new Set([...current.permissions, action])]
                      : current.permissions.filter((value) => value !== action),
                  }))
                }
              />
              <span>{actionLabel(action)}</span>
            </label>
          ))}
        </div>
      </details>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {c("common.cancel")}
        </Button>
        <Button
          onClick={() => onSubmit(draft, expiry)}
          disabled={busy || !valid}
        >
          {busy ? (
            <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {mode === "edit" ? c("edit.save") : c("invite.create")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function InviteReadyDialog({
  state,
  c,
  roleLabel,
  locale,
  onClose,
}: {
  state: { token: string | null; role: InviteRole; expiresAt: string } | null;
  c: CopyFn;
  roleLabel: (role: InviteRole) => string;
  locale: Parameters<typeof formatRelative>[1];
  onClose: () => void;
}) {
  return (
    <Dialog
      open={state !== null}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      {state ? (
        <InviteReadyContent
          key={state.token ?? state.expiresAt}
          state={state}
          c={c}
          roleLabel={roleLabel}
          locale={locale}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  );
}

function InviteReadyContent({
  state,
  c,
  roleLabel,
  locale,
  onClose,
}: {
  state: { token: string | null; role: InviteRole; expiresAt: string };
  c: CopyFn;
  roleLabel: (role: InviteRole) => string;
  locale: Parameters<typeof formatRelative>[1];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<"code" | "message" | null>(null);

  async function copy(kind: "code" | "message", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
    } catch {
      toast.error(c("team.error"));
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{c("invite.readyTitle")}</DialogTitle>
        <DialogDescription>
          {state.token
            ? c("invite.readyBody", {
                role: roleLabel(state.role).toLocaleLowerCase(locale),
                when: formatRelative(state.expiresAt, locale),
              })
            : c("invite.lost")}
        </DialogDescription>
      </DialogHeader>
      {state.token ? (
        <>
          <code
            dir="ltr"
            className="block select-all break-all rounded-control border bg-muted/40 p-3 font-mono text-caption"
            data-invitation-token
          >
            {state.token}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void copy("code", state.token ?? "")}
            >
              {copied === "code" ? (
                <Check className="me-2 size-4" aria-hidden="true" />
              ) : (
                <Clipboard className="me-2 size-4" aria-hidden="true" />
              )}
              {copied === "code" ? c("invite.copied") : c("invite.copyCode")}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void copy("message", `${c("invite.message")}\n\n${state.token}`)
              }
            >
              {copied === "message" ? (
                <Check className="me-2 size-4" aria-hidden="true" />
              ) : (
                <MessageCircle className="me-2 size-4" aria-hidden="true" />
              )}
              {copied === "message"
                ? c("invite.copied")
                : c("invite.copyMessage")}
            </Button>
          </div>
        </>
      ) : null}
      <DialogFooter>
        <Button onClick={onClose}>{c("invite.done")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ResetPinDialog({
  member,
  busy,
  c,
  onClose,
  onSubmit,
}: {
  member: Member | null;
  busy: boolean;
  c: CopyFn;
  onClose: () => void;
  onSubmit: (member: Member, newPin: string) => void;
}) {
  return (
    <Dialog
      open={member !== null}
      onOpenChange={(next) => (!next ? onClose() : undefined)}
    >
      {member ? (
        <ResetPinForm
          key={member.memberId}
          member={member}
          busy={busy}
          c={c}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function ResetPinForm({
  member,
  busy,
  c,
  onClose,
  onSubmit,
}: {
  member: Member;
  busy: boolean;
  c: CopyFn;
  onClose: () => void;
  onSubmit: (member: Member, newPin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>
          {c("reset.title", { name: member.displayName })}
        </DialogTitle>
        <DialogDescription>
          {c("reset.hint", { name: member.displayName })}
        </DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pin.length < MIN_PIN_LENGTH) return setError(c("pin.tooShort"));
          if (pin !== confirm) return setError(c("pin.mismatch"));
          onSubmit(member, pin);
        }}
      >
        <Field id="team-reset-pin" label={c("reset.newPin")} required>
          {(control) => (
            <Input
              {...control}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              dir="ltr"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <Field
          id="team-reset-pin-confirm"
          label={c("reset.confirmPin")}
          error={error ?? undefined}
          required
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              dir="ltr"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={busy}
          >
            {c("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy || !pin || !confirm}>
            {busy ? (
              <Loader2
                className="me-2 size-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {c("reset.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function OwnerPinDialog({
  open,
  c,
  onCancel,
  onVerified,
}: {
  open: boolean;
  c: CopyFn;
  onCancel: () => void;
  onVerified: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? onCancel() : undefined)}
    >
      {open ? (
        <OwnerPinForm c={c} onCancel={onCancel} onVerified={onVerified} />
      ) : null}
    </Dialog>
  );
}

function OwnerPinForm({
  c,
  onCancel,
  onVerified,
}: {
  c: CopyFn;
  onCancel: () => void;
  onVerified: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verify() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        setError(c("reauth.wrong"));
        return;
      }
      onVerified();
    } catch {
      setError(c("team.error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{c("reauth.title")}</DialogTitle>
        <DialogDescription>{c("reauth.body")}</DialogDescription>
      </DialogHeader>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void verify();
        }}
      >
        <Field
          id="team-owner-pin"
          label={c("reauth.pin")}
          error={error ?? undefined}
          required
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              dir="ltr"
              autoFocus
              value={pin}
              onChange={(event) => {
                setPin(event.target.value);
                setError(null);
              }}
            />
          )}
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={pending}
          >
            {c("common.cancel")}
          </Button>
          <Button type="submit" disabled={pending || !pin}>
            {pending ? (
              <Loader2
                className="me-2 size-4 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {c("reauth.confirm")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
