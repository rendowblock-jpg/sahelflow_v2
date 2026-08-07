"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Lock, ShieldCheck } from "lucide-react";

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

export default function SetupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/auth/status")
      .then((response) => response.json())
      .then((data) => {
        if (data.setup) router.replace("/login");
      })
      .catch(() => undefined);
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await response.json();
      if (!response.ok) {
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
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <RuntimeUiReadyBeacon />
      <Card className="w-full max-w-sm border shadow-none">
        <CardHeader className="pb-4 text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <Lock className="size-5" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">
            {t("auth.setupTitle")}
          </CardTitle>
          <CardDescription>{t("auth.setupDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">{t("auth.createPin")}</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
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
              <Label htmlFor="confirmPin">{t("auth.confirmPin")}</Label>
              <Input
                id="confirmPin"
                type="password"
                value={confirmPin}
                onChange={(event) => setConfirmPin(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={loading}
                className="h-11 text-center text-lg tracking-[0.3em]"
                inputMode="numeric"
                minLength={8}
                required
              />
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              className="h-10 w-full"
              disabled={loading || pin.length < 8 || confirmPin.length < 8}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <>
                  <Check className="me-2 size-4" aria-hidden="true" />
                  {t("auth.createPinButton")}
                  <ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden="true" />
                </>
              )}
            </Button>

            <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{t("auth.pinSecurityNote")}</span>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
