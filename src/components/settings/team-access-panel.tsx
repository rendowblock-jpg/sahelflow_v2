"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, KeyRound, RefreshCw, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";

const ACTIONS = [
  "shops.read",
  "shops.switch",
  "shops.create",
  "shops.delete",
  "members.read",
  "members.manage",
  "devices.read",
  "devices.manage",
  "sessions.read",
  "sessions.revoke",
] as const;

type Action = (typeof ACTIONS)[number];
type InviteRole = "manager" | "operator" | "viewer";
type InvitationState = "pending" | "expired" | "revoked" | "accepted";

const ROLE_CEILINGS: Record<InviteRole, readonly Action[]> = {
  manager: [
    "shops.read",
    "shops.switch",
    "members.read",
    "devices.read",
    "sessions.read",
  ],
  operator: ["shops.read", "shops.switch"],
  viewer: ["shops.read"],
};

const COPY = {
  en: {
    title: "Team access",
    description:
      "Create an expiring, single-use invitation with an exact role and shop grant. The invitation token is displayed only when it is first created.",
    create: "Create invitation",
    role: "Role",
    manager: "Manager",
    operator: "Operator",
    viewer: "Viewer",
    shop: "Shop access",
    expiry: "Expires after",
    hours24: "24 hours",
    hours72: "3 days",
    hours168: "7 days",
    standard: "Use standard role permissions",
    custom: "Customize permissions",
    permissions: "Allowed actions",
    invitations: "Invitations",
    noInvitations: "No invitations have been created.",
    pending: "Pending",
    expired: "Expired",
    revoked: "Revoked",
    accepted: "Accepted",
    created: "Created",
    expires: "Expires",
    revoke: "Revoke",
    refreshing: "Refreshing…",
    refresh: "Refresh",
    loading: "Loading team authority…",
    loadError: "Team authority could not be loaded.",
    createError: "The invitation could not be created.",
    revokeError: "The invitation could not be revoked.",
    tokenTitle: "Copy this invitation token now",
    tokenDescription:
      "SahelFlow stores only its digest. If this token is lost, revoke the invitation and create another one.",
    copy: "Copy token",
    copied: "Copied",
    tokenUnavailable:
      "This request was already committed, so the one-time token is no longer available. Revoke it and create another invitation if the token was not saved.",
    reauthTitle: "Confirm with your PIN",
    reauthDescription:
      "Creating or revoking team access is a high-risk action. Verify your PIN to continue.",
    pinPlaceholder: "Enter PIN",
    confirm: "Verify and continue",
    cancel: "Cancel",
    incorrectPin: "The PIN could not be verified.",
    currentShop: "Current shop",
    requestConflict: "The request changed. Start the action again.",
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
    },
  },
  fr: {
    title: "Accès de l’équipe",
    description:
      "Créez une invitation à usage unique et à durée limitée avec un rôle et un accès boutique précis. Le jeton n’est affiché qu’à la création.",
    create: "Créer l’invitation",
    role: "Rôle",
    manager: "Responsable",
    operator: "Opérateur",
    viewer: "Lecteur",
    shop: "Accès boutique",
    expiry: "Expiration après",
    hours24: "24 heures",
    hours72: "3 jours",
    hours168: "7 jours",
    standard: "Utiliser les droits standards du rôle",
    custom: "Personnaliser les droits",
    permissions: "Actions autorisées",
    invitations: "Invitations",
    noInvitations: "Aucune invitation n’a été créée.",
    pending: "En attente",
    expired: "Expirée",
    revoked: "Révoquée",
    accepted: "Acceptée",
    created: "Créée",
    expires: "Expire",
    revoke: "Révoquer",
    refreshing: "Actualisation…",
    refresh: "Actualiser",
    loading: "Chargement de l’autorité d’équipe…",
    loadError: "Impossible de charger l’autorité d’équipe.",
    createError: "Impossible de créer l’invitation.",
    revokeError: "Impossible de révoquer l’invitation.",
    tokenTitle: "Copiez ce jeton maintenant",
    tokenDescription:
      "SahelFlow ne conserve que son empreinte. Si le jeton est perdu, révoquez l’invitation et créez-en une autre.",
    copy: "Copier le jeton",
    copied: "Copié",
    tokenUnavailable:
      "Cette demande a déjà été validée; le jeton à usage unique n’est plus disponible. Révoquez l’invitation et créez-en une autre s’il n’a pas été sauvegardé.",
    reauthTitle: "Confirmez avec votre code PIN",
    reauthDescription:
      "Créer ou révoquer un accès équipe est une action sensible. Vérifiez votre PIN pour continuer.",
    pinPlaceholder: "Saisir le PIN",
    confirm: "Vérifier et continuer",
    cancel: "Annuler",
    incorrectPin: "Le PIN n’a pas pu être vérifié.",
    currentShop: "Boutique actuelle",
    requestConflict: "La demande a changé. Recommencez l’action.",
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
    },
  },
  ar: {
    title: "وصول الفريق",
    description:
      "أنشئ دعوة مؤقتة تُستخدم مرة واحدة مع دور وصلاحية متجر محددين. يظهر رمز الدعوة عند إنشائها فقط.",
    create: "إنشاء الدعوة",
    role: "الدور",
    manager: "مدير",
    operator: "مشغّل",
    viewer: "مشاهد",
    shop: "صلاحية المتجر",
    expiry: "تنتهي بعد",
    hours24: "24 ساعة",
    hours72: "3 أيام",
    hours168: "7 أيام",
    standard: "استخدام صلاحيات الدور القياسية",
    custom: "تخصيص الصلاحيات",
    permissions: "الإجراءات المسموحة",
    invitations: "الدعوات",
    noInvitations: "لم يتم إنشاء أي دعوة.",
    pending: "قيد الانتظار",
    expired: "منتهية",
    revoked: "ملغاة",
    accepted: "مقبولة",
    created: "أُنشئت",
    expires: "تنتهي",
    revoke: "إلغاء الدعوة",
    refreshing: "جارٍ التحديث…",
    refresh: "تحديث",
    loading: "جارٍ تحميل صلاحيات الفريق…",
    loadError: "تعذر تحميل صلاحيات الفريق.",
    createError: "تعذر إنشاء الدعوة.",
    revokeError: "تعذر إلغاء الدعوة.",
    tokenTitle: "انسخ رمز الدعوة الآن",
    tokenDescription:
      "يخزن SahelFlow بصمة الرمز فقط. إذا ضاع الرمز فألغِ الدعوة وأنشئ دعوة جديدة.",
    copy: "نسخ الرمز",
    copied: "تم النسخ",
    tokenUnavailable:
      "تم اعتماد هذا الطلب سابقًا، لذلك لم يعد رمز الاستخدام الواحد متاحًا. ألغِ الدعوة وأنشئ أخرى إذا لم يتم حفظ الرمز.",
    reauthTitle: "أكد العملية بالرمز السري",
    reauthDescription:
      "إنشاء وصول الفريق أو إلغاؤه عملية حساسة. تحقق من الرمز السري للمتابعة.",
    pinPlaceholder: "أدخل الرمز السري",
    confirm: "تحقق ثم تابع",
    cancel: "إلغاء",
    incorrectPin: "تعذر التحقق من الرمز السري.",
    currentShop: "المتجر الحالي",
    requestConflict: "تغيّر الطلب. ابدأ العملية من جديد.",
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
    },
  },
} as const;

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

type InventoryResponse = {
  authority: { revision: number; invitations: Invitation[] };
  shopOptions: Array<{ id: string; current: boolean }>;
};

type CreatePayload = {
  requestId: string;
  role: InviteRole;
  permissions: Action[] | null;
  shopIds: string[];
  expiresInHours: number;
};

type CreateResponse = {
  invitation: Invitation;
  token: string | null;
  replayed: boolean;
  revision: number;
};

type ApiError = { error?: string; code?: string };
type PendingAction =
  | { kind: "create"; payload: CreatePayload }
  | { kind: "revoke"; invitationId: string };

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
      const random = Math.floor(Math.random() * 16);
      const next = value === "x" ? random : (random & 0x3) | 0x8;
      return next.toString(16);
    });
}

export function TeamAccessPanel() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [inventory, setInventory] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<InviteRole>("operator");
  const [expiresInHours, setExpiresInHours] = useState(24);
  const [useCustomPermissions, setUseCustomPermissions] = useState(false);
  const [permissions, setPermissions] = useState<Action[]>([
    ...ROLE_CEILINGS.operator,
  ]);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenUnavailable, setTokenUnavailable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
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

  const formatDate = useCallback(
    (value: string): string => {
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? formatter.format(date) : "—";
    },
    [formatter],
  );

  const requestInventory = useCallback(async (): Promise<InventoryResponse> => {
    const response = await fetch("/api/auth/invitations", { cache: "no-store" });
    const body = (await response.json()) as InventoryResponse & ApiError;
    if (!response.ok) throw new Error(body.error ?? copy.loadError);
    return body;
  }, [copy.loadError]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await requestInventory();
      setInventory(body);
      setSelectedShopIds((current) =>
        current.length > 0
          ? current.filter((id) => body.shopOptions.some((shop) => shop.id === id))
          : body.shopOptions.filter((shop) => shop.current).map((shop) => shop.id),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, requestInventory]);

  useEffect(() => {
    let active = true;
    void requestInventory()
      .then((body) => {
        if (!active) return;
        setInventory(body);
        setSelectedShopIds(
          body.shopOptions.filter((shop) => shop.current).map((shop) => shop.id),
        );
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : copy.loadError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [copy.loadError, requestInventory]);

  const changeRole = useCallback((nextRole: InviteRole) => {
    setRole(nextRole);
    setPermissions([...ROLE_CEILINGS[nextRole]]);
  }, []);

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
          setPendingAction({ kind: "create", payload });
          setPin("");
          setPinError(null);
          return;
        }
        if (!response.ok) {
          throw new Error(
            body.code === "INVITATION_IDEMPOTENCY_CONFLICT"
              ? copy.requestConflict
              : body.error ?? copy.createError,
          );
        }
        setCreatedToken(body.token);
        setTokenUnavailable(body.replayed && body.token === null);
        setPendingAction(null);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.createError);
      } finally {
        setCreating(false);
      }
    },
    [copy.createError, copy.requestConflict, refresh],
  );

  const executeRevoke = useCallback(
    async (invitationId: string, proofRefreshed = false) => {
      setBusyInvitationId(invitationId);
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
          setPendingAction({ kind: "revoke", invitationId });
          setPin("");
          setPinError(null);
          return;
        }
        if (!response.ok) throw new Error(body.error ?? copy.revokeError);
        setPendingAction(null);
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.revokeError);
      } finally {
        setBusyInvitationId(null);
      }
    },
    [copy.revokeError, refresh],
  );

  const submitInvitation = useCallback(() => {
    if (selectedShopIds.length === 0) return;
    const payload: CreatePayload = {
      requestId: newRequestId(),
      role,
      permissions: useCustomPermissions ? permissions : null,
      shopIds: selectedShopIds,
      expiresInHours,
    };
    void executeCreate(payload);
  }, [executeCreate, expiresInHours, permissions, role, selectedShopIds, useCustomPermissions]);

  const verifyPinAndContinue = useCallback(async () => {
    if (!pendingAction || !pin.trim()) return;
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
      const action = pendingAction;
      setPendingAction(null);
      setPin("");
      if (action.kind === "create") {
        await executeCreate(action.payload, true);
      } else {
        await executeRevoke(action.invitationId, true);
      }
    } catch {
      setPinError(copy.incorrectPin);
    }
  }, [copy.incorrectPin, executeCreate, executeRevoke, pendingAction, pin]);

  const copyCreatedToken = useCallback(async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [createdToken]);

  const ceiling = ROLE_CEILINGS[role];
  const invitations = inventory?.authority.invitations ?? [];

  return (
    <section className="space-y-5" aria-labelledby="team-access-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 id="team-access-title" className="text-base font-semibold">
              {copy.title}
            </h3>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {copy.description}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw
            className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {loading ? copy.refreshing : copy.refresh}
        </Button>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <h4 className="text-sm font-semibold">{copy.create}</h4>
        </div>

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
              value={expiresInHours}
              onChange={(event) => setExpiresInHours(Number(event.target.value))}
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value={24}>{copy.hours24}</option>
              <option value={72}>{copy.hours72}</option>
              <option value={168}>{copy.hours168}</option>
            </select>
          </label>

          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">{copy.shop}</legend>
            {(inventory?.shopOptions ?? []).map((shop) => (
              <label key={shop.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedShopIds.includes(shop.id)}
                  onChange={(event) =>
                    setSelectedShopIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, shop.id])]
                        : current.filter((id) => id !== shop.id),
                    )
                  }
                />
                <span>
                  {shop.current ? copy.currentShop : shop.id}
                  <span dir="ltr" className="ms-1 font-mono text-xs text-muted-foreground">
                    ({shop.id})
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCustomPermissions}
              onChange={(event) => setUseCustomPermissions(event.target.checked)}
            />
            <span>{useCustomPermissions ? copy.custom : copy.standard}</span>
          </label>

          {useCustomPermissions ? (
            <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <legend className="mb-2 text-sm font-medium">{copy.permissions}</legend>
              {ceiling.map((action) => (
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
                  <span>{copy.actions[action]}</span>
                </label>
              ))}
            </fieldset>
          ) : null}
        </div>

        <Button
          type="button"
          className="mt-4"
          onClick={submitInvitation}
          disabled={creating || selectedShopIds.length === 0}
        >
          {copy.create}
        </Button>
      </div>

      {createdToken ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h4 className="text-sm font-semibold">{copy.tokenTitle}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{copy.tokenDescription}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code dir="ltr" className="min-w-0 flex-1 break-all rounded-md border bg-background p-3 text-xs">
              {createdToken}
            </code>
            <Button type="button" variant="outline" onClick={() => void copyCreatedToken()}>
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
        {loading && !inventory ? (
          <p className="p-4 text-sm text-muted-foreground">{copy.loading}</p>
        ) : invitations.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{copy.noInvitations}</p>
        ) : (
          <ul className="divide-y">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {invitation.role === "manager"
                        ? copy.manager
                        : invitation.role === "operator"
                          ? copy.operator
                          : copy.viewer}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {copy[invitation.state]}
                    </span>
                    <code dir="ltr" className="text-xs text-muted-foreground">
                      {invitation.id.slice(-12)}
                    </code>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {copy.created}: {formatDate(invitation.createdAt)} · {copy.expires}: {formatDate(invitation.expiresAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={invitation.state !== "pending" || busyInvitationId === invitation.id}
                  onClick={() => void executeRevoke(invitation.id)}
                >
                  {copy.revoke}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingAction ? (
        <div className="rounded-lg border p-4" role="dialog" aria-modal="false" aria-labelledby="team-reauth-title">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <h4 id="team-reauth-title" className="text-sm font-semibold">
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
              placeholder={copy.pinPlaceholder}
              aria-label={copy.pinPlaceholder}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verifyPinAndContinue();
              }}
            />
            <Button
              type="button"
              onClick={() => void verifyPinAndContinue()}
              disabled={!pin.trim()}
            >
              {copy.confirm}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingAction(null);
                setPin("");
                setPinError(null);
              }}
            >
              {copy.cancel}
            </Button>
          </div>
          {pinError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {pinError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
