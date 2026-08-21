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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

const AUTOMATION_NAME_MAX_LENGTH = 120;

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function duplicateAutomationName(name: string, suffixLabel: string): string {
  const suffix = ` — ${suffixLabel}`;
  const available = Math.max(1, AUTOMATION_NAME_MAX_LENGTH - suffix.length);
  const base = name.trim().slice(0, available).trimEnd();
  return `${base}${suffix}`.slice(0, AUTOMATION_NAME_MAX_LENGTH);
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const c = (key: AutomationWorkspaceCopyKey) =>
    getAutomationWorkspaceCopy(locale, key);

  if (variant === "create") {
    return (
      <AutomationBuilder>
        <Button data-automation-create="true">
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
        <Button variant="outline" size="sm" data-automation-template={preset.trigger}>
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
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          data-automation-edit={automation.id}
        >
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
          name: duplicateAutomationName(
            automation.name,
            c("workspace.duplicate"),
          ),
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
      setDeleteOpen(false);
      router.refresh();
    } catch {
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const deleteDescription =
    locale === "ar"
      ? `سيتم حذف «${automation.name}» من مساحة العمل مع الاحتفاظ بسجل التشغيل لأغراض التدقيق والاسترداد.`
      : locale === "fr"
        ? `« ${automation.name} » sera supprimée de l’espace de travail. Son historique d’exécution restera conservé pour l’audit et la récupération.`
        : `“${automation.name}” will be removed from the workspace. Its execution history remains preserved for audit and recovery.`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={loading}
            aria-label={c("workspace.more")}
            data-automation-menu={automation.id}
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
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="size-4" />
            {c("workspace.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{c("workspace.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={loading}
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {c("workspace.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
