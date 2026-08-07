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

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
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
        if (!data.setup) router.replace("/setup");
        else if (data.authenticated) router.replace("/");
      })
      .catch(() => undefined);
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
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <RuntimeUiReadyBeacon />
      <Card className="w-full max-w-sm border shadow-none">
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            {mode === "owner" ? <Lock className="size-5" aria-hidden="true" /> : <Users className="size-5" aria-hidden="true" />}
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">SahelFlow</CardTitle>
          <CardDescription>{t("auth.loginDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 rounded-md border bg-muted/20 p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "owner"}
              onClick={() => { setMode("owner"); setError(""); }}
              className={`rounded-sm px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === "owner" ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              {t("phase5.auth.owner")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "member"}
              onClick={() => { setMode("member"); setError(""); }}
              className={`rounded-sm px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === "member" ? "bg-background text-foreground" : "text-muted-foreground"}`}
            >
              {t("phase5.auth.member")}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "member" ? (
              <div className="space-y-2">
                <Label htmlFor="login-id">{t("phase5.auth.loginId")}</Label>
                <Input
                  id="login-id"
                  dir="ltr"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value.toLowerCase())}
                  placeholder={t("phase5.auth.loginPlaceholder")}
                  pattern="[a-z0-9][a-z0-9._-]{2,31}"
                  autoComplete="username"
                  disabled={loading}
                  required
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="pin">{t("auth.pin")}</Label>
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
              <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</p>
            ) : null}

            <Button type="submit" className="h-10 w-full" disabled={loading || pin.length < 1 || (mode === "member" && loginId.length < 3)}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <>{t("auth.login")}<ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden="true" /></>}
            </Button>

            {mode === "member" ? <Button type="button" variant="outline" className="w-full" onClick={() => router.push("/join")}>{t("phase5.auth.join")}</Button> : null}
            {needsSetup ? <Button type="button" variant="outline" className="w-full" onClick={() => router.push("/setup")}>{t("auth.goToSetup")}</Button> : null}

            <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3" aria-hidden="true" />
              <span>{t("auth.securityBadge")}</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
