"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";

import {
  AutomationEditor,
  type AutomationEditorAutomation,
} from "@/components/automations/automation-editor";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface AutomationActionsProps {
  variant: "create" | "toggle" | "activate" | "edit";
  automationId?: string;
  isActive?: boolean;
  automation?: AutomationEditorAutomation;
  recipeName?: string;
  trigger?: string;
  action?: string;
}

function recipeStep(action: string) {
  switch (action) {
    case "send_whatsapp":
      return {
        action,
        onFailure: "stop" as const,
        config: {
          messageTemplate:
            "Bonjour {{customerName}}, votre commande {{orderNumber}} a été mise à jour.",
        },
      };
    case "send_notification":
      return {
        action,
        onFailure: "stop" as const,
        config: { messageTemplate: "Automation: {{orderNumber}}" },
      };
    case "tag_customer":
      return {
        action,
        onFailure: "stop" as const,
        config: { noteText: "Automation: {{orderNumber}}" },
      };
    case "update_status":
      return {
        action,
        onFailure: "stop" as const,
        config: { targetStatus: "shipped" as const },
      };
    default:
      return null;
  }
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
      const response = await fetch(`/api/automations/${automationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!response.ok) throw new Error("Failed");
      toast.success(
        isActive
          ? t("automations.deactivated")
          : t("automations.activated"),
      );
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleActivateRecipe = async () => {
    if (!recipeName || !trigger || !action) return;
    const step = recipeStep(action);
    if (!step) {
      toast.error(t("common.error"));
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recipeName,
          trigger,
          action: step.action,
          config: step.config,
          steps: [step],
          conditions: null,
          isActive: true,
          dryRun: false,
          maxRetries: 2,
          retryDelayMs: 500,
        }),
      });
      if (!response.ok) throw new Error("Failed");
      toast.success(t("automations.created"));
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (variant === "create") {
    return (
      <AutomationEditor>
        <Button>
          <Plus className="me-1.5 h-4 w-4" />
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
        <Button
          variant="ghost"
          size="sm"
          onClick={handleToggle}
          disabled={loading}
        >
          {isActive
            ? t("automations.deactivate")
            : t("automations.activate")}
        </Button>
      </div>
    );
  }

  if (variant === "activate") {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={handleActivateRecipe}
        disabled={loading}
      >
        {t("automations.activate")}
      </Button>
    );
  }

  return null;
}
