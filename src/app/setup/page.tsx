"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";

export default function SetupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.setup) {
          router.replace("/login");
        }
      })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (pin.length < 8) {
      setError(t("auth.pinMinLength"));
      return;
    }
    if (pin !== confirmPin) {
      setError(t("auth.pinMismatch"));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("error.setupFailed"));
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
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-sm ring-1 ring-primary/20">
            <Lock className="h-7 w-7 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">{t("auth.setupTitle")}</CardTitle>
          <CardDescription className="text-sm">{t("auth.setupDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin" className="text-sm font-medium">{t("auth.createPin")}</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••••"
                autoFocus
                autoComplete="new-password"
                disabled={loading}
                className="h-11 text-center text-lg tracking-[0.3em]"
                inputMode="numeric"
                minLength={8}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPin" className="text-sm font-medium">{t("auth.confirmPin")}</Label>
              <Input
                id="confirmPin"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={loading}
                className="h-11 text-center text-lg tracking-[0.3em]"
                inputMode="numeric"
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full h-10" disabled={loading || pin.length < 8 || confirmPin.length < 8}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="me-2 h-4 w-4" />
                  {t("auth.createPinButton")}
                  <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                </>
              )}
            </Button>

            <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 mt-0.5 text-primary" />
              <span>{t("auth.pinSecurityNote")}</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
