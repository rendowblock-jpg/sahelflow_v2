"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, MonitorSmartphone, RefreshCw, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";

const COPY = {
  en: {
    title: "Security & sessions",
    description:
      "Review the exact installation, trusted device, and signed-in sessions. Revoking a session denies access immediately.",
    workspace: "Workspace authority",
    device: "Trusted device",
    sessions: "Signed-in sessions",
    current: "Current",
    active: "Active",
    revoked: "Revoked",
    missing: "Database record missing",
    policy: "Policy version",
    lastSeen: "Last seen",
    bound: "Signed in",
    revoke: "Revoke session",
    refreshing: "Refreshing…",
    refresh: "Refresh",
    loading: "Loading security authority…",
    loadError: "Security authority could not be loaded.",
    revokeError: "The session could not be revoked.",
    reauthTitle: "Confirm with your PIN",
    reauthDescription:
      "Session administration is a high-risk action. Verify your PIN to continue.",
    pinPlaceholder: "Enter PIN",
    confirm: "Verify and revoke",
    cancel: "Cancel",
    incorrectPin: "The PIN could not be verified.",
    noSessions: "No sessions are recorded for this installation.",
  },
  fr: {
    title: "Sécurité et sessions",
    description:
      "Consultez l’installation exacte, l’appareil de confiance et les sessions connectées. La révocation bloque immédiatement l’accès.",
    workspace: "Autorité de l’espace de travail",
    device: "Appareil de confiance",
    sessions: "Sessions connectées",
    current: "Actuelle",
    active: "Active",
    revoked: "Révoquée",
    missing: "Enregistrement local manquant",
    policy: "Version de la politique",
    lastSeen: "Dernière activité",
    bound: "Connexion",
    revoke: "Révoquer la session",
    refreshing: "Actualisation…",
    refresh: "Actualiser",
    loading: "Chargement de l’autorité de sécurité…",
    loadError: "Impossible de charger l’autorité de sécurité.",
    revokeError: "Impossible de révoquer la session.",
    reauthTitle: "Confirmez avec votre code PIN",
    reauthDescription:
      "L’administration des sessions est une action sensible. Vérifiez votre PIN pour continuer.",
    pinPlaceholder: "Saisir le PIN",
    confirm: "Vérifier et révoquer",
    cancel: "Annuler",
    incorrectPin: "Le PIN n’a pas pu être vérifié.",
    noSessions: "Aucune session n’est enregistrée pour cette installation.",
  },
  ar: {
    title: "الأمان والجلسات",
    description:
      "راجع التثبيت الحالي والجهاز الموثوق والجلسات المسجّلة. إلغاء الجلسة يمنع الوصول فورًا.",
    workspace: "صلاحية مساحة العمل",
    device: "الجهاز الموثوق",
    sessions: "الجلسات المسجّلة",
    current: "الحالية",
    active: "نشطة",
    revoked: "ملغاة",
    missing: "سجل قاعدة البيانات مفقود",
    policy: "إصدار سياسة الصلاحيات",
    lastSeen: "آخر نشاط",
    bound: "تاريخ تسجيل الدخول",
    revoke: "إلغاء الجلسة",
    refreshing: "جارٍ التحديث…",
    refresh: "تحديث",
    loading: "جارٍ تحميل صلاحيات الأمان…",
    loadError: "تعذر تحميل صلاحيات الأمان.",
    revokeError: "تعذر إلغاء الجلسة.",
    reauthTitle: "أكد العملية بالرمز السري",
    reauthDescription:
      "إدارة الجلسات عملية حساسة. تحقق من الرمز السري للمتابعة.",
    pinPlaceholder: "أدخل الرمز السري",
    confirm: "تحقق ثم ألغِ الجلسة",
    cancel: "إلغاء",
    incorrectPin: "تعذر التحقق من الرمز السري.",
    noSessions: "لا توجد جلسات مسجلة لهذا التثبيت.",
  },
} as const;

type AuthorityResponse = {
  authority: {
    revision: number;
    workspace: { id: string; policyVersion: number; revocationEpoch: number };
    installation: { id: string; revocationEpoch: number; enrolledAt: string };
    currentActor: {
      personId: string;
      workspaceMemberId: string;
      deviceId: string;
      role: string;
      policyVersion: number;
      revocationEpoch: number;
    };
    devices: Array<{
      id: string;
      revocationEpoch: number;
      enrolledAt: string;
      lastSeenAt: string;
      current: boolean;
    }>;
    sessions: Array<{
      sessionId: string;
      deviceId: string;
      policyVersion: number;
      boundAt: string;
      controlRevokedAt: string | null;
      databaseIssuedAt: string | null;
      databaseLastSeenAt: string | null;
      databaseRevokedAt: string | null;
      databaseState: "active" | "revoked" | "missing";
      current: boolean;
    }>;
  };
};

type ApiError = { error?: string; code?: string };

function shortId(value: string): string {
  return value.length <= 12 ? value : `…${value.slice(-12)}`;
}

export function SecurityAuthorityPanel() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [authority, setAuthority] = useState<AuthorityResponse["authority"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const [reauthSessionId, setReauthSessionId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-DZ" : "en-GB",
        { dateStyle: "medium", timeStyle: "short" },
      ),
    [locale],
  );

  const formatDate = useCallback(
    (value: string | null): string => {
      if (!value) return "—";
      const date = new Date(value);
      return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "—";
    },
    [dateFormatter],
  );

  const requestAuthority = useCallback(async () => {
    const response = await fetch("/api/auth/authority", { cache: "no-store" });
    const body = (await response.json()) as AuthorityResponse & ApiError;
    if (!response.ok) throw new Error(body.error ?? copy.loadError);
    return body.authority;
  }, [copy.loadError]);

  const loadAuthority = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAuthority(await requestAuthority());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError, requestAuthority]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialAuthority(): Promise<void> {
      try {
        const nextAuthority = await requestAuthority();
        if (!cancelled) setAuthority(nextAuthority);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : copy.loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialAuthority();
    return () => {
      cancelled = true;
    };
  }, [copy.loadError, requestAuthority]);

  const revokeSession = useCallback(
    async (sessionId: string, proofAlreadyRefreshed = false) => {
      setBusySessionId(sessionId);
      setError(null);
      try {
        const response = await fetch(
          `/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`,
          { method: "POST" },
        );
        const body = (await response.json()) as ApiError;
        if (
          response.status === 403 &&
          body.code === "REAUTHENTICATION_REQUIRED" &&
          !proofAlreadyRefreshed
        ) {
          setReauthSessionId(sessionId);
          setPin("");
          setPinError(null);
          return;
        }
        if (!response.ok) throw new Error(body.error ?? copy.revokeError);
        setReauthSessionId(null);
        setPin("");
        await loadAuthority();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : copy.revokeError);
      } finally {
        setBusySessionId(null);
      }
    },
    [copy.revokeError, loadAuthority],
  );

  const verifyPinAndRevoke = useCallback(async () => {
    if (!reauthSessionId || !pin.trim()) return;
    setBusySessionId(reauthSessionId);
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
      const target = reauthSessionId;
      setReauthSessionId(null);
      setPin("");
      await revokeSession(target, true);
    } catch {
      setPinError(copy.incorrectPin);
    } finally {
      setBusySessionId(null);
    }
  }, [copy.incorrectPin, pin, reauthSessionId, revokeSession]);

  return (
    <section className="space-y-5" aria-labelledby="security-authority-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 id="security-authority-title" className="text-base font-semibold">
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
          onClick={() => void loadAuthority()}
          disabled={loading}
        >
          <RefreshCw
            className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {loading ? copy.refreshing : copy.refresh}
        </Button>
      </div>

      {loading && !authority ? (
        <div className="rounded-lg border p-5 text-sm text-muted-foreground">
          {copy.loading}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {authority ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">{copy.workspace}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">ID</dt>
                  <dd dir="ltr" className="font-mono text-xs">
                    {shortId(authority.workspace.id)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{copy.policy}</dt>
                  <dd>{authority.workspace.policyVersion}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4" aria-hidden="true" />
                <p className="text-sm font-medium">{copy.device}</p>
              </div>
              {authority.devices.map((device) => (
                <dl key={device.id} className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">ID</dt>
                    <dd dir="ltr" className="font-mono text-xs">
                      {shortId(device.id)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{copy.lastSeen}</dt>
                    <dd>{formatDate(device.lastSeenAt)}</dd>
                  </div>
                </dl>
              ))}
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h4 className="text-sm font-semibold">{copy.sessions}</h4>
            </div>
            {authority.sessions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{copy.noSessions}</p>
            ) : (
              <ul className="divide-y">
                {authority.sessions.map((session) => {
                  const revoked =
                    session.controlRevokedAt !== null ||
                    session.databaseState === "revoked";
                  const status =
                    session.databaseState === "missing"
                      ? copy.missing
                      : revoked
                        ? copy.revoked
                        : copy.active;
                  return (
                    <li key={session.sessionId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span dir="ltr" className="font-mono text-xs">
                            {shortId(session.sessionId)}
                          </span>
                          {session.current ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {copy.current}
                            </span>
                          ) : null}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {status}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {copy.bound}: {formatDate(session.databaseIssuedAt ?? session.boundAt)} · {copy.lastSeen}: {formatDate(session.databaseLastSeenAt)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={session.current || revoked || busySessionId === session.sessionId}
                        onClick={() => void revokeSession(session.sessionId)}
                      >
                        {copy.revoke}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      {reauthSessionId ? (
        <div className="rounded-lg border p-4" role="dialog" aria-modal="false" aria-labelledby="session-reauth-title">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            <h4 id="session-reauth-title" className="text-sm font-semibold">
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
              placeholder={copy.pinPlaceholder}
              aria-label={copy.pinPlaceholder}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verifyPinAndRevoke();
              }}
            />
            <Button
              type="button"
              onClick={() => void verifyPinAndRevoke()}
              disabled={!pin.trim() || busySessionId !== null}
            >
              {copy.confirm}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setReauthSessionId(null);
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
