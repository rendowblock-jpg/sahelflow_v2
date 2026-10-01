"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Circle, Loader2, ShieldCheck } from "lucide-react";

import { useEntryBrand } from "@/components/auth/entry-brand";
import { PinInput } from "@/components/auth/pin-input";
import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { EntryShell } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

function Rule({ met, label }: { met: boolean; label: string }) {
  return (
    <li className={cn("flex items-center gap-2 text-body-sm transition-colors", met ? "text-success" : "text-muted-foreground")}>
      {met ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
      <span>{label}</span>
    </li>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const { t } = useI18n();
  const brand = useEntryBrand();
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

  const longEnough = pin.length >= 8;
  const matches = longEnough && pin === confirmPin;

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
    <EntryShell
      {...brand}
      title={t("auth.setupHeading")}
      description={t("auth.setupLede")}
      beforeContent={<RuntimeUiReadyBeacon />}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="pin">{t("auth.createPin")}</Label>
          <PinInput
            id="pin"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="••••••••"
            autoFocus
            autoComplete="new-password"
            disabled={loading}
            minLength={8}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPin">{t("auth.confirmPin")}</Label>
          <PinInput
            id="confirmPin"
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={loading}
            minLength={8}
            required
          />
        </div>

        <ul className="space-y-1.5" aria-live="polite">
          <Rule met={longEnough} label={t("auth.rule.length")} />
          <Rule met={matches} label={t("auth.rule.match")} />
        </ul>

        {error ? (
          <p className="rounded-control border border-destructive/25 bg-destructive-subtle p-3 text-body-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading || !longEnough || confirmPin.length < 8}>
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <>
              {t("auth.createPinButton")}
              <ArrowRight className="ms-2 size-4 rtl:rotate-180" aria-hidden="true" />
            </>
          )}
        </Button>

        <div className="flex items-start gap-2.5 rounded-control border bg-surface-1 p-3 text-body-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{t("auth.pinSecurityNote")}</span>
        </div>
      </form>
    </EntryShell>
  );
}
