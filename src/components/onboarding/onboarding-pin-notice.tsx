"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";

/**
 * Shown above the setup checklist when the delivery and AI status could not be read because the PIN confirmation
 * is older than ten minutes (lab finding F-0012). Same call as the settings panels: POST /api/auth/reauthenticate.
 * The checklist keeps what it knew in the meantime; after a good PIN the wizard reads the status again.
 */
export function OnboardingPinNotice({ onConfirmed }: { onConfirmed: () => Promise<unknown> | void }) {
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!pin.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!response.ok) {
        setError(
          response.status === 401
            ? t("aiKey.pinIncorrect")
            : response.status === 429
              ? t("aiKey.pinLocked")
              : t("onboarding.pin.unavailable"),
        );
        return;
      }
      setPin("");
      await onConfirmed();
    } catch {
      setError(t("onboarding.pin.unavailable"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="onboarding-pin-title"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h2 id="onboarding-pin-title" className="text-sm font-medium">
            {t("onboarding.pin.title")}
          </h2>
          <p id="onboarding-pin-hint" className="text-xs text-muted-foreground">
            {t("onboarding.pin.hint")}
          </p>
        </div>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <Input
          type="password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder={t("auth.pinPlaceholder")}
          aria-label={t("auth.pinPlaceholder")}
          aria-describedby="onboarding-pin-hint"
          aria-invalid={error ? true : undefined}
          autoComplete="current-password"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !pin.trim()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t("onboarding.pin.verify")}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
