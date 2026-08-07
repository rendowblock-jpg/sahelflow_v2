"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight, KeyRound, Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";

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

type ApiError = { error?: string };
type AcceptanceAttempt = Readonly<{ fingerprint: string; requestId: string }>;

export default function JoinPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const acceptanceAttempt = useRef<AcceptanceAttempt | null>(null);

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (pin !== confirmation) {
      setError(t("phase5.join.mismatch"));
      return;
    }
    const normalizedToken = token.trim();
    const normalizedName = displayName.trim();
    const normalizedLogin = loginId.trim().toLowerCase();
    const fingerprint = JSON.stringify([normalizedToken, normalizedName, normalizedLogin, pin]);
    if (acceptanceAttempt.current?.fingerprint !== fingerprint) {
      acceptanceAttempt.current = { fingerprint, requestId: globalThis.crypto.randomUUID() };
    }
    const requestId = acceptanceAttempt.current.requestId;

    setLoading(true);
    try {
      const response = await fetch("/api/auth/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: normalizedToken, requestId, displayName: normalizedName, loginId: normalizedLogin, pin }),
      });
      const body = (await response.json()) as ApiError;
      if (!response.ok) throw new Error(body.error ?? t("phase5.join.failed"));
      setSuccess(true);
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("phase5.join.failed"));
    } finally {
      setLoading(false);
    }
  }, [confirmation, displayName, loginId, pin, router, t, token]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <RuntimeUiReadyBeacon />
      <Card className="w-full max-w-lg border shadow-none">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-md border bg-muted text-muted-foreground">
            <UserPlus className="size-5" aria-hidden="true" />
          </div>
          <CardTitle>{t("phase5.join.title")}</CardTitle>
          <CardDescription>{t("phase5.join.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-token">{t("phase5.join.token")}</Label>
              <Input id="invite-token" dir="ltr" value={token} onChange={(event) => setToken(event.target.value)} placeholder={t("phase5.join.tokenPlaceholder")} autoComplete="off" disabled={loading || success} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="display-name">{t("phase5.join.name")}</Label>
                <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t("phase5.join.namePlaceholder")} autoComplete="name" minLength={1} maxLength={80} disabled={loading || success} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-id">{t("phase5.join.login")}</Label>
                <Input id="login-id" dir="ltr" value={loginId} onChange={(event) => setLoginId(event.target.value.toLowerCase())} placeholder={t("phase5.join.loginPlaceholder")} pattern="[a-z0-9][a-z0-9._-]{2,31}" autoComplete="username" disabled={loading || success} required />
                <p className="text-xs text-muted-foreground">{t("phase5.join.loginHelp")}</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="member-pin">{t("phase5.join.pin")}</Label>
                <Input id="member-pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value)} minLength={8} maxLength={32} disabled={loading || success} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="member-pin-confirmation">{t("phase5.join.confirmPin")}</Label>
                <Input id="member-pin-confirmation" type="password" inputMode="numeric" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} maxLength={32} disabled={loading || success} required />
              </div>
            </div>

            {error ? <p role="alert" className="rounded-md border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
            {success ? <p role="status" className="rounded-md border border-success/25 bg-success/5 p-3 text-sm text-success">{t("phase5.join.success")}</p> : null}

            <Button type="submit" className="w-full" disabled={loading || success || !token.trim() || !displayName.trim() || loginId.length < 3 || pin.length < 8 || confirmation.length < 8}>
              {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <><KeyRound className="me-2 size-4" aria-hidden="true" />{t("phase5.join.submit")}<ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden="true" /></>}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={() => router.push("/login")}>{t("phase5.join.loginLink")}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
