"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, KeyRound, RefreshCw, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";

export const ACTIONS = [
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
      "Create an expiring, single-use invitation with an exact role and shop grant. The token is shown only when it is first created.",
    create: "Create invitation",
    role: "Role",
    manager: "Manager",
    operator: "Operator",
    viewer: "Viewer",
    shop: "Shop access",
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
    refreshing: "Refreshing…",
    loading: "Loading team authority…",
    loadError: "Team authority could not be loaded.",
    createError: "The invitation could not be created.",
    revokeError: "The invitation could not be revoked.",
    tokenTitle: "Copy this invitation token now",
    tokenDescription:
      "SahelFlow stores only its digest. If it is lost, revoke the invitation and create another one.",
    tokenUnavailable:
      "This request was already committed, so the one-time token is unavailable. Revoke it and create another invitation if it was not saved.",
    copy: "Copy token",
    copied: "Copied",
    reauthTitle: "Confirm with your PIN",
    reauthDescription:
      "Creating or revoking team access is a high-risk action. Verify your PIN to continue.",
    pin: "Enter PIN",
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
    refreshing: "Actualisation…",
    loading: "Chargement de l’autorité d’équipe…",
    loadError: "Impossible de charger l’autorité d’équipe.",
    createError: "Impossible de créer l’invitation.",
    revokeError: "Impossible de révoquer l’invitation.",
    tokenTitle: "Copiez ce jeton maintenant",
    tokenDescription:
      "SahelFlow ne conserve que son empreinte. S’il est perdu, révoquez l’invitation et créez-en une autre.",
    tokenUnavailable:
      "Cette demande a déjà été validée; le jeton à usage unique est indisponible. Révoquez l’invitation et créez-en une autre s’il n’a pas été sauvegardé.",
    copy: "Copier le jeton",
    copied: "Copié",
    reauthTitle: "Confirmez avec votre code PIN",
    reauthDescription:
      "Créer ou révoquer un accès équipe est une action sensible. Vérifiez votre PIN pour continuer.",
    pin: "Saisir le PIN",
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
      "أنشئ دعوة مؤقتة تُستخدم مرة واحدة مع دور وصلاحية متجر محددين. يظهر الرمز عند إنشاء الدعوة فقط.",
    create: "إنشاء الدعوة",
    role: "الدور",
    manager: "مدير",
    operator: "مشغّل",
    viewer: "مشاهد",
    shop: "صلاحية المتجر",
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
    refreshing: "جارٍ التحديث…",
    loading: "جارٍ تحميل صلاحيات الفريق…",
    loadError: "تعذر تحميل صلاحيات الفريق.",
    createError: "تعذر إنشاء الدعوة.",
    revokeError: "تعذر إلغاء الدعوة.",
    tokenTitle: "انسخ رمز الدعوة الآن",
    tokenDescription:
      "يخزن SahelFlow بصمة الرمز فقط. إذا ضاع فألغِ الدعوة وأنشئ دعوة جديدة.",
    tokenUnavailable:
      "تم اعتماد هذا الطلب سابقًا، لذلك رمز الاستخدام الواحد غير متاح. ألغِ الدعوة وأنشئ أخرى إذا لم يتم حفظه.",
    copy: "نسخ الرمز",
    copied: "تم النسخ",
    reauthTitle: "أكد العملية بالرمز السري",
    reauthDescription:
      "إنشاء وصول الفريق أو إلغاؤه عملية حساسة. تحقق من الرمز السري للمتابعة.",
    pin: "أدخل الرمز السري",
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

type Inventory = {
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
  return globalThis.crypto.randomUUID();
}

export function TeamAccessPanel() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<InviteRole>("operator");
  const [expiry, setExpiry] = useState(24);
  const [custom, setCustom] = useState(false);
  const [permissions, setPermissions] = useState<Action[]>([
    ...ROLE_CEILINGS.operator,
  ]);
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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

  const formatDate = useCallback(
    (value: string) => {
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? formatter.format(date) : "—";
    },
    [formatter],
  );

  const requestInventory = useCallback(async (): Promise<Inventory> => {
    const response = await fetch("/api/auth/invitations", { cache: "no-store" });
    const body = (await response.json()) as Inventory & ApiError;
    if (!response.ok) throw new Error(body.error ?? copy.loadError);
    return body;
  }, [copy.loadError]);

  const applyInventory = useCallback((body: Inventory) => {
    setInventory(body);
    setShopIds((current) => {
      const allowed = new Set(body.shopOptions.map((shop) => shop.id));
      const retained = current.filter((id) => allowed.has(id));
      return retained.length > 0
        ? retained
        : body.shopOptions.filter((shop) => shop.current).map((shop) => shop.id);
    });
  }, []);

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

  const orderedCeiling = useMemo(
    () => ACTIONS.filter((action) => ROLE_CEILINGS[role].includes(action)),
    [role],
  );

  const changeRole = useCallback((next: InviteRole) => {
    setRole(next);
    setPermissions([...ROLE_CEILINGS[next]]);
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
          setPending({ kind: "create", payload });
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
    [copy.createError, copy.requestConflict, refresh],
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

  const submit = useCallback(() => {
    if (shopIds.length === 0) return;
    void executeCreate({
      requestId: newRequestId(),
      role,
      permissions: custom ? permissions : null,
      shopIds,
      expiresInHours: expiry,
    });
  }, [custom, executeCreate, expiry, permissions, role, shopIds]);

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

  const copyToken = useCallback(async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [token]);

  const invitations = inventory?.authority.invitations ?? [];
  const roleLabel = (value: InviteRole) => copy[value];

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
        <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
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
            <select value={role} onChange={(event) => changeRole(event.target.value as InviteRole)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="manager">{copy.manager}</option>
              <option value="operator">{copy.operator}</option>
              <option value="viewer">{copy.viewer}</option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">{copy.expiry}</span>
            <select value={expiry} onChange={(event) => setExpiry(Number(event.target.value))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
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

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={custom} onChange={(event) => setCustom(event.target.checked)} />
          <span>{custom ? copy.custom : copy.standard}</span>
        </label>

        {custom ? (
          <fieldset className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">{copy.permissions}</legend>
            {orderedCeiling.map((action) => (
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

        <Button type="button" className="mt-4" onClick={submit} disabled={creating || shopIds.length === 0}>
          {copy.create}
        </Button>
      </div>

      {token ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h4 className="text-sm font-semibold">{copy.tokenTitle}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{copy.tokenDescription}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code dir="ltr" className="min-w-0 flex-1 break-all rounded-md border bg-background p-3 text-xs">
              {token}
            </code>
            <Button type="button" variant="outline" onClick={() => void copyToken()}>
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
          <p className="p-4 text-sm text-muted-foreground">{copy.none}</p>
        ) : (
          <ul className="divide-y">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{roleLabel(invitation.role)}</span>
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
        <div className="rounded-lg border p-4" role="dialog" aria-modal="false" aria-labelledby="team-reauth-title">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <h4 id="team-reauth-title" className="text-sm font-semibold">{copy.reauthTitle}</h4>
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
              aria-label={copy.pin}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verifyPin();
              }}
            />
            <Button type="button" onClick={() => void verifyPin()} disabled={!pin.trim()}>
              {copy.confirm}
            </Button>
            <Button
              type="button"
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
