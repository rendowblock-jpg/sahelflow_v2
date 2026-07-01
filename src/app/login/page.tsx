"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => {
        if (!data.setup) {
          router.replace("/setup");
        } else if (data.authenticated) {
          router.replace("/");
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Login failed");
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
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5"
        aria-hidden="true"
      />

      <Card className="relative w-full max-w-sm border shadow-popover animate-scale-in">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-sm ring-1 ring-primary/20">
            <Lock className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">SahelFlow</CardTitle>
          <CardDescription className="text-sm">{t("auth.loginDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin" className="text-sm font-medium">{t("auth.pin")}</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                autoFocus
                autoComplete="current-password"
                disabled={loading}
                className="h-11 text-center text-lg tracking-[0.3em]"
                inputMode="numeric"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full h-10" disabled={loading || pin.length < 1}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {t("auth.login")}
                  <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>

            {needsSetup && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => router.push("/setup")}
              >
                {t("auth.goToSetup")}
              </Button>
            )}

            <div className="flex items-center justify-center gap-1.5 pt-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3" />
              <span>{t('auth.securityBadge')}</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
