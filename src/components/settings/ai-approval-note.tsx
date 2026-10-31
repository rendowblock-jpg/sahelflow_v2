"use client";

import { ShieldCheck } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";

/** Top of the AI settings page: the AI prepares, the seller approves, nothing is sent on its own. */
export function AiApprovalNote() {
  const { t } = useI18n();
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{t("settings.aiApproval.note")}</span>
    </p>
  );
}
