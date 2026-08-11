"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSettingsWorkspaceCopy,
  type SettingsWorkspaceLocale,
} from "@/lib/i18n/settings-workspace";
import { toast } from "@/lib/toast";

const GEMINI_CONSENT_KEY = "gemini_consent_accepted";

type AuthorityState = "loading" | "ready" | "verification-required" | "unavailable";
type ConsentState = "loading" | "ready" | "unavailable";

interface SaveResult {
  ok?: boolean;
  model?: string;
  error?: string;
  message?: string;
  code?: string;
}

function requiresReauthentication(response: Response, body: SaveResult): boolean {
  return response.status === 403 && body.code === "REAUTHENTICATION_REQUIRED";
}

export function AiKeyPanel() {
  const { t, locale: rawLocale } = useI18n();
  const locale = rawLocale as SettingsWorkspaceLocale;
  const copy = (key: Parameters<typeof getSettingsWorkspaceCopy>[1]) =>
    getSettingsWorkspaceCopy(locale, key);
  const [authorityState, setAuthorityState] = useState<AuthorityState>("loading");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [consentState, setConsentState] = useState<ConsentState>("loading");
  const [consentSaving, setConsentSaving] = useState(false);
  const [pin, setPin] = useState("");
  const [reauthBusy, setReauthBusy] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);

  const loadKeyStatus = useCallback(async () => {
    setAuthorityState("loading");
    setReauthError(null);
    try {
      const response = await fetch("/api/secrets/gemini-key", {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as SaveResult & {
        configured?: boolean;
      };
      if (requiresReauthentication(response, body)) {
        setConfigured(null);
        setAuthorityState("verification-required");
        return;
      }
      if (!response.ok || typeof body.configured !== "boolean") {
        throw new Error(body.error ?? t("common.fetchFailed"));
      }
      setConfigured(body.configured);
      setAuthorityState("ready");
    } catch {
      setAuthorityState("unavailable");
    }
  }, [t]);

  const loadConsent = useCallback(async () => {
    setConsentState("loading");
    try {
      const response = await fetch("/api/settings", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`settings:${response.status}`);
      const data = (await response.json()) as {
        settings: Record<string, string>;
      };
      setConsent(data.settings?.[GEMINI_CONSENT_KEY] === "true");
      setConsentState("ready");
    } catch {
      setConsentState("unavailable");
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void Promise.all([loadKeyStatus(), loadConsent()]);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadConsent, loadKeyStatus]);

  const verifyPin = async () => {
    if (!pin.trim() || reauthBusy) return;
    setReauthBusy(true);
    setReauthError(null);
    try {
      const response = await fetch("/api/auth/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = (await response.json().catch(() => ({}))) as SaveResult;
      if (!response.ok) {
        setReauthError(body.error ?? copy("verificationDescription"));
        return;
      }
      setPin("");
      await loadKeyStatus();
    } catch {
      setReauthError(copy("unavailableDescription"));
    } finally {
      setReauthBusy(false);
    }
  };

  async function handleConsentChange(checked: boolean) {
    if (consentState !== "ready" || consent === null) return;
    const previous = consent;
    setConsent(checked);
    setConsentSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: { [GEMINI_CONSENT_KEY]: String(checked) },
        }),
      });
      if (!response.ok) throw new Error("save failed");
      if (checked) {
        toast.success(t("aiKey.consent.saved"));
      } else {
        toast.warning(t("aiKey.consent.revoked"));
      }
    } catch {
      setConsent(previous);
      toast.error(t("aiKey.consent.saveFailed"));
    } finally {
      setConsentSaving(false);
    }
  }

  async function handleSave() {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setResult({ ok: false, error: t("aiKey.errorEmpty") });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const response = await fetch("/api/secrets/gemini-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: trimmed, test: true }),
      });
      const data = (await response.json().catch(() => ({}))) as SaveResult;
      if (requiresReauthentication(response, data)) {
        setAuthorityState("verification-required");
        return;
      }
      setResult(data);
      if (response.ok && data.ok) {
        setActiveModel(data.model ?? null);
        setConfigured(true);
        setEditing(false);
        setKeyInput("");
        setAuthorityState("ready");
      }
    } catch {
      setResult({ ok: false, error: t("aiKey.errorServer") });
    } finally {
      setTesting(false);
    }
  }

  async function performDelete() {
    setDeleting(true);
    try {
      const response = await fetch("/api/secrets/gemini-key", {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as SaveResult;
      if (requiresReauthentication(response, data)) {
        setAuthorityState("verification-required");
        return;
      }
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? t("aiKey.errorDelete"));
      }
      setConfigured(false);
      setEditing(false);
      setActiveModel(null);
      setResult(null);
      setAuthorityState("ready");
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : t("aiKey.errorDelete"),
      });
    } finally {
      setDeleting(false);
    }
  }

  const showEditor =
    authorityState === "ready" && (configured === false || editing);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary/10">
              <Bot className="size-5 text-primary" aria-hidden="true" />
            </span>
            {t("aiKey.title")}
          </CardTitle>
          <CardDescription>{t("aiKey.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">
                {t("aiKey.geminiKeyLabel")}
              </span>
            </div>
            {authorityState === "loading" ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : authorityState === "ready" && configured === true ? (
              <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-success dark:text-emerald-400">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                {t("aiKey.configured")}
              </Badge>
            ) : authorityState === "ready" && configured === false ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 text-warning dark:border-amber-700"
              >
                <XCircle className="size-3" aria-hidden="true" />
                {t("aiKey.notConfigured")}
              </Badge>
            ) : (
              <Badge variant="outline">{copy("unavailable")}</Badge>
            )}
          </div>

          {authorityState === "verification-required" ? (
            <Alert>
              <ShieldAlert className="size-4" />
              <AlertTitle>{copy("verificationRequired")}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {copy("verificationDescription")}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    placeholder={t("auth.pinPlaceholder")}
                    autoComplete="current-password"
                    disabled={reauthBusy}
                  />
                  <Button
                    type="button"
                    onClick={() => void verifyPin()}
                    disabled={reauthBusy || !pin.trim()}
                  >
                    {reauthBusy ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                    {copy("verify")}
                  </Button>
                </div>
                {reauthError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {reauthError}
                  </p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          {authorityState === "unavailable" ? (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>{copy("unavailable")}</AlertTitle>
              <AlertDescription className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {copy("unavailableDescription")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadKeyStatus()}
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  {copy("retry")}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {authorityState === "ready" && configured === true ? (
            <div className="space-y-3">
              {activeModel ? (
                <p className="text-xs text-muted-foreground">
                  {t("aiKey.activeModel")} {" "}
                  <span className="font-mono">{activeModel}</span>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing(true);
                    setResult(null);
                  }}
                >
                  {t("aiKey.replaceKey")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={deleting}
                  className="text-destructive hover:text-destructive"
                >
                  {deleting ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="size-4" aria-hidden="true" />
                  )}
                  {t("common.delete")}
                </Button>
              </div>
            </div>
          ) : null}

          {showEditor ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="gemini-key">{t("aiKey.apiKeyLabel")}</Label>
                <Input
                  id="gemini-key"
                  type="password"
                  placeholder="AIza..."
                  value={keyInput}
                  onChange={(event) => setKeyInput(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={testing}
                />
                <p className="text-xs text-muted-foreground">
                  {t("aiKey.encryptionHelp")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={testing || !keyInput.trim()}
                >
                  {testing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-4" aria-hidden="true" />
                  )}
                  {testing ? t("aiKey.testing") : t("aiKey.testAndSave")}
                </Button>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {t("aiKey.getFreeKey")}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              </div>
            </div>
          ) : null}

          {result ? (
            <div
              role={result.ok ? "status" : "alert"}
              className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                result.ok
                  ? "bg-success/10 text-success dark:bg-success/15"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {result.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0" />
              )}
              <span>
                {result.ok
                  ? result.message ?? t("aiKey.saved")
                  : result.error ?? t("aiKey.error")}
              </span>
            </div>
          ) : null}

          <Separator />
          <Alert>
            <ShieldAlert className="size-4" />
            <AlertTitle>{t("aiKey.consent.title")}</AlertTitle>
            <AlertDescription className="space-y-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("aiKey.consent.description")}
              </p>
              {consentState === "loading" ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                  {copy("loading")}
                </p>
              ) : consentState === "unavailable" ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {copy("unavailableDescription")}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void loadConsent()}
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {copy("retry")}
                  </Button>
                </div>
              ) : (
                <label
                  htmlFor="gemini-consent"
                  className="flex cursor-pointer select-none items-start gap-2.5 text-sm font-medium"
                >
                  <Checkbox
                    id="gemini-consent"
                    checked={consent === true}
                    onCheckedChange={(value) =>
                      void handleConsentChange(value === true)
                    }
                    disabled={consentSaving}
                    className="mt-0.5"
                  />
                  <span className="text-foreground/90">
                    {t("aiKey.consent.checkboxLabel")}
                  </span>
                </label>
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
