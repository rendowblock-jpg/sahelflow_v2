"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

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
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
            <Badge className="gap-1 border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {t("aiKey.configured")}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
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
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
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
