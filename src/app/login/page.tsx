"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, ShieldCheck, Users } from "lucide-react";

import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

const MEMBER_COPY = {
  en: {
    owner: "Owner",
    member: "Team member",
    loginId: "Login ID",
    loginPlaceholder: "e.g. amina.ops",
    join: "Accept a team invitation",
  },
  fr: {
    owner: "Propriétaire",
    member: "Membre de l’équipe",
    loginId: "Identifiant de connexion",
    loginPlaceholder: "ex. amina.ops",
    join: "Accepter une invitation d’équipe",
  },
  ar: {
    owner: "المالك",
    member: "عضو الفريق",
    loginId: "معرّف تسجيل الدخول",
    loginPlaceholder: "مثال: amina.ops",
    join: "قبول دعوة فريق",
  },
} as const;

export default function LoginPage() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const copy = MEMBER_COPY[locale];
  const [mode, setMode] = useState<"owner" | "member">("owner");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((data) => {
        if (!data.setup) {
          router.replace("/setup");
        } else if (data.authenticated) {
          router.replace("/");
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          ...(mode === "member" ? { loginId: loginId.trim().toLowerCase() } : {}),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? t("error.loginFailed"));
        if (data.needsSetup) setNeedsSetup(true);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError(t("error.networkFailure"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <RuntimeUiReadyBeacon />
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5"
        aria-hidden="true"
      />

      <Card className="relative w-full max-w-sm border shadow-popover animate-scale-in">
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-sm ring-1 ring-primary/20">
            {mode === "owner" ? (
              <Lock className="h-7 w-7 text-primary-foreground" />
            ) : (
              <Users className="h-7 w-7 text-primary-foreground" />
            )}
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">
            SahelFlow
          </CardTitle>
          <CardDescription className="text-sm">
            {t("auth.loginDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "owner"}
              onClick={() => {
                setMode("owner");
                setError("");
              }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === "owner" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {copy.owner}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "member"}
              onClick={() => {
                setMode("member");
                setError("");
              }}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                mode === "member" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              {copy.member}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "member" ? (
              <div className="space-y-2">
                <Label htmlFor="login-id" className="text-sm font-medium">
                  {copy.loginId}
                </Label>
                <Input
                  id="login-id"
                  dir="ltr"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value.toLowerCase())}
                  placeholder={copy.loginPlaceholder}
                  pattern="[a-z0-9][a-z0-9._-]{2,31}"
                  autoComplete="username"
                  disabled={loading}
                  required
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="pin" className="text-sm font-medium">
                {t("auth.pin")}
              </Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="••••••••"
                autoFocus={mode === "owner"}
                autoComplete="current-password"
                disabled={loading}
                className="h-11 text-center text-lg tracking-[0.3em]"
                inputMode="numeric"
                minLength={8}
              />
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={
                loading || pin.length < 1 || (mode === "member" && loginId.length < 3)
              }
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {t("auth.login")}
                  <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>

            {mode === "member" ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push("/join")}
              >
                {copy.join}
              </Button>
            ) : null}

            {needsSetup ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push("/setup")}
              >
                {t("auth.goToSetup")}
              </Button>
            ) : null}

            <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3" />
              <span>{t("auth.securityBadge")}</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
