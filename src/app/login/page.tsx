"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck, UserPlus } from "lucide-react";

import { useEntryBrand } from "@/components/auth/entry-brand";
import { PinInput } from "@/components/auth/pin-input";
import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { EntryShell } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const brand = useEntryBrand();
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
        // The server sends English prose only — map the known auth failures
        // (wrong PIN, lockout, rate limit) into the active locale first.
        setError(translateServerError(data.error, t, t("error.loginFailed")));
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

  function selectMode(next: "owner" | "member") {
    setMode(next);
    setError("");
  }

  return (
    <EntryShell
      {...brand}
      title={t("auth.loginHeading")}
      description={t("auth.loginDescription")}
      beforeContent={<RuntimeUiReadyBeacon />}
    >
      <div className="grid grid-cols-2 gap-1 rounded-control border bg-surface-1 p-1" role="tablist">
        {(["owner", "member"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => selectMode(option)}
            className={cn(
              "rounded-control px-3 py-2 text-body-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              mode === option ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option === "owner" ? t("phase5.auth.owner") : t("phase5.auth.member")}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {mode === "member" ? (
          <div className="space-y-2">
            <Label htmlFor="login-id">{t("phase5.auth.loginId")}</Label>
            <Input
              id="login-id"
              dir="ltr"
              data-sf-placeholder-dir="document"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value.toLowerCase())}
              placeholder={t("phase5.auth.loginPlaceholder")}
              pattern="[a-z0-9][a-z0-9._-]{2,31}"
              autoComplete="username"
              autoFocus
              disabled={loading}
              className="h-11"
              required
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="pin">{t("auth.pin")}</Label>
          <PinInput
            id="pin"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="••••••••"
            autoFocus={mode === "owner"}
            autoComplete="current-password"
            disabled={loading}
            minLength={8}
          />
        </div>

        {error ? (
          <p className="rounded-control border border-destructive/25 bg-destructive-subtle p-3 text-body-sm text-destructive" role="alert">{error}</p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading || pin.length < 1 || (mode === "member" && loginId.length < 3)}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <>{t("auth.login")}<ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden="true" /></>}
        </Button>

        {needsSetup ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => router.push("/setup")}>
            {t("auth.goToSetup")}
          </Button>
        ) : null}

        {mode === "member" ? (
          <Button type="button" variant="ghost" className="w-full" onClick={() => router.push("/join")}>
            <UserPlus className="me-2 size-4" aria-hidden="true" />
            {t("auth.joinInstead")}
          </Button>
        ) : null}

        <p className="flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          <span>{t("auth.securityBadge")}</span>
        </p>
      </form>
    </EntryShell>
  );
}
