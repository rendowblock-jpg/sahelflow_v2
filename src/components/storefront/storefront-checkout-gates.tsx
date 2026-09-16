"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStorefrontI18n } from "@/components/storefront/storefront-locale-provider";
import { normalizeDZPhone, isValidDZMobilePhone } from "@/lib/validation/phone";

/**
 * FD-061 EX-4: the buyer-facing checkout gates (FD-061 EX-4, slice 6) —
 * the Cloudflare Turnstile widget and the WhatsApp OTP verification flow.
 *
 * The gates are per-storefront and DEFAULT INERT: the probe
 * (/api/storefront/gates/public) answers booleans, and when a gate is
 * disabled nothing renders and nothing blocks checkout. When enabled:
 *   - Turnstile: the challenge script is injected once; its token rides
 *     the submit payload ("cf-turnstile-response"). If the script cannot
 *     load, the buyer proceeds and the SERVER decides (transport failure
 *     is fail-open there — the client never blocks revenue).
 *   - WhatsApp OTP: send → (optionally) enter code → verify → the
 *     15-minute HMAC token rides the submit payload (otpToken). The
 *     fail-open "unavailable" send answer carries the bypass token
 *     directly, so the buyer never dead-ends.
 */

export interface StorefrontGates {
  otpEnabled: boolean;
  otpLanguage: string;
  turnstileEnabled: boolean;
  turnstileSiteKey: string | null;
}

interface GatesProps {
  slug: string;
  /** Buyer's phone as typed — used for the OTP send request. */
  phone: string;
  otpToken: string | null;
  onTurnstileToken: (token: string | null) => void;
  onOtpToken: (token: string | null) => void;
}

export function useStorefrontGates(slug: string): StorefrontGates | null {
  const [gates, setGates] = useState<StorefrontGates | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/storefront/gates/public?slug=${encodeURIComponent(slug)}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as StorefrontGates;
        if (!cancelled) setGates(data);
      } catch {
        // Gate probe failure renders nothing and blocks nothing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return gates;
}

const TURNSTILE_SCRIPT_ID = "sf-turnstile-script";

function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID);
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script error")));
      return;
    }
    const script = document.createElement("script");
    script.id = TURNSTILE_SCRIPT_ID;
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("script error")));
    document.head.appendChild(script);
  });
}

interface TurnstileGlobal {
  render: (
    element: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void },
  ) => string;
  reset: (widgetId?: string) => void;
}

function TurnstileGate({
  slug,
  siteKey,
  onToken,
}: {
  slug: string;
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const { t } = useStorefrontI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !containerRef.current) return;
        const globalWindow = window as unknown as { turnstile?: TurnstileGlobal };
        if (!globalWindow.turnstile) return;
        widgetRef.current = globalWindow.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            onToken(token);
            (
              window as unknown as { __TURNSTILE_TOKEN__?: string }
            ).__TURNSTILE_TOKEN__ = token;
          },
          "expired-callback": () => onToken(null),
        });
      } catch {
        // The widget could not load — the buyer proceeds; the server's
        // transport fail-open decides (revenue first, per the contract).
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (widgetRef.current !== null) {
        (window as unknown as { turnstile?: TurnstileGlobal }).turnstile?.reset(
          widgetRef.current,
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the widget binds once per storefront+siteKey
  }, [slug, siteKey]);

  if (failed) return null;
  return (
    <div className="space-y-1.5">
      <div ref={containerRef} aria-label={t("storefront.view.gates.turnstile")} />
    </div>
  );
}

type OtpPhase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; requestId: string }
  | { kind: "verifying" }
  | { kind: "verified" }
  | { kind: "bypassed" }
  | { kind: "error"; message: string };

function OtpGate({
  slug,
  phone,
  onToken,
}: {
  slug: string;
  phone: string;
  onToken: (token: string | null) => void;
}) {
  const { t } = useStorefrontI18n();
  const [phase, setPhase] = useState<OtpPhase>({ kind: "idle" });
  const [code, setCode] = useState("");

  const e164 = normalizeDZPhone(phone);

  const send = useCallback(async () => {
    if (!isValidDZMobilePhone(e164)) {
      setPhase({ kind: "error", message: t("storefront.view.error.phoneInvalid") });
      return;
    }
    setPhase({ kind: "sending" });
    try {
      const response = await fetch("/api/storefront/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storefrontSlug: slug, phone: e164 }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        status?: "sent" | "unavailable";
        requestId?: string;
        bypassToken?: string;
        error?: string;
      };
      if (!response.ok) {
        setPhase({ kind: "error", message: data.error ?? t("storefront.view.gates.error") });
        return;
      }
      if (data.status === "unavailable" && data.bypassToken) {
        // Fail-open: the provider could not serve the send — the server
        // minted the bypass, checkout proceeds unverified.
        onToken(data.bypassToken);
        setPhase({ kind: "bypassed" });
        return;
      }
      if (data.status === "sent" && data.requestId) {
        setPhase({ kind: "sent", requestId: data.requestId });
        return;
      }
      setPhase({ kind: "error", message: t("storefront.view.gates.error") });
    } catch {
      setPhase({ kind: "error", message: t("storefront.view.gates.error") });
    }
  }, [slug, e164, onToken, t]);

  const verify = useCallback(async () => {
    if (phase.kind !== "sent") return;
    setPhase({ kind: "verifying" });
    try {
      const response = await fetch("/api/storefront/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storefrontSlug: slug,
          phone: e164,
          requestId: phase.requestId,
          code: code.trim(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        status?: "verified";
        otpToken?: string;
        error?: string;
      };
      if (!response.ok || data.status !== "verified" || !data.otpToken) {
        setPhase({ kind: "error", message: data.error ?? t("storefront.view.gates.error") });
        return;
      }
      onToken(data.otpToken);
      setPhase({ kind: "verified" });
    } catch {
      setPhase({ kind: "error", message: t("storefront.view.gates.error") });
    }
  }, [slug, e164, phase, code, onToken, t]);

  return (
    <div className="space-y-2 rounded-control border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <MessageCircle className="size-4" aria-hidden="true" />
        {t("storefront.view.gates.otpTitle")}
      </p>
      {phase.kind === "verified" ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {t("storefront.view.gates.otpVerified")}
        </p>
      ) : phase.kind === "bypassed" ? (
        <p className="text-sm text-muted-foreground">
          {t("storefront.view.gates.otpBypassed")}
        </p>
      ) : phase.kind === "sent" ? (
        <div className="flex items-center gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            maxLength={10}
            placeholder={t("storefront.view.gates.otpCodePlaceholder")}
            aria-label={t("storefront.view.gates.otpCodePlaceholder")}
            className="max-w-40"
          />
          <Button type="button" size="sm" disabled={code.trim().length < 4} onClick={() => void verify()}>
            {t("storefront.view.gates.otpVerify")}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={phase.kind === "sending"}
          onClick={() => void send()}
        >
          {phase.kind === "sending" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {t("storefront.view.gates.otpSend")}
        </Button>
      )}
      {phase.kind === "error" ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The composed gates surface for one storefront's checkout. Renders
 * nothing while the probe is pending/absent — a disabled or unreachable
 * gate never blocks the buyer.
 */
export function StorefrontCheckoutGates({
  gates,
  slug,
  phone,
  otpToken,
  onTurnstileToken,
  onOtpToken,
}: Omit<GatesProps, "otpToken"> & {
  gates: StorefrontGates | null;
  otpToken: string | null;
  onTurnstileToken: (token: string | null) => void;
  onOtpToken: (token: string | null) => void;
}) {
  if (!gates) return null;
  const needsTurnstile = gates.turnstileEnabled && Boolean(gates.turnstileSiteKey);
  const needsOtp = gates.otpEnabled && !otpToken;
  if (!needsTurnstile && !needsOtp && !otpToken) return null;
  return (
    <div className="space-y-3">
      {needsTurnstile && gates.turnstileSiteKey ? (
        <TurnstileGate slug={slug} siteKey={gates.turnstileSiteKey} onToken={onTurnstileToken} />
      ) : null}
      {gates.otpEnabled ? (
        <OtpGate slug={slug} phone={phone} onToken={onOtpToken} />
      ) : null}
    </div>
  );
}
