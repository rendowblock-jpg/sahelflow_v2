"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, Cpu, Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_THINKING_LEVEL,
  GEMINI_MODELS,
  GEMINI_THINKING_LEVELS,
  parseGeminiModel,
  parseGeminiThinkingLevel,
  type GeminiModel,
  type GeminiThinkingLevel,
} from "@/lib/ai/gemini/catalog";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const MODEL_SETTING = "gemini_model";
const THINKING_SETTING = "gemini_thinking_level";

function ChoiceCard({
  name,
  value,
  checked,
  disabled,
  title,
  help,
  badge,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  title: string;
  help: string;
  badge?: string;
  onChange: () => void;
}) {
  const id = `${name}-${value}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-surface border p-3 transition-[border-color,background-color]",
        checked
          ? "border-primary/50 bg-primary/5"
          : "border-border/80 hover:border-border hover:bg-muted/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {badge ? (
            <span className="rounded-control border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-caption font-medium text-primary">
              {badge}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

export function GeminiRuntimePanel({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [model, setModel] = useState<GeminiModel>(DEFAULT_GEMINI_MODEL);
  const [thinking, setThinking] = useState<GeminiThinkingLevel>(
    DEFAULT_GEMINI_THINKING_LEVEL,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"model" | "thinking" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/settings", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`settings:${response.status}`);
      const data = (await response.json()) as {
        settings: Record<string, string>;
      };
      setModel(parseGeminiModel(data.settings?.[MODEL_SETTING]));
      setThinking(parseGeminiThinkingLevel(data.settings?.[THINKING_SETTING]));
    } catch {
      setModel(DEFAULT_GEMINI_MODEL);
      setThinking(DEFAULT_GEMINI_THINKING_LEVEL);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function save(
    kind: "model" | "thinking",
    nextModel: GeminiModel,
    nextThinking: GeminiThinkingLevel,
  ) {
    if (!canManage) return;
    const previousModel = model;
    const previousThinking = thinking;
    setModel(nextModel);
    setThinking(nextThinking);
    setSaving(kind);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            [MODEL_SETTING]: nextModel,
            [THINKING_SETTING]: nextThinking,
          },
        }),
      });
      if (!response.ok) throw new Error("save failed");
      toast.success(t("aiKey.runtime.saved"));
    } catch {
      setModel(previousModel);
      setThinking(previousThinking);
      toast.error(t("aiKey.runtime.saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  const busy = loading || saving !== null || !canManage;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="size-4" aria-hidden="true" />
          {t("aiKey.runtime.title")}
        </CardTitle>
        <CardDescription>{t("aiKey.runtime.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("aiKey.runtime.model")}
            {saving === "model" ? (
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </legend>
          <p id="gemini-model-help" className="text-xs text-muted-foreground">
            {t("aiKey.runtime.modelHelp")}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="gemini-model-help"
            className="grid gap-2"
          >
            {GEMINI_MODELS.map((id) => (
              <ChoiceCard
                key={id}
                name="gemini-model"
                value={id}
                checked={model === id}
                disabled={busy}
                title={t(`aiKey.runtime.model.${id}`)}
                help={t(`aiKey.runtime.model.${id}.help`)}
                badge={
                  id === DEFAULT_GEMINI_MODEL
                    ? t("aiKey.runtime.recommended")
                    : undefined
                }
                onChange={() => void save("model", id, thinking)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-sm font-medium">
            {t("aiKey.runtime.thinking")}
            {saving === "thinking" ? (
              <Loader2 className="ms-2 inline size-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </legend>
          <p id="gemini-thinking-help" className="text-xs text-muted-foreground">
            {t("aiKey.runtime.thinkingHelp")}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="gemini-thinking-help"
            className="grid gap-2 sm:grid-cols-2"
          >
            {GEMINI_THINKING_LEVELS.map((level) => (
              <ChoiceCard
                key={level}
                name="gemini-thinking"
                value={level}
                checked={thinking === level}
                disabled={busy}
                title={t(`aiKey.runtime.thinking.${level}`)}
                help={t(`aiKey.runtime.thinking.${level}.help`)}
                badge={
                  level === DEFAULT_GEMINI_THINKING_LEVEL
                    ? t("aiKey.runtime.recommended")
                    : undefined
                }
                onChange={() => void save("thinking", model, level)}
              />
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}
