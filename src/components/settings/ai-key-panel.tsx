"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [status, setStatus] = useState<Status>("loading");
  const [keyInput, setKeyInput] = useState("");
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
        if (!res.ok) throw new Error("fetch failed");
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
      setResult({ ok: false, error: "Veuillez saisir une clé." });
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
      setResult({ ok: false, error: "Échec de la connexion au serveur." });
      setStatus("error");
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer la clé Gemini ? L'extraction IA utilisera uniquement le regex.")) {
      return;
    }
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
      setResult({ ok: false, error: "Échec de la suppression." });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </span>
          Intelligence artificielle
        </CardTitle>
        <CardDescription>
          Connectez votre clé Google AI Studio pour activer l&apos;extraction de commandes par Gemini.
          Sans clé, l&apos;extraction fonctionne en mode regex (hors ligne, gratuit).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Clé API Gemini</span>
          </div>
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : status === "configured" || status === "editing" ? (
            <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Configuré
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
              <XCircle className="h-3 w-3" />
              Non configuré
            </Badge>
          )}
        </div>

        {/* Configured state */}
        {(status === "configured" || status === "editing") && (
          <div className="space-y-3">
            {activeModel && (
              <p className="text-xs text-muted-foreground">
                Modèle actif&nbsp;: <span className="font-mono">{activeModel}</span>
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
                Remplacer la clé
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" />
                )}
                Supprimer
              </Button>
            </div>
          </div>
        )}

        {/* Edit / not-configured state */}
        {(status === "not-configured" || status === "editing" || status === "error") && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gemini-key">Clé API</Label>
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
                Votre clé est chiffrée (AES-256-GCM) avant d&apos;être enregistrée localement.
                Elle n&apos;est jamais envoyée ailleurs qu&apos;à Google.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleSave} disabled={testing || !keyInput.trim()}>
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Test en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Tester et enregistrer
                  </>
                )}
              </Button>
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Obtenir une clé gratuite
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
                ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <span>{result.ok ? result.message ?? "Clé enregistrée." : result.error ?? "Erreur."}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
