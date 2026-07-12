"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bot,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  Trash2,
  XCircle,
  Sparkles,
  ShieldAlert,
} from "lucide-react";

/** DB key for the Gemini consent setting — must match SETTING_KEYS.geminiConsentAccepted. */
const GEMINI_CONSENT_KEY = "gemini_consent_accepted";

type Status = "loading" | "configured" | "not-configured" | "editing" | "error";

interface SaveResult {
  ok: boolean;
  model?: string;
  error?: string;
  message?: string;
}

export function AiKeyPanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>("loading");
  const [keyInput, setKeyInput] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  // fix-B6: consent state (separate from API key — it's a preference, not a secret).
  // Defaults to false; loaded from /api/settings on mount.
  const [consent, setConsent] = useState(false);
  const [consentLoading, setConsentLoading] = useState(true);
  const [consentSaving, setConsentSaving] = useState(false);

  // Fetch current status on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/secrets/gemini-key", { method: "GET" });
        if (!res.ok) throw new Error(t("common.fetchFailed"));
        const data = (await res.json()) as { configured: boolean };
        if (cancelled) return;
        setStatus(data.configured ? "configured" : "not-configured");
      } catch {
        if (!cancelled) setStatus("not-configured");
      }
    }
    async function loadConsent() {
      // fix-B6: load the seller's prior consent decision so the checkbox
      // reflects the persisted state across page reloads.
      try {
        const res = await fetch("/api/settings", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as { settings: Record<string, string> };
        if (cancelled) return;
        setConsent(data.settings?.[GEMINI_CONSENT_KEY] === "true");
      } catch {
        // leave default false
      } finally {
        if (!cancelled) setConsentLoading(false);
      }
    }
    load();
    loadConsent();
    return () => {
      cancelled = true;
    };
  }, []);

  /** fix-B6: persist the consent decision via PUT /api/settings. */
  async function handleConsentChange(checked: boolean) {
    setConsent(checked);
    setConsentSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { [GEMINI_CONSENT_KEY]: String(checked) } }),
      });
      if (!res.ok) throw new Error("save failed");
      if (checked) {
        toast.success(t("aiKey.consent.saved"));
      } else {
        toast.warning(t("aiKey.consent.revoked"));
      }
    } catch {
      // Revert the checkbox on failure so the UI reflects the persisted state.
      setConsent(!checked);
      toast.error(t("aiKey.consent.saveFailed"));
    } finally {
      setConsentSaving(false);
    }
  }

  async function handleSave() {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setResult({ ok: false, error: t("aiKey.errorEmpty") });
      setStatus("error");
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/secrets/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed, test: true }),
      });
      const data = (await res.json()) as SaveResult;
      setResult(data);
      if (data.ok) {
        setActiveModel(data.model ?? null);
        setStatus("configured");
        setKeyInput("");
      } else {
        setStatus("error");
      }
    } catch {
      setResult({ ok: false, error: t("aiKey.errorServer") });
      setStatus("error");
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    setDeleteConfirmOpen(true);
  }

  async function performDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/secrets/gemini-key", { method: "DELETE" });
      const data = (await res.json()) as SaveResult;
      if (data.ok) {
        setStatus("not-configured");
        setActiveModel(null);
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setResult({ ok: false, error: t("aiKey.errorDelete") });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </span>
          {t("aiKey.title")}
        </CardTitle>
        <CardDescription>
          {t("aiKey.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t("aiKey.geminiKeyLabel")}</span>
          </div>
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status === "configured" || status === "editing" ? (
            <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-success dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {t("aiKey.configured")}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-warning border-amber-300 dark:border-amber-700">
              <XCircle className="h-3 w-3" />
              {t("aiKey.notConfigured")}
            </Badge>
          )}
        </div>

        {/* Configured state */}
        {(status === "configured" || status === "editing") && (
          <div className="space-y-3">
            {activeModel && (
              <p className="text-xs text-muted-foreground">
                {t("aiKey.activeModel")} <span className="font-mono">{activeModel}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatus("editing");
                  setResult(null);
                }}
              >
                {t("aiKey.replaceKey")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 me-1.5" />
                )}
                {t("common.delete")}
              </Button>
            </div>
          </div>
        )}

        {/* Edit / not-configured state */}
        {(status === "not-configured" || status === "editing" || status === "error") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gemini-key">{t("aiKey.apiKeyLabel")}</Label>
              <Input
                id="gemini-key"
                type="password"
                placeholder="AIza..."
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                disabled={testing}
              />
              <p className="text-xs text-muted-foreground">
                {t("aiKey.encryptionHelp")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSave} disabled={testing || !keyInput.trim()}>
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 me-1.5 animate-spin" />
                    {t("aiKey.testing")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 me-1.5" />
                    {t("aiKey.testAndSave")}
                  </>
                )}
              </Button>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {t("aiKey.getFreeKey")}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div
            role={result.ok ? "status" : "alert"}
            className={`flex items-start gap-2 rounded-md p-3 text-sm ${
              result.ok
                ? "bg-success/10 text-success dark:bg-success/15"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>{result.ok ? result.message ?? t("aiKey.saved") : result.error ?? t("aiKey.error")}</span>
          </div>
        )}

        {/* fix-B6: AI extraction privacy notice + consent checkbox.
            The seller MUST explicitly opt in here before any WhatsApp
            message body (containing customer PII) is sent to Google Gemini.
            Extraction + AI chat routes return 403 consent_required until
            this is checked. */}
        <Separator />
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t("aiKey.consent.title")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("aiKey.consent.description")}
            </p>
            <label
              htmlFor="gemini-consent"
              className="flex items-start gap-2.5 cursor-pointer text-sm font-medium select-none"
            >
              <Checkbox
                id="gemini-consent"
                checked={consent}
                onCheckedChange={(v) => handleConsentChange(v === true)}
                disabled={consentLoading || consentSaving}
                className="mt-0.5"
              />
              <span className="text-foreground/90">
                {t("aiKey.consent.checkboxLabel")}
              </span>
            </label>
            {consentLoading && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("common.loading")}
              </p>
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t("aiKey.confirmDelete")}
        description={t("aiKey.confirmDeleteDesc")}
        confirmLabel={t("aiKey.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={performDelete}
      />
    </>
  );
}
