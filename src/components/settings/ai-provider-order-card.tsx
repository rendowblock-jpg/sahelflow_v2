"use client";

import { useEffect, useId, useState } from "react";

import { QuotaNoticeFromStatus } from "@/components/ai/ai-canvas-notices";
import { StateView } from "@/components/shared/state-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import type { AiProviderOrderSetting } from "@/lib/ai/providers/provider-order";

import { PanelSkeleton } from "./panel-skeleton";
import { SaveStatus, type SaveState } from "./save-status";

type LoadState = "loading" | "ready" | "failed";

const CHOICES: ReadonlyArray<{ value: AiProviderOrderSetting; label: string }> = [
  { value: "groq-first", label: "aiKey.order.groqFirst" },
  { value: "gemini-first", label: "aiKey.order.geminiFirst" },
  { value: "openai-first", label: "aiKey.order.openaiFirst" },
];

/** Which AI the order reader tries first. Saved on change; only integrations.manage may change it. */
export function AiProviderOrderCard({ canManage }: { canManage: boolean }) {
  const { t, locale } = useI18n();
  const [order, setOrder] = useState<AiProviderOrderSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [chatGptReady, setChatGptReady] = useState(false);
  const noteId = useId();

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    fetch("/api/ai/provider-order")
      .then((response) => {
        if (!response.ok) throw new Error("load failed");
        return response.json() as Promise<{ order?: AiProviderOrderSetting } | null>;
      })
      .then((body) => {
        if (cancelled) return;
        setOrder(body?.order ?? "groq-first");
        setLoadState("ready");
      })
      .catch(() => {
        // Do not show a guessed choice as if it were saved.
        if (!cancelled) setLoadState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, attempt]);

  // Tells whether a ChatGPT plan can be asked: it gives the note and the "ChatGPT first" choice.
  // A failed or refused answer (for example "PIN check needed") shows neither.
  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    fetch("/api/ai/openai/accounts")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { accounts?: Array<{ signedIn?: boolean; planUsageEnabled?: boolean }> } | null) => {
        if (!cancelled) setChatGptReady(Boolean(body?.accounts?.some((a) => a.signedIn && a.planUsageEnabled)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  if (!canManage) return null;

  // "ChatGPT first" is offered only when it can work, or when it is already saved (so the seller can change it).
  const visibleChoices = CHOICES.filter((choice) => choice.value !== "openai-first" || chatGptReady || order === "openai-first");

  function retry() {
    setLoadState("loading");
    setAttempt((count) => count + 1);
  }

  async function choose(next: AiProviderOrderSetting) {
    const previous = order;
    setOrder(next);
    setSaving(true);
    setSaveState("saving");
    try {
      const response = await fetch("/api/ai/provider-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next }),
      });
      if (!response.ok) throw new Error("save failed");
      setSaveState("saved");
      toast.success(t("aiKey.order.saved"));
    } catch {
      setOrder(previous);
      setSaveState("failed");
      toast.error(t("aiKey.order.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("aiKey.order.title")}</CardTitle>
        <CardDescription>{t("aiKey.order.help")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 empty:hidden"><QuotaNoticeFromStatus locale={locale} /></div>
        {loadState === "loading" ? (
          <PanelSkeleton rows={3} label={t("settings.panelState.loading")} testId="ai-order-skeleton" />
        ) : loadState === "failed" || order === null ? (
          <StateView
            kind="error"
            size="inline"
            description={t("settings.panelState.orderLoadFailed")}
            onRetry={retry}
            testId="ai-order-error"
            retryTestId="ai-order-retry"
          />
        ) : (
          <div className="space-y-2">
          <fieldset className="space-y-2" disabled={saving} aria-describedby={chatGptReady ? noteId : undefined}>
            <legend className="sr-only">{t("aiKey.order.title")}</legend>
            {visibleChoices.map((choice) => (
              <label key={choice.value} className="flex cursor-pointer items-center gap-2 text-sm [@media(pointer:coarse)]:min-h-11">
                <input
                  type="radio"
                  name="ai-provider-order"
                  value={choice.value}
                  checked={order === choice.value}
                  onChange={() => void choose(choice.value)}
                  className="size-4 accent-primary"
                />
                {t(choice.label)}
              </label>
            ))}
          </fieldset>
          <SaveStatus
            state={saveState}
            saving={t("settings.panelState.saving")}
            saved={t("aiKey.order.saved")}
            failed={t("aiKey.order.saveFailed")}
          />
          </div>
        )}
        {chatGptReady ? (
          <p id={noteId} className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {t(order === "openai-first" ? "aiKey.order.openaiFirstNote" : "aiKey.order.chatgptNote")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
