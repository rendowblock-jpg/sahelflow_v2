"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { ChatGptPlanCard } from "@/components/settings/chatgpt-plan-card";
import { useI18n } from "@/hooks/use-i18n";

/** Onboarding step 4, third choice: closed until the seller opens it, so nothing is loaded and no one is nudged. */
export function OnboardingChatGptOption({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!canManage) return null;
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-lg p-3 text-start text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring"
      >
        {t("aiKey.chatgpt.onboardingToggle")}
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <div id={panelId} className="border-t p-3">
          <ChatGptPlanCard canManage />
        </div>
      ) : null}
    </div>
  );
}
