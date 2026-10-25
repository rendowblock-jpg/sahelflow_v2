"use client";

import { useEffect, useId, useState } from "react";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import type { AiProviderOrderSetting } from "@/lib/ai/providers/provider-order";

const CHOICES: ReadonlyArray<{ value: AiProviderOrderSetting; label: string }> = [
  { value: "groq-first", label: "aiKey.order.groqFirst" },
  { value: "gemini-first", label: "aiKey.order.geminiFirst" },
  { value: "openai-first", label: "aiKey.order.openaiFirst" },
];

/** Which AI the order reader tries first. Saved on change; only integrations.manage may change it. */
export function AiProviderOrderCard({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [order, setOrder] = useState<AiProviderOrderSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [chatGptReady, setChatGptReady] = useState(false);
  const noteId = useId();

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    fetch("/api/ai/provider-order")
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { order?: AiProviderOrderSetting } | null) => {
        if (!cancelled) setOrder(body?.order ?? "groq-first");
      })
      .catch(() => {
        if (!cancelled) setOrder("groq-first");
      });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

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

  async function choose(next: AiProviderOrderSetting) {
    const previous = order;
    setOrder(next);
    setSaving(true);
    try {
      const response = await fetch("/api/ai/provider-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next }),
      });
      if (!response.ok) throw new Error("save failed");
      toast.success(t("aiKey.order.saved"));
    } catch {
      setOrder(previous);
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
        {order === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <fieldset className="space-y-2" disabled={saving} aria-describedby={chatGptReady ? noteId : undefined}>
            <legend className="sr-only">{t("aiKey.order.title")}</legend>
            {visibleChoices.map((choice) => (
              <label key={choice.value} className="flex cursor-pointer items-center gap-2 text-sm">
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
