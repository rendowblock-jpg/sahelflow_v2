"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";

const COPY = {
  en: {
    title: "Your access identity",
    description: "Used for permissions, audit attribution and exact shop access.",
    owner: "Workspace owner",
    name: "Display name",
    login: "Login ID",
    role: "Role",
    shops: "Shop access",
    member: "Member ID",
    device: "Device ID",
    policy: "Policy version",
    loading: "Loading your access identity…",
    error: "Your access identity could not be loaded.",
    refresh: "Refresh",
    manager: "Manager",
    operator: "Operator",
    viewer: "Viewer",
  },
  fr: {
    title: "Votre identité d’accès",
    description: "Utilisée pour les droits, l’audit et l’accès exact aux boutiques.",
    owner: "Propriétaire de l’espace",
    name: "Nom affiché",
    login: "Identifiant de connexion",
    role: "Rôle",
    shops: "Accès boutique",
    member: "ID membre",
    device: "ID appareil",
    policy: "Version de la politique",
    loading: "Chargement de votre identité d’accès…",
    error: "Impossible de charger votre identité d’accès.",
    refresh: "Actualiser",
    manager: "Responsable",
    operator: "Opérateur",
    viewer: "Lecteur",
  },
  ar: {
    title: "هوية الوصول الخاصة بك",
    description: "تُستخدم للصلاحيات وسجل التدقيق والوصول الدقيق إلى المتاجر.",
    owner: "مالك مساحة العمل",
    name: "الاسم الظاهر",
    login: "معرّف تسجيل الدخول",
    role: "الدور",
    shops: "صلاحية المتجر",
    member: "معرّف العضو",
    device: "معرّف الجهاز",
    policy: "إصدار السياسة",
    loading: "جارٍ تحميل هوية الوصول…",
    error: "تعذر تحميل هوية الوصول الخاصة بك.",
    refresh: "تحديث",
    manager: "مدير",
    operator: "مشغّل",
    viewer: "مشاهد",
  },
} as const;

type AccessProfile = {
  kind: "owner" | "team_member";
  memberId: string;
  deviceId: string;
  displayName?: string;
  loginId?: string;
  role: "owner" | "manager" | "operator" | "viewer";
  shopIds: string[];
  policyVersion: number;
};

type ApiBody = { profile: AccessProfile; error?: string };

function shortId(value: string): string {
  return value.length <= 14 ? value : `…${value.slice(-14)}`;
}

export function CurrentIdentityCard() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestProfile = useCallback(async () => {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const body = (await response.json()) as ApiBody;
    if (!response.ok) throw new Error(body.error ?? copy.error);
    return body.profile;
  }, [copy.error]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProfile(await requestProfile());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error, requestProfile]);

  useEffect(() => {
    let active = true;
    void requestProfile()
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : copy.error);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [copy.error, requestProfile]);

  const roleLabel = profile
    ? profile.role === "owner"
      ? copy.owner
      : copy[profile.role]
    : "";

  return (
    <Card className="animate-fade-up">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            {copy.title}
          </CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className={`me-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          {copy.refresh}
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !profile ? <p className="text-sm text-muted-foreground">{copy.loading}</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        {profile ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {profile.displayName ? <div><dt className="text-muted-foreground">{copy.name}</dt><dd className="font-medium">{profile.displayName}</dd></div> : null}
            {profile.loginId ? <div><dt className="text-muted-foreground">{copy.login}</dt><dd dir="ltr" className="font-mono text-xs">{profile.loginId}</dd></div> : null}
            <div><dt className="text-muted-foreground">{copy.role}</dt><dd className="font-medium">{roleLabel}</dd></div>
            <div><dt className="text-muted-foreground">{copy.shops}</dt><dd>{profile.shopIds.join(", ")}</dd></div>
            <div><dt className="text-muted-foreground">{copy.member}</dt><dd dir="ltr" className="font-mono text-xs">{shortId(profile.memberId)}</dd></div>
            <div><dt className="text-muted-foreground">{copy.device}</dt><dd dir="ltr" className="font-mono text-xs">{shortId(profile.deviceId)}</dd></div>
            <div><dt className="text-muted-foreground">{copy.policy}</dt><dd>{profile.policyVersion}</dd></div>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
