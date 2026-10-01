"use client";

import { ArrowRight, Filter } from "lucide-react";

import { useI18n } from "@/hooks/use-i18n";
import { getSellerActionSpec, getSellerTriggerSpec } from "@/lib/automations/catalog";
import type { AutomationWorkspaceCopyKey } from "@/lib/i18n/automation-workspace";
import { cn } from "@/lib/utils";

import { AutomationActions } from "./automation-actions";
import { conditionDrafts } from "./flow/flow-model";
import { AUTOMATION_TEMPLATES, type AutomationTemplateCategory } from "./flow/flow-templates";
import { ACTION_TONES, actionIcon, triggerIcon, useAutomationCopy } from "./flow/flow-visuals";

const CATEGORIES: readonly AutomationTemplateCategory[] = ["confirm", "delivery", "operations"];

/** Ready-made COD flows, grouped by job, each opening prefilled in the builder. */
export function AutomationTemplatesGallery({ canManage }: { canManage: boolean }) {
  const { t, locale } = useI18n();
  const c = useAutomationCopy();

  return (
    <div className="space-y-8">
      {CATEGORIES.map((category) => (
        <section key={category} className="space-y-3">
          <h3 className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            {c(`template.category.${category}`)}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AUTOMATION_TEMPLATES.filter((template) => template.category === category).map((template) => {
              const preset = template.build(locale);
              const trigger = getSellerTriggerSpec(preset.trigger);
              const TriggerIcon = triggerIcon(preset.trigger);
              const conditions = conditionDrafts(preset.conditions ?? null).length;
              return (
                <article
                  key={template.key}
                  data-automation-template-card={template.key}
                  className="group flex flex-col rounded-surface border bg-card p-4 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-(--elevation-2)"
                >
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="sf-flow-step flex size-8 items-center justify-center rounded-control bg-primary text-primary-foreground" style={{ ["--sf-i" as string]: 0 }}>
                      <TriggerIcon className="size-4" />
                    </span>
                    {conditions > 0 ? (
                      <>
                        <ArrowRight className="size-3 text-muted-foreground icon-rtl-flip" />
                        <span className="sf-flow-step flex size-8 items-center justify-center rounded-control bg-muted text-muted-foreground" style={{ ["--sf-i" as string]: 1 }}>
                          <Filter className="size-4" />
                        </span>
                      </>
                    ) : null}
                    {preset.steps.map((step, index) => {
                      const Icon = actionIcon(step.action);
                      return (
                        <span key={index} className="flex items-center gap-1.5">
                          <ArrowRight className="size-3 text-muted-foreground icon-rtl-flip" />
                          <span
                            className={cn("sf-flow-step flex size-8 items-center justify-center rounded-control", ACTION_TONES[step.action])}
                            style={{ ["--sf-i" as string]: index + (conditions > 0 ? 2 : 1) }}
                          >
                            <Icon className="size-4" />
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  <h4 className="mt-3.5 text-body font-semibold">{c(template.nameKey)}</h4>
                  <p className="mt-1 text-body-sm leading-5 text-muted-foreground">{c(template.descKey)}</p>
                  <p className="mt-3 flex flex-wrap items-center gap-x-1 text-caption text-muted-foreground">
                    <span className="font-medium text-foreground">{trigger ? t(trigger.labelKey) : preset.trigger}</span>
                    <ArrowRight className="size-3 icon-rtl-flip" aria-hidden="true" />
                    {preset.steps
                      .map((step) => {
                        const spec = getSellerActionSpec(step.action);
                        return spec ? c(spec.copyKey as AutomationWorkspaceCopyKey) : step.action;
                      })
                      .join(" · ")}
                  </p>
                  <div className="min-h-4 flex-1" aria-hidden="true" />
                  {canManage ? (
                    <div className="flex justify-end border-t pt-3">
                      <AutomationActions variant="template" templateKey={template.key} />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
