"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { useEntryBrand } from "@/components/auth/entry-brand";
import { FORM_ERROR_ID, describedByFor, isInvalid, useFocusOnFailure, type FormFailure } from "@/components/auth/form-focus";
import { classifyJoinFailure, type JoinFailureBody } from "@/components/auth/join-failure";
import { PinInput } from "@/components/auth/pin-input";
import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { EntryShell } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";

type ApiError = JoinFailureBody;
type AcceptanceAttempt = Readonly<{ fingerprint: string; requestId: string }>;

export default function JoinPage() {
  const router = useRouter();
  const { t } = useI18n();
  const brand = useEntryBrand();
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [success, setSuccess] = useState(false);
  useFocusOnFailure(failure, loading || success);
  const acceptanceAttempt = useRef<AcceptanceAttempt | null>(null);

  const submit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure(null);
    if (pin !== confirmation) {
      setFailure({ field: "member-pin-confirmation", message: t("phase5.join.mismatch") });
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
      const body = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        setFailure(classifyJoinFailure(body, t));
        return;
      }
      setSuccess(true);
      router.replace("/");
      router.refresh();
    } catch {
      setFailure({ field: "invite-token", message: t("error.networkFailure") });
    } finally {
      setLoading(false);
    }
  }, [confirmation, displayName, loginId, pin, router, t, token]);

  return (
    <EntryShell
      {...brand}
      title={t("phase5.join.title")}
      description={t("phase5.join.description")}
      beforeContent={<RuntimeUiReadyBeacon />}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="invite-token">{t("phase5.join.token")}</Label>
          <Input id="invite-token" aria-invalid={isInvalid(failure, "invite-token")} aria-describedby={describedByFor(failure, "invite-token")} dir="ltr" value={token} onChange={(event) => setToken(event.target.value)} placeholder={t("phase5.join.tokenPlaceholder")} autoComplete="off" disabled={loading || success} required />
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">{t("phase5.join.name")}</Label>
            <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t("phase5.join.namePlaceholder")} autoComplete="name" minLength={1} maxLength={80} disabled={loading || success} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-id">{t("phase5.join.login")}</Label>
            <Input id="login-id" aria-invalid={isInvalid(failure, "login-id")} aria-describedby={describedByFor(failure, "login-id")} dir="ltr" data-sf-placeholder-dir="document" value={loginId} onChange={(event) => setLoginId(event.target.value.toLowerCase())} placeholder={t("phase5.join.loginPlaceholder")} pattern="[a-z0-9][a-z0-9._-]{2,31}" autoComplete="username" disabled={loading || success} required />
            <p className="text-caption text-muted-foreground">{t("phase5.join.loginHelp")}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="member-pin">{t("phase5.join.pin")}</Label>
            <PinInput id="member-pin" aria-invalid={isInvalid(failure, "member-pin")} aria-describedby={describedByFor(failure, "member-pin")} autoComplete="new-password" value={pin} onChange={(event) => setPin(event.target.value)} minLength={8} maxLength={32} disabled={loading || success} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-pin-confirmation">{t("phase5.join.confirmPin")}</Label>
            <PinInput id="member-pin-confirmation" aria-invalid={isInvalid(failure, "member-pin-confirmation")} aria-describedby={describedByFor(failure, "member-pin-confirmation")} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} maxLength={32} disabled={loading || success} required />
          </div>
        </div>

        {failure ? (
          <div id={FORM_ERROR_ID} role="alert" className="space-y-1 rounded-control border border-destructive/25 bg-destructive-subtle p-3 text-body-sm text-destructive">
            {failure.title ? <p className="font-medium">{failure.title}</p> : null}
            <p>{failure.message}</p>
            {failure.hint ? <p className="text-foreground">{failure.hint}</p> : null}
          </div>
        ) : null}
        {success ? <p role="status" className="rounded-control border border-success/25 bg-success-subtle p-3 text-body-sm text-success">{t("phase5.join.success")}</p> : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading || success || !token.trim() || !displayName.trim() || loginId.length < 3 || pin.length < 8 || confirmation.length < 8}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <><KeyRound className="me-2 size-4" aria-hidden="true" />{t("phase5.join.submit")}<ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden="true" /></>}
        </Button>

        <Button type="button" variant="ghost" className="w-full" onClick={() => router.push("/login")}>{t("phase5.join.loginLink")}</Button>
      </form>
    </EntryShell>
  );
}
