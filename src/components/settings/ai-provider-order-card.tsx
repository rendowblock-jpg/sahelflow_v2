"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";
import type { AiProviderOrderSetting } from "@/lib/ai/providers/provider-order";

const CHOICES: ReadonlyArray<{ value: AiProviderOrderSetting; label: string }> = [
  { value: "groq-first", label: "aiKey.order.groqFirst" },
  { value: "gemini-first", label: "aiKey.order.geminiFirst" },
];

/** Which AI the order reader tries first. Saved on change; only integrations.manage may change it. */
export function AiProviderOrderCard({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [order, setOrder] = useState<AiProviderOrderSetting | null>(null);
  const [saving, setSaving] = useState(false);

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

  if (!canManage) return null;

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
          <fieldset className="space-y-2" disabled={saving}>
            <legend className="sr-only">{t("aiKey.order.title")}</legend>
            {CHOICES.map((choice) => (
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
      </CardContent>
    </Card>
  );
}
