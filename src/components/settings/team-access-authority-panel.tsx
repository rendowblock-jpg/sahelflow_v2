"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  KeyRound,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";

type InviteRole = "manager" | "operator" | "viewer";
type InvitationState = "pending" | "expired" | "revoked" | "accepted";
type Action = string;

type Invitation = {
  id: string;
  requestId: string;
  role: InviteRole;
  permissions: Action[] | null;
  shopIds: string[];
  createdAt: string;
  expiresAt: string;
  state: InvitationState;
};

type PermissionCatalog = {
  actions: Action[];
  ceilings: Record<InviteRole, Action[]>;
};

type Inventory = {
  authority: { revision: number; invitations: Invitation[] };
  shopOptions: Array<{ id: string; current: boolean }>;
  permissionCatalog: PermissionCatalog;
};

type CreatePayload = {
  requestId: string;
  role: InviteRole;
  permissions: Action[] | null;
  shopIds: string[];
  expiresInHours: number;
};

type ApiError = { error?: string; code?: string };
type CreateResponse = {
  invitation: Invitation;
  token: string | null;
  replayed: boolean;
  revision: number;
};
type PendingAction =
  | { kind: "create"; payload: CreatePayload }
  | { kind: "revoke"; invitationId: string };

const COPY = {
  en: {
    title: "Team access",
    description:
      "Create a single-use invitation with exact shop access and a server-validated role or custom allowlist.",
    create: "Create invitation",
    role: "Role",
    manager: "Manager",
    operator: "Operator",
    viewer: "Viewer",
    shop: "Shop access",
    currentShop: "Current shop",
    expiry: "Expires after",
    expiryOptions: { 24: "24 hours", 72: "3 days", 168: "7 days" },
    standard: "Use standard role permissions",
    custom: "Customize permissions",
    permissions: "Allowed actions",
    invitations: "Invitations",
    none: "No invitations have been created.",
    pending: "Pending",
    expired: "Expired",
    revoked: "Revoked",
    accepted: "Accepted",
    created: "Created",
    expires: "Expires",
    revoke: "Revoke",
    refresh: "Refresh",
    loading: "Loading team authority…",
    loadError: "Team authority could not be loaded.",
    createError: "The invitation could not be created.",
    revokeError: "The invitation could not be revoked.",
    tokenTitle: "Copy this invitation token now",
    tokenDescription:
      "Only its digest is stored. A lost token must be revoked and replaced.",
    tokenUnavailable:
      "This request was already committed and the one-time token cannot be shown again.",
    copy: "Copy token",
    copied: "Copied",
    reauthTitle: "Confirm with your PIN",
    reauthDescription:
      "Team access changes require a recent local PIN proof.",
    pin: "Enter PIN",
    confirm: "Verify and continue",
    cancel: "Cancel",
    incorrectPin: "The PIN could not be verified.",
    conflict: "The request changed. Start the action again.",
    emptyCeiling: "This role has no configurable actions.",
    actions: {
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
      "conversations.claim": "Claim conversations",
      "conversations.assign": "Assign conversations",
      "orders.read": "View orders",
      "orders.create": "Create orders",
      "orders.update": "Update orders",
      "orders.delete": "Delete orders",
      "orders.assign": "Assign orders",
      "customers.contact.read": "View customer contact details",
      "customers.contact.update": "Update customer contact details",
      "orders.financials.read": "View order financial fields",
      "orders.financials.update": "Update order financial fields",
      "approvals.request": "Request approvals",
      "approvals.approve": "Approve high-risk actions",
    } as Record<string, string>,
  },
  fr: {
    title: "Accès de l’équipe",
    description:
      "Créez une invitation à usage unique avec un accès boutique précis et un rôle ou une liste de droits validés par le serveur.",
    create: "Créer l’invitation",
    role: "Rôle",
    manager: "Responsable",
    operator: "Opérateur",
    viewer: "Lecteur",
    shop: "Accès boutique",
    currentShop: "Boutique actuelle",
    expiry: "Expiration après",
    expiryOptions: { 24: "24 heures", 72: "3 jours", 168: "7 jours" },
    standard: "Utiliser les droits standards du rôle",
    custom: "Personnaliser les droits",
    permissions: "Actions autorisées",
    invitations: "Invitations",
    none: "Aucune invitation n’a été créée.",
    pending: "En attente",
    expired: "Expirée",
    revoked: "Révoquée",
    accepted: "Acceptée",
    created: "Créée",
    expires: "Expire",
    revoke: "Révoquer",
    refresh: "Actualiser",
    loading: "Chargement de l’autorité d’équipe…",
    loadError: "Impossible de charger l’autorité d’équipe.",
    createError: "Impossible de créer l’invitation.",
    revokeError: "Impossible de révoquer l’invitation.",
    tokenTitle: "Copiez ce jeton maintenant",
    tokenDescription:
      "Seule son empreinte est conservée. Un jeton perdu doit être révoqué et remplacé.",
    tokenUnavailable:
      "Cette demande a déjà été validée et le jeton à usage unique ne peut plus être affiché.",
    copy: "Copier le jeton",
    copied: "Copié",
    reauthTitle: "Confirmez avec votre code PIN",
    reauthDescription:
      "Les changements d’accès équipe exigent une preuve PIN locale récente.",
    pin: "Saisir le PIN",
    confirm: "Vérifier et continuer",
    cancel: "Annuler",
    incorrectPin: "Le PIN n’a pas pu être vérifié.",
    conflict: "La demande a changé. Recommencez l’action.",
    emptyCeiling: "Ce rôle ne comporte aucune action configurable.",
    actions: {
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
      "conversations.claim": "Prendre les conversations",
      "conversations.assign": "Attribuer les conversations",
      "orders.read": "Voir les commandes",
      "orders.create": "Créer des commandes",
      "orders.update": "Modifier les commandes",
      "orders.delete": "Supprimer les commandes",
      "orders.assign": "Attribuer les commandes",
      "customers.contact.read": "Voir les coordonnées client",
      "customers.contact.update": "Modifier les coordonnées client",
      "orders.financials.read": "Voir les champs financiers des commandes",
      "orders.financials.update": "Modifier les champs financiers des commandes",
      "approvals.request": "Demander une approbation",
      "approvals.approve": "Approuver les actions sensibles",
    } as Record<string, string>,
  },
  ar: {
    title: "وصول الفريق",
    description:
      "أنشئ دعوة تستخدم مرة واحدة بصلاحية متجر دقيقة ودور أو قائمة صلاحيات يتحقق منها الخادم.",
    create: "إنشاء الدعوة",
    role: "الدور",
    manager: "مدير",
    operator: "مشغّل",
    viewer: "مشاهد",
    shop: "صلاحية المتجر",
    currentShop: "المتجر الحالي",
    expiry: "تنتهي بعد",
    expiryOptions: { 24: "24 ساعة", 72: "3 أيام", 168: "7 أيام" },
    standard: "استخدام صلاحيات الدور القياسية",
    custom: "تخصيص الصلاحيات",
    permissions: "الإجراءات المسموحة",
    invitations: "الدعوات",
    none: "لم يتم إنشاء أي دعوة.",
    pending: "قيد الانتظار",
    expired: "منتهية",
    revoked: "ملغاة",
    accepted: "مقبولة",
    created: "أُنشئت",
    expires: "تنتهي",
    revoke: "إلغاء الدعوة",
    refresh: "تحديث",
    loading: "جارٍ تحميل صلاحيات الفريق…",
    loadError: "تعذر تحميل صلاحيات الفريق.",
    createError: "تعذر إنشاء الدعوة.",
    revokeError: "تعذر إلغاء الدعوة.",
    tokenTitle: "انسخ رمز الدعوة الآن",
    tokenDescription:
      "يتم حفظ بصمته فقط. يجب إلغاء الرمز المفقود وإنشاء بديل.",
    tokenUnavailable:
      "تم اعتماد هذا الطلب سابقًا ولا يمكن عرض رمز الاستخدام الواحد مرة أخرى.",
    copy: "نسخ الرمز",
    copied: "تم النسخ",
    reauthTitle: "أكد العملية بالرمز السري",
    reauthDescription:
      "تغييرات وصول الفريق تتطلب إثبات رمز سري محلي حديث.",
    pin: "أدخل الرمز السري",
    confirm: "تحقق ثم تابع",
    cancel: "إلغاء",
    incorrectPin: "تعذر التحقق من الرمز السري.",
    conflict: "تغيّر الطلب. ابدأ العملية من جديد.",
    emptyCeiling: "لا يحتوي هذا الدور على إجراءات قابلة للتخصيص.",
    actions: {
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
      "conversations.claim": "استلام المحادثات",
      "conversations.assign": "إسناد المحادثات",
      "orders.read": "عرض الطلبات",
      "orders.create": "إنشاء الطلبات",
      "orders.update": "تعديل الطلبات",
      "orders.delete": "حذف الطلبات",
      "orders.assign": "إسناد الطلبات",
      "customers.contact.read": "عرض بيانات تواصل العميل",
      "customers.contact.update": "تعديل بيانات تواصل العميل",
      "orders.financials.read": "عرض الحقول المالية للطلب",
      "orders.financials.update": "تعديل الحقول المالية للطلب",
      "approvals.request": "طلب الموافقة",
      "approvals.approve": "الموافقة على الإجراءات الحساسة",
    } as Record<string, string>,
  },
} as const;

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export function TeamAccessAuthorityPanel() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<InviteRole>("operator");
  const [expiry, setExpiry] = useState(24);
  const [custom, setCustom] = useState(false);
  const [permissions, setPermissions] = useState<Action[]>([]);
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tokenUnavailable, setTokenUnavailable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-GB",
        { dateStyle: "medium", timeStyle: "short" },
      ),
    [locale],
  );

  const applyInventory = useCallback((body: Inventory) => {
    setInventory(body);
    setShopIds((current) => {
      const allowed = new Set(body.shopOptions.map((shop) => shop.id));
      const retained = current.filter((id) => allowed.has(id));
      return retained.length > 0
        ? retained
        : body.shopOptions.filter((shop) => shop.current).map((shop) => shop.id);
    });
    setPermissions((current) =>
      current.length > 0 ? current : [...body.permissionCatalog.ceilings.operator],
    );
  }, []);

  const requestInventory = useCallback(async (): Promise<Inventory> => {
    const response = await fetch("/api/auth/invitations", { cache: "no-store" });
    const body = (await response.json()) as Inventory & ApiError;
    if (!response.ok) throw new Error(body.error ?? copy.loadError);
    return body;
  }, [copy.loadError]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applyInventory(await requestInventory());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [applyInventory, copy.loadError, requestInventory]);

  useEffect(() => {
    let active = true;
    void requestInventory()
      .then((body) => {
        if (active) applyInventory(body);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : copy.loadError);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applyInventory, copy.loadError, requestInventory]);

  const ceiling = useMemo(
    () => inventory?.permissionCatalog.ceilings[role] ?? [],
    [inventory, role],
  );
  const orderedCeiling = useMemo(
    () =>
      (inventory?.permissionCatalog.actions ?? []).filter((action) =>
        ceiling.includes(action),
      ),
    [ceiling, inventory],
  );

  const changeRole = (next: InviteRole) => {
    setRole(next);
    setPermissions([...(inventory?.permissionCatalog.ceilings[next] ?? [])]);
  };

  const executeCreate = useCallback(
    async (payload: CreatePayload, proofRefreshed = false) => {
      setCreating(true);
      setError(null);
      setTokenUnavailable(false);
      try {
        const response = await fetch("/api/auth/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = (await response.json()) as CreateResponse & ApiError;
        if (
          response.status === 403 &&
          body.code === "REAUTHENTICATION_REQUIRED" &&
          !proofRefreshed
        ) {
          setPending({ kind: "create", payload });
          setPin("");
          setPinError(null);
          return;
        }
        if (!response.ok) {
          throw new Error(
            body.code === "INVITATION_IDEMPOTENCY_CONFLICT"
              ? copy.conflict
              : body.error ?? copy.createError,
          );
        }
        setToken(body.token);
        setTokenUnavailable(body.replayed && body.token === null);
        setPending(null);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.createError);
      } finally {
        setCreating(false);
      }
    },
    [copy.conflict, copy.createError, refresh],
  );

  const executeRevoke = useCallback(
    async (invitationId: string, proofRefreshed = false) => {
      setBusyId(invitationId);
      setError(null);
      try {
        const response = await fetch(
          `/api/auth/invitations/${encodeURIComponent(invitationId)}/revoke`,
          { method: "POST" },
        );
        const body = (await response.json()) as ApiError;
        if (
          response.status === 403 &&
          body.code === "REAUTHENTICATION_REQUIRED" &&
          !proofRefreshed
        ) {
          setPending({ kind: "revoke", invitationId });
          setPin("");
          setPinError(null);
          return;
        }
        if (!response.ok) throw new Error(body.error ?? copy.revokeError);
        setPending(null);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.revokeError);
      } finally {
        setBusyId(null);
      }
    },
    [copy.revokeError, refresh],
  );

  const verifyPin = useCallback(async () => {
    if (!pending || !pin.trim()) return;
    setPinError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json()) as ApiError;
      if (!response.ok) {
        setPinError(body.error ?? copy.incorrectPin);
        return;
      }
      const action = pending;
      setPending(null);
      setPin("");
      if (action.kind === "create") await executeCreate(action.payload, true);
      else await executeRevoke(action.invitationId, true);
    } catch {
      setPinError(copy.incorrectPin);
    }
  }, [copy.incorrectPin, executeCreate, executeRevoke, pending, pin]);

  const invitations = inventory?.authority.invitations ?? [];

  return (
    <section className="space-y-5" aria-labelledby="team-access-authority-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 id="team-access-authority-title" className="text-base font-semibold">
              {copy.title}
            </h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {copy.refresh}
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          <h4 className="text-sm font-semibold">{copy.create}</h4>
        </div>

        {loading && !inventory ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {copy.loading}
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">{copy.role}</span>
                <select
                  value={role}
                  onChange={(event) => changeRole(event.target.value as InviteRole)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="manager">{copy.manager}</option>
                  <option value="operator">{copy.operator}</option>
                  <option value="viewer">{copy.viewer}</option>
                </select>
              </label>

              <label className="space-y-1.5 text-sm">
                <span className="font-medium">{copy.expiry}</span>
                <select
                  value={expiry}
                  onChange={(event) => setExpiry(Number(event.target.value))}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {[24, 72, 168].map((hours) => (
                    <option key={hours} value={hours}>
                      {copy.expiryOptions[hours as keyof typeof copy.expiryOptions]}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="space-y-2 text-sm">
                <legend className="font-medium">{copy.shop}</legend>
                {(inventory?.shopOptions ?? []).map((shop) => (
                  <label key={shop.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={shopIds.includes(shop.id)}
                      onChange={(event) =>
                        setShopIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, shop.id])]
                            : current.filter((id) => id !== shop.id),
                        )
                      }
                    />
                    <span>{shop.current ? copy.currentShop : shop.id}</span>
                  </label>
                ))}
              </fieldset>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={custom}
                onChange={(event) => setCustom(event.target.checked)}
              />
              <span>{custom ? copy.custom : copy.standard}</span>
            </label>

            {custom ? (
              <fieldset className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <legend className="mb-2 text-sm font-medium">{copy.permissions}</legend>
                {orderedCeiling.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{copy.emptyCeiling}</p>
                ) : (
                  orderedCeiling.map((action) => (
                    <label key={action} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={permissions.includes(action)}
                        onChange={(event) =>
                          setPermissions((current) =>
                            event.target.checked
                              ? [...new Set([...current, action])]
                              : current.filter((value) => value !== action),
                          )
                        }
                      />
                      <span>{copy.actions[action] ?? action}</span>
                    </label>
                  ))
                )}
              </fieldset>
            ) : null}

            <Button
              className="mt-4"
              disabled={creating || shopIds.length === 0}
              onClick={() =>
                void executeCreate({
                  requestId: newRequestId(),
                  role,
                  permissions: custom ? permissions : null,
                  shopIds,
                  expiresInHours: expiry,
                })
              }
            >
              {creating ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {copy.create}
            </Button>
          </>
        )}
      </div>

      {token ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h4 className="text-sm font-semibold">{copy.tokenTitle}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{copy.tokenDescription}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code dir="ltr" className="min-w-0 flex-1 break-all rounded-md border bg-background p-3 text-xs">
              {token}
            </code>
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(token).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                })
              }
            >
              {copied ? <Check className="me-2 h-4 w-4" /> : <Clipboard className="me-2 h-4 w-4" />}
              {copied ? copy.copied : copy.copy}
            </Button>
          </div>
        </div>
      ) : null}

      {tokenUnavailable ? (
        <div role="alert" className="rounded-lg border p-4 text-sm text-muted-foreground">
          {copy.tokenUnavailable}
        </div>
      ) : null}

      <div className="rounded-lg border">
        <div className="border-b px-4 py-3">
          <h4 className="text-sm font-semibold">{copy.invitations}</h4>
        </div>
        {invitations.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{copy.none}</p>
        ) : (
          <ul className="divide-y">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{copy[invitation.role]}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {copy[invitation.state]}
                    </span>
                    <code dir="ltr" className="text-xs text-muted-foreground">
                      {invitation.id.slice(-12)}
                    </code>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {copy.created}: {formatter.format(new Date(invitation.createdAt))} · {copy.expires}: {formatter.format(new Date(invitation.expiresAt))}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={invitation.state !== "pending" || busyId === invitation.id}
                  onClick={() => void executeRevoke(invitation.id)}
                >
                  {copy.revoke}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pending ? (
        <div className="rounded-lg border p-4" role="dialog" aria-labelledby="team-authority-reauth-title">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            <h4 id="team-authority-reauth-title" className="text-sm font-semibold">
              {copy.reauthTitle}
            </h4>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{copy.reauthDescription}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder={copy.pin}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verifyPin();
              }}
            />
            <Button disabled={!pin.trim()} onClick={() => void verifyPin()}>
              {copy.confirm}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPending(null);
                setPin("");
                setPinError(null);
              }}
            >
              {copy.cancel}
            </Button>
          </div>
          {pinError ? <p role="alert" className="mt-2 text-sm text-destructive">{pinError}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
