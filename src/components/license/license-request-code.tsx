"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

/**
 * Fetches the owner's licence request code on demand and offers it for
 * copying, so a seller who has paid can send it to SahelFlow on WhatsApp.
 */
export function LicenseRequestCode() {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/license/request", { cache: "no-store" });
      const body = (await response.json()) as { code?: string };
      if (!response.ok || !body.code) throw new Error();
      setCode(body.code);
    } catch {
      setError(t("license.request.unavailable"));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  if (!code) {
    return (
      <div className="space-y-2">
        <Button type="button" variant="outline" className="w-full" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="me-2 size-4 animate-spin" aria-hidden="true" /> : <Ticket className="me-2 size-4" aria-hidden="true" />}
          {t("license.request.show")}
        </Button>
        {error ? <p className="text-body-sm text-muted-foreground" role="status">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-caption text-muted-foreground">{t("license.request.label")}</p>
      <code
        className="block max-h-28 select-all overflow-y-auto break-all rounded-control border bg-background p-3 font-mono text-caption text-foreground"
        dir="ltr"
      >
        {code}
      </code>
      <div className="flex items-center justify-between gap-3">
        <p className="text-caption text-muted-foreground">{t("license.request.help")}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void copy()} aria-live="polite">
          {copied ? <Check className="me-1.5 size-4 text-success" aria-hidden="true" /> : <Copy className="me-1.5 size-4" aria-hidden="true" />}
          {copied ? t("license.lockout.copied") : t("license.request.copy")}
        </Button>
      </div>
    </div>
  );
}
