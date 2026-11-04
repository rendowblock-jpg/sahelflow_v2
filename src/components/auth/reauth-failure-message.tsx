"use client";

import { useI18n } from "@/hooks/use-i18n";
import type { ReauthFailure } from "@/lib/auth/reauthenticate-client";

/** One sentence per outcome of reauthenticateWithPin. The first two and the unavailable sentence are long-standing keys that already exist in ar, fr and en. */
export const REAUTH_FAILURE_COPY_KEYS: Record<ReauthFailure["kind"], string> = {
  incorrect: "aiKey.pinIncorrect",
  locked: "aiKey.pinLocked",
  "session-expired": "auth.reauth.sessionExpired",
  unavailable: "onboarding.pin.unavailable",
  slow: "auth.reauth.slow",
  invalid: "auth.reauth.invalid",
};

/** The same sentence as one string, for the places that can only show text (toasts, result lines, form fields). */
export function reauthFailureText(
  failure: ReauthFailure,
  t: (key: string) => string,
  copyKeys?: Partial<Record<ReauthFailure["kind"], string>>,
): string {
  const text = t(copyKeys?.[failure.kind] ?? REAUTH_FAILURE_COPY_KEYS[failure.kind]);
  return failure.kind === "session-expired" ? `${text} ${t("auth.reauth.signInAgain")}` : text;
}

/**
 * What the seller reads under a PIN field after a failed confirmation. A dead session is not a wrong PIN: it says so and
 * offers the existing sign-in page (full navigation, the session is gone).
 */
export function ReauthFailureMessage({
  failure,
  className = "text-xs text-destructive",
  copyKeys,
  id,
}: {
  failure: ReauthFailure;
  id?: string;
  className?: string;
  /** A screen with its own long-standing sentence for an outcome (for example licence activation) can name it here. */
  copyKeys?: Partial<Record<ReauthFailure["kind"], string>>;
}) {
  const { t } = useI18n();
  const key = copyKeys?.[failure.kind] ?? REAUTH_FAILURE_COPY_KEYS[failure.kind];
  return (
    <p id={id} role="alert" className={className}>
      {t(key)}
      {failure.kind === "session-expired" ? (
        <>
          {" "}
          <a href="/login" className="font-medium underline underline-offset-2">
            {t("auth.reauth.signInAgain")}
          </a>
        </>
      ) : null}
    </p>
  );
}
