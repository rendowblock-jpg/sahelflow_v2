"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AutomationEditor,
  type AutomationEditorAutomation,
} from "@/components/automations/automation-editor";

interface AutomationActionsProps {
  variant: "create" | "toggle" | "activate" | "edit";
  automationId?: string;
  isActive?: boolean;
  /** Used by edit variant to pre-fill the form. */
  automation?: AutomationEditorAutomation;
  recipeName?: string;
  trigger?: string;
  action?: string;
}

export function AutomationActions({
  variant,
  automationId,
  isActive,
  automation,
  recipeName,
  trigger,
  action,
}: AutomationActionsProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!automationId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(isActive ? t("automations.deactivated") : t("automations.activated"));
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleActivateRecipe = async () => {
    if (!recipeName || !trigger || !action) return;
    setLoading(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: recipeName, trigger, action, isActive: true }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("automations.created"));
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (variant === "create") {
    // Opens the full editor dialog (name + trigger + action + conditions).
    // Previously this rendered a button that called handleActivateRecipe with
    // no args → silently did nothing (C-audit S3-1).
    return (
      <AutomationEditor>
        <Button>
          <Plus className="h-4 w-4 me-1.5" />
          {t("automations.newAutomation")}
        </Button>
      </AutomationEditor>
    );
  }

  if (variant === "edit") {
    if (!automation) return null;
    return (
      <AutomationEditor automation={automation}>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          {t("common.edit")}
        </Button>
      </AutomationEditor>
    );
  }

  if (variant === "toggle") {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={handleToggle} disabled={loading}>
          {isActive ? t("automations.deactivate") : t("automations.activate")}
        </Button>
      </div>
    );
  }

  if (variant === "activate") {
    return (
      <Button variant="outline" size="sm" onClick={handleActivateRecipe} disabled={loading}>
        {t("automations.activate")}
      </Button>
    );
  }

  return null;
}
