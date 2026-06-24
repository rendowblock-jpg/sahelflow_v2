"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface AutomationActionsProps {
  variant: "create" | "toggle" | "activate";
  automationId?: string;
  isActive?: boolean;
  recipeName?: string;
  trigger?: string;
  action?: string;
}

export function AutomationActions({
  variant,
  automationId,
  isActive,
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
    return (
      <Button onClick={handleActivateRecipe} disabled={loading}>
        <Plus className="h-4 w-4 me-1.5" />
        {t("automations.newAutomation")}
      </Button>
    );
  }

  if (variant === "toggle") {
    return (
      <Button variant="ghost" size="sm" onClick={handleToggle} disabled={loading}>
        {isActive ? t("automations.deactivate") : t("automations.activate")}
      </Button>
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
