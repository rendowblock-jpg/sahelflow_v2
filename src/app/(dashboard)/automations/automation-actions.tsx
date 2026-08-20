"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  MoreHorizontal,
  PauseCircle,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";

import {
  AutomationBuilder,
  type AutomationBuilderAutomation,
  type AutomationBuilderPreset,
} from "@/components/automations/automation-builder";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/hooks/use-i18n";
import {
  getAutomationWorkspaceCopy,
  type AutomationWorkspaceCopyKey,
} from "@/lib/i18n/automation-workspace";
import { toast } from "@/lib/toast";

interface AutomationActionsProps {
  variant: "create" | "edit" | "menu" | "template";
  automation?: AutomationBuilderAutomation;
  preset?: AutomationBuilderPreset;
  repairRequired?: boolean;
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function AutomationActions({
  variant,
  automation,
  preset,
  repairRequired = false,
}: AutomationActionsProps) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const c = (key: AutomationWorkspaceCopyKey) =>
    getAutomationWorkspaceCopy(locale, key);

  if (variant === "create") {
    return (
      <AutomationBuilder>
        <Button>
          <Plus className="me-1.5 size-4" />
          {c("workspace.new")}
        </Button>
      </AutomationBuilder>
    );
  }

  if (variant === "template") {
    if (!preset) return null;
    return (
      <AutomationBuilder preset={preset}>
        <Button variant="outline" size="sm">
          <Plus className="me-1.5 size-4" />
          {c("template.use")}
        </Button>
      </AutomationBuilder>
    );
  }

  if (variant === "edit") {
    if (!automation) return null;
    return (
      <AutomationBuilder automation={automation}>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Pencil className="size-3.5" />
          {c("workspace.edit")}
        </Button>
      </AutomationBuilder>
    );
  }

  if (!automation) return null;

  const toggle = async () => {
    if (!automation.isActive && repairRequired) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/automations/${automation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !automation.isActive }),
      });
      if (!response.ok) throw new Error("AUTOMATION_TOGGLE_FAILED");
      toast.success(
        automation.isActive
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

  const duplicate = async () => {
    if (repairRequired) return;
    setLoading(true);
    try {
      const steps = parseJson(automation.steps);
      const config = parseJson(automation.config);
      const conditions = parseJson(automation.conditions) ?? null;
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${automation.name} — ${c("workspace.duplicate")}`,
          trigger: automation.trigger,
          action: automation.action,
          isActive: false,
          dryRun: automation.dryRun ?? false,
          conditions,
          ...(Array.isArray(steps) ? { steps } : {}),
          ...(config && typeof config === "object" ? { config } : {}),
          maxRetries: automation.maxRetries ?? 2,
          retryDelayMs: automation.retryDelayMs ?? 500,
        }),
      });
      if (!response.ok) throw new Error("AUTOMATION_DUPLICATE_FAILED");
      toast.success(t("automations.created"));
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/automations/${automation.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("AUTOMATION_DELETE_FAILED");
      toast.success(c("workspace.delete"));
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={loading}
          aria-label={c("workspace.more")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void toggle();
          }}
          disabled={!automation.isActive && repairRequired}
        >
          {automation.isActive ? (
            <PauseCircle className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          {automation.isActive ? c("workspace.pause") : c("workspace.activate")}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void duplicate();
          }}
          disabled={repairRequired}
        >
          <Copy className="size-4" />
          {c("workspace.duplicate")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={(event) => {
            event.preventDefault();
            void remove();
          }}
        >
          <Trash2 className="size-4" />
          {c("workspace.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
