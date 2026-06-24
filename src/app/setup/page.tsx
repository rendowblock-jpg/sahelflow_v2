"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, ArrowRight, Check } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

export default function SetupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // If already set up, redirect to login
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

    if (pin.length < 4) {
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
        setError(data.error ?? "Setup failed");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-elevated animate-scale-in">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-sm">
            <Lock className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl tracking-tight">{t("auth.setupTitle")}</CardTitle>
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
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                autoFocus
                autoComplete="new-password"
                disabled={loading}
                className="text-center text-lg tracking-widest"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPin">{t("auth.confirmPin")}</Label>
              <Input
                id="confirmPin"
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="••••••"
                autoComplete="new-password"
                disabled={loading}
                className="text-center text-lg tracking-widest"
                inputMode="numeric"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading || pin.length < 4 || confirmPin.length < 4}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="me-2 h-4 w-4" />
                  {t("auth.createPinButton")}
                  <ArrowRight className="ms-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {t("auth.pinSecurityNote")}
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
