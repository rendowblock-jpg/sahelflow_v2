"use client";

import { useState } from "react";
import { KeyRound, Loader2, ShieldAlert } from "lucide-react";

import { Field } from "@/components/system";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import { toast } from "@/lib/toast";

/**
 * Owner PIN change.
 *
 * `POST /api/auth/change-pin` was fully built — owner-only authority, IP rate
 * limiting, lockout on repeated failure, `auth.pin.change` audit entries and
 * session rotation — and had ZERO callers anywhere in the product. The owner
 * could not change the PIN that encrypts their own shop data from any screen
 * in the app.
 *
 * The server owns every rule. This surface deliberately re-implements only the
 * two checks it can make honestly without a round trip (the confirmation match
 * and the 8-character floor the route's own zod schema declares), so the seller
 * is not sent to the server to be told something the form already knows. The
 * current-PIN check, the "must differ" rule, rate limiting and lockout stay
 * server-side and are surfaced verbatim through `translateServerError`.
 */

const CURRENT_FIELD_ID = "change-pin-current";
const NEXT_FIELD_ID = "change-pin-next";
const CONFIRM_FIELD_ID = "change-pin-confirm";

/** The route's own `ChangePinSchema` floor — kept identical on purpose. */
const MIN_PIN_LENGTH = 8;

export function ChangePinPanel() {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    current.length > 0 && next.length > 0 && confirm.length > 0 && !pending;

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
  }

  async function handleSubmit() {
    if (next !== confirm) {
      setError(t("settings.changePin.mismatch"));
      return;
    }
    if (next.length < MIN_PIN_LENGTH) {
      setError(t("settings.changePin.tooShort"));
      return;
    }
    if (next === current) {
      setError(t("settings.changePin.same"));
      return;
    }

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin: current, newPin: next }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!response.ok) {
        // Incorrect PIN, rate limiting, lockout and the owner-only refusal all
        // arrive here as coded rejections. Surface the server's own verdict.
        throw new Error(payload.error ?? t("settings.changePin.failed"));
      }
      toast.success(t("settings.changePin.changed"));
      reset();
    } catch (caught) {
      setError(
        translateServerError(caught, t, t("settings.changePin.failed")),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="change-pin-title">
      <div>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 id="change-pin-title" className="text-base font-semibold">
            {t("settings.changePin.title")}
          </h3>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("settings.changePin.description")}
        </p>
      </div>

      <div className="flex items-start gap-2 rounded-surface border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{t("settings.changePin.irrecoverable")}</p>
      </div>

      <div className="grid max-w-xl gap-4">
        <Field id={CURRENT_FIELD_ID} label={t("settings.changePin.current")} required>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="current-password"
              dir="ltr"
              value={current}
              disabled={pending}
              onChange={(event) => {
                setCurrent(event.target.value);
                if (error) setError(null);
              }}
            />
          )}
        </Field>

        <Field id={NEXT_FIELD_ID} label={t("settings.changePin.next")} required>
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              dir="ltr"
              minLength={MIN_PIN_LENGTH}
              value={next}
              disabled={pending}
              onChange={(event) => {
                setNext(event.target.value);
                if (error) setError(null);
              }}
            />
          )}
        </Field>

        <Field
          id={CONFIRM_FIELD_ID}
          label={t("settings.changePin.confirm")}
          error={error ?? undefined}
          required
        >
          {(control) => (
            <Input
              {...control}
              type="password"
              autoComplete="new-password"
              dir="ltr"
              minLength={MIN_PIN_LENGTH}
              value={confirm}
              disabled={pending}
              onChange={(event) => {
                setConfirm(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          )}
        </Field>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {pending ? (
              <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" />
            ) : null}
            {pending
              ? t("settings.changePin.submitting")
              : t("settings.changePin.submit")}
          </Button>
        </div>
      </div>
    </section>
  );
}
