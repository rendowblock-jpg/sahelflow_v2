"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCw, ShieldOff, UserRoundCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";

const COPY = {
  en: {
    title: "Accepted members",
    description:
      "Review individual identities, exact shop access and session health. Revoking a member denies every registered session immediately.",
    none: "No team members have accepted an invitation yet.",
    loading: "Loading accepted members…",
    loadError: "Accepted members could not be loaded.",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    ownerOnly: "Only the workspace owner can revoke a member.",
    active: "Active",
    revoked: "Revoked",
    sessions: "Sessions",
    activeSessions: "active",
    shopAccess: "Shop access",
    custom: "Custom permissions",
    standard: "Standard role permissions",
    revoke: "Revoke member",
    revokeError: "The member could not be revoked.",
    reauthTitle: "Confirm member revocation",
    reauthDescription:
      "Revoking a member immediately denies every registered session. Verify your PIN to continue.",
    pin: "Enter PIN",
    confirm: "Verify and revoke",
    cancel: "Cancel",
    incorrectPin: "The PIN could not be verified.",
    manager: "Manager",
    operator: "Operator",
    viewer: "Viewer",
  },
  fr: {
    title: "Membres acceptés",
    description:
      "Consultez les identités individuelles, les boutiques autorisées et l’état des sessions. La révocation bloque immédiatement toutes les sessions enregistrées.",
    none: "Aucun membre n’a encore accepté une invitation.",
    loading: "Chargement des membres acceptés…",
    loadError: "Impossible de charger les membres acceptés.",
    refresh: "Actualiser",
    refreshing: "Actualisation…",
    ownerOnly: "Seul le propriétaire peut révoquer un membre.",
    active: "Actif",
    revoked: "Révoqué",
    sessions: "Sessions",
    activeSessions: "actives",
    shopAccess: "Accès boutique",
    custom: "Droits personnalisés",
    standard: "Droits standards du rôle",
    revoke: "Révoquer le membre",
    revokeError: "Impossible de révoquer le membre.",
    reauthTitle: "Confirmer la révocation",
    reauthDescription:
      "La révocation bloque immédiatement toutes les sessions enregistrées. Vérifiez votre PIN pour continuer.",
    pin: "Saisir le PIN",
    confirm: "Vérifier et révoquer",
    cancel: "Annuler",
    incorrectPin: "Le PIN n’a pas pu être vérifié.",
    manager: "Responsable",
    operator: "Opérateur",
    viewer: "Lecteur",
  },
  ar: {
    title: "الأعضاء المقبولون",
    description:
      "راجع الهويات الفردية وصلاحيات المتاجر وحالة الجلسات. إلغاء العضو يمنع جميع جلساته المسجلة فورًا.",
    none: "لم يقبل أي عضو دعوة بعد.",
    loading: "جارٍ تحميل الأعضاء المقبولين…",
    loadError: "تعذر تحميل الأعضاء المقبولين.",
    refresh: "تحديث",
    refreshing: "جارٍ التحديث…",
    ownerOnly: "يمكن لمالك مساحة العمل فقط إلغاء عضو.",
    active: "نشط",
    revoked: "ملغى",
    sessions: "الجلسات",
    activeSessions: "نشطة",
    shopAccess: "صلاحية المتجر",
    custom: "صلاحيات مخصصة",
    standard: "صلاحيات الدور القياسية",
    revoke: "إلغاء العضو",
    revokeError: "تعذر إلغاء العضو.",
    reauthTitle: "تأكيد إلغاء العضو",
    reauthDescription:
      "إلغاء العضو يمنع جميع جلساته المسجلة فورًا. تحقق من رمز PIN للمتابعة.",
    pin: "أدخل رمز PIN",
    confirm: "تحقق ثم ألغِ العضو",
    cancel: "إلغاء",
    incorrectPin: "تعذر التحقق من رمز PIN.",
    manager: "مدير",
    operator: "مشغّل",
    viewer: "مشاهد",
  },
} as const;

type AdministrativeSession = {
  sessionId: string;
  databaseState: "active" | "revoked" | "missing";
};

type AdministrativeMember = {
  personId: string;
  memberId: string;
  deviceId: string;
  displayName: string;
  loginId: string;
  role: "manager" | "operator" | "viewer";
  permissions: string[] | null;
  shopIds: string[];
  revokedAt: string | null;
  sessions: AdministrativeSession[];
};

type MembersResponse = {
  authority: { revision: number; members: AdministrativeMember[] };
  currentActor: {
    personId: string | null;
    memberId: string | null;
    role: "owner" | "manager" | "operator" | "viewer";
  };
};

type ApiError = { error?: string; code?: string };

function shortId(value: string): string {
  return value.length <= 12 ? value : `…${value.slice(-12)}`;
}

export function TeamMembersPanel() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [inventory, setInventory] = useState<MembersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const requestMembers = useCallback(async (): Promise<MembersResponse> => {
    const response = await fetch("/api/auth/members", { cache: "no-store" });
    const body = (await response.json()) as MembersResponse & ApiError;
    if (!response.ok) throw new Error(body.error ?? copy.loadError);
    return body;
  }, [copy.loadError]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInventory(await requestMembers());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, requestMembers]);

  useEffect(() => {
    let active = true;
    void requestMembers()
      .then((body) => {
        if (active) setInventory(body);
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
  }, [copy.loadError, requestMembers]);

  const revoke = useCallback(
    async (memberId: string, proofRefreshed = false) => {
      setBusyMemberId(memberId);
      setError(null);
      try {
        const response = await fetch(
          `/api/auth/members/${encodeURIComponent(memberId)}/revoke`,
          { method: "POST" },
        );
        const body = (await response.json()) as ApiError;
        if (
          response.status === 403 &&
          body.code === "REAUTHENTICATION_REQUIRED" &&
          !proofRefreshed
        ) {
          setPendingMemberId(memberId);
          setPin("");
          setPinError(null);
          return;
        }
        if (!response.ok) throw new Error(body.error ?? copy.revokeError);
        setPendingMemberId(null);
        setPin("");
        await refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.revokeError);
      } finally {
        setBusyMemberId(null);
      }
    },
    [copy.revokeError, refresh],
  );

  const verifyPinAndRevoke = useCallback(async () => {
    if (!pendingMemberId || !pin.trim()) return;
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
      const target = pendingMemberId;
      setPendingMemberId(null);
      setPin("");
      await revoke(target, true);
    } catch {
      setPinError(copy.incorrectPin);
    }
  }, [copy.incorrectPin, pendingMemberId, pin, revoke]);

  const isOwner = inventory?.currentActor.role === "owner";
  const members = inventory?.authority.members ?? [];
  const sortedMembers = useMemo(
    () =>
      [...members].sort((left, right) =>
        left.displayName.localeCompare(right.displayName, locale),
      ),
    [locale, members],
  );

  return (
    <section className="space-y-5" aria-labelledby="team-members-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 id="team-members-title" className="text-base font-semibold">
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

      {!isOwner && inventory ? (
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
          {copy.ownerOnly}
        </div>
      ) : null}

      <div className="rounded-lg border">
        {loading && !inventory ? (
          <p className="p-4 text-sm text-muted-foreground">{copy.loading}</p>
        ) : sortedMembers.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{copy.none}</p>
        ) : (
          <ul className="divide-y">
            {sortedMembers.map((member) => {
              const revoked = member.revokedAt !== null;
              const activeSessions = member.sessions.filter(
                (session) => session.databaseState === "active",
              ).length;
              return (
                <li key={member.memberId} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{member.displayName}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {copy[member.role]}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${revoked ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        {revoked ? copy.revoked : copy.active}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p dir="ltr">
                        {member.loginId} · {shortId(member.memberId)}
                      </p>
                      <p>
                        {copy.shopAccess}: {member.shopIds.join(", ")}
                      </p>
                      <p>
                        {copy.sessions}: {activeSessions} {copy.activeSessions}
                      </p>
                      <p>
                        {member.permissions ? copy.custom : copy.standard}
                      </p>
                    </div>
                  </div>
                  {isOwner ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={revoked || busyMemberId === member.memberId}
                      onClick={() => void revoke(member.memberId)}
                    >
                      <ShieldOff className="me-2 h-4 w-4" aria-hidden="true" />
                      {copy.revoke}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingMemberId ? (
        <div className="rounded-lg border p-4" role="dialog" aria-modal="false" aria-labelledby="member-revoke-title">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <h4 id="member-revoke-title" className="text-sm font-semibold">
              {copy.reauthTitle}
            </h4>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy.reauthDescription}
          </p>
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
                if (event.key === "Enter") void verifyPinAndRevoke();
              }}
            />
            <Button type="button" onClick={() => void verifyPinAndRevoke()} disabled={!pin.trim()}>
              {copy.confirm}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingMemberId(null);
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
