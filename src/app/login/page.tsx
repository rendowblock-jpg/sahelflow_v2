"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, Loader2, ArrowRight } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    // Check if auth is set up
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
          <CardTitle className="text-xl tracking-tight">SahelFlow</CardTitle>
          <CardDescription>{t("auth.loginDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">{t("auth.pin")}</Label>
              <Input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                autoFocus
                autoComplete="current-password"
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

            <Button type="submit" className="w-full" disabled={loading || pin.length < 1}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  {t("auth.login")}
                  <ArrowRight className="ms-2 h-4 w-4" />
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
