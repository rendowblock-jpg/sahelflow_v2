"use client";

import { AlertCircle, ArrowDown, ArrowUp, Copy, Filter, Flag, Plus, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { operatorLabelKey } from "@/components/automations/seller-condition-builder";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSellerActionSpec,
  getSellerTriggerSpec,
  type SellerAutomationAction,
} from "@/lib/automations/catalog";
import type { AutomationWorkspaceCopyKey } from "@/lib/i18n/automation-workspace";
import { cn } from "@/lib/utils";

import {
  conditionDrafts,
  type BuilderStep,
  type FlowIssue,
} from "./flow-model";
import type { SellerConditionGroupDraft } from "@/components/automations/seller-condition-builder";
import { ACTION_TONES, ActionGlyph, actionIcon, formatWait, readableTemplate, TriggerGlyph, useAutomationCopy } from "./flow-visuals";

export type FlowSelection = "trigger" | "conditions" | `step-${number}`;

/**
 * The automation as a vertical flow: trigger, conditions, then each step in
 * run order. Blocks are selectable; the inspector edits the selected one.
 */
export function FlowCanvas({
  trigger,
  conditions,
  steps,
  stepKeys,
  live,
  issues,
  selection,
  disabled,
  onSelect,
  onInsert,
  onMove,
  onDuplicate,
  onRemove,
}: {
  trigger: string;
  conditions: SellerConditionGroupDraft;
  steps: readonly BuilderStep[];
  /** Stable identity per step, so only a newly added block animates in. */
  stepKeys: readonly string[];
  /** The automation is on: the signal runs down the connectors. */
  live: boolean;
  issues: readonly FlowIssue[];
  selection: FlowSelection;
  disabled: boolean;
  onSelect: (selection: FlowSelection) => void;
  onInsert: (index: number, action: SellerAutomationAction) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const { t } = useI18n();
  const c = useAutomationCopy();
  const spec = getSellerTriggerSpec(trigger);
  const drafts = conditionDrafts(conditions);
  const mode = conditions && "any" in conditions ? "any" : "all";
  const issueFor = (target: string) => issues.some((issue) => issue.target === target);

  return (
    <div data-flow-canvas="true" className="mx-auto flex w-full max-w-[440px] flex-col items-center pb-16 pt-8">
      <FlowNode
        id="trigger"
        order={0}
        live={live}
        selected={selection === "trigger"}
        invalid={issueFor("trigger")}
        eyebrow={c("flow.trigger")}
        icon={<TriggerGlyph trigger={trigger} className="size-4" />}
        tone="bg-primary text-primary-foreground"
        title={spec ? t(spec.labelKey) : trigger}
        onSelect={() => onSelect("trigger")}
      >
        <p className="text-caption text-muted-foreground">
          {c("flow.variablesAvailable", { count: spec?.variables.length ?? 0 })}
        </p>
      </FlowNode>

      <Connector live={live} />

      <FlowNode
        id="conditions"
        order={1}
        selected={selection === "conditions"}
        invalid={issueFor("conditions")}
        eyebrow={c("flow.conditions")}
        icon={<Filter className="size-4" aria-hidden="true" />}
        tone="bg-muted text-foreground"
        title={drafts.length ? c("builder.conditionCount", { count: drafts.length }) : c("workspace.always")}
        onSelect={() => onSelect("conditions")}
      >
        {drafts.length === 0 ? (
          <p className="text-caption text-muted-foreground">{c("flow.alwaysRuns")}</p>
        ) : (
          <ul className="space-y-1">
            {drafts.slice(0, 3).map((condition, index) => {
              const field = spec?.fields.find((item) => item.value === condition.field);
              return (
                <li key={index} className="flex flex-wrap items-baseline gap-1 text-caption">
                  {index > 0 ? (
                    <span className="font-semibold uppercase text-muted-foreground">
                      {mode === "all" ? c("flow.and") : c("flow.or")}
                    </span>
                  ) : null}
                  <span className="font-medium">{field ? c(field.copyKey as AutomationWorkspaceCopyKey) : condition.field}</span>
                  <span className="text-muted-foreground">{t(operatorLabelKey(condition.operator))}</span>
                  {condition.value ? (
                    <span dir="auto" className="rounded-[4px] bg-muted px-1 font-medium">{condition.value}</span>
                  ) : null}
                </li>
              );
            })}
            {drafts.length > 3 ? (
              <li className="text-caption text-muted-foreground">{c("workspace.andMore", { count: drafts.length - 3 })}</li>
            ) : null}
          </ul>
        )}
      </FlowNode>

      <Connector live={live}>
        <InsertButton trigger={trigger} steps={steps} index={0} disabled={disabled} onInsert={onInsert} />
      </Connector>

      {steps.map((step, index) => {
        const actionSpec = getSellerActionSpec(step.action);
        const id = `step-${index}` as const;
        return (
          <div key={stepKeys[index] ?? index} className="flex w-full flex-col items-center">
            <FlowNode
              id={id}
              order={index + 2}
              selected={selection === id}
              invalid={issueFor(id)}
              eyebrow={c("flow.step", { n: index + 1 })}
              icon={<ActionGlyph action={step.action} className="size-4" />}
              tone={ACTION_TONES[step.action] ?? "bg-muted"}
              title={actionSpec ? c(actionSpec.copyKey as AutomationWorkspaceCopyKey) : step.action}
              onSelect={() => onSelect(id)}
              tools={
                disabled ? null : (
                  <>
                    <ToolButton label={c("builder.moveUp")} disabled={index === 0} onClick={() => onMove(index, -1)}>
                      <ArrowUp />
                    </ToolButton>
                    <ToolButton label={c("builder.moveDown")} disabled={index === steps.length - 1} onClick={() => onMove(index, 1)}>
                      <ArrowDown />
                    </ToolButton>
                    <ToolButton
                      label={c("flow.duplicateStep")}
                      disabled={steps.length >= 20 || step.action === "update_status"}
                      onClick={() => onDuplicate(index)}
                    >
                      <Copy />
                    </ToolButton>
                    <ToolButton label={c("builder.removeAction")} disabled={steps.length === 1} destructive onClick={() => onRemove(index)}>
                      <Trash2 />
                    </ToolButton>
                  </>
                )
              }
            >
              <StepSummary step={step} />
            </FlowNode>
            <Connector live={live}>
              <InsertButton trigger={trigger} steps={steps} index={index + 1} disabled={disabled} onInsert={onInsert} />
            </Connector>
          </div>
        );
      })}

      <div className="sf-node-in flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-caption font-medium text-muted-foreground shadow-(--elevation-1)">
        <Flag className="size-3.5" aria-hidden="true" />
        {c("flow.end")}
      </div>
    </div>
  );
}

function StepSummary({ step }: { step: BuilderStep }) {
  const { t } = useI18n();
  const c = useAutomationCopy();
  let text: string;
  if (step.action === "send_whatsapp" || step.action === "send_notification") {
    text = step.config.messageTemplate?.trim() ? readableTemplate(step.config.messageTemplate.trim(), c) : c("flow.emptyMessage");
  } else if (step.action === "tag_customer") {
    text = step.config.noteText?.trim() ? readableTemplate(step.config.noteText.trim(), c) : c("flow.emptyMessage");
  } else if (step.action === "wait") {
    text = c("flow.waitFor", { duration: formatWait(step.config.delayMinutes ?? 0, c) });
  } else if (step.action === "recheck_order_status") {
    text = c("flow.onlyIfStill", { status: t(`automations.status.${step.config.expectedStatus ?? "pending"}`) });
  } else {
    text = c("flow.setStatus", { status: t(`automations.status.${step.config.targetStatus ?? "shipped"}`) });
  }
  return (
    <div className="space-y-1.5">
      <p dir="auto" className="line-clamp-2 whitespace-pre-line text-caption leading-[1.125rem] text-muted-foreground">
        {text}
      </p>
      {step.onFailure === "continue" ? (
        <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {c("flow.continuesOnFailure")}
        </span>
      ) : null}
    </div>
  );
}

function FlowNode({
  id,
  order,
  live = false,
  selected,
  invalid,
  eyebrow,
  icon,
  tone,
  title,
  tools,
  onSelect,
  children,
}: {
  id: string;
  order: number;
  live?: boolean;
  selected: boolean;
  invalid: boolean;
  eyebrow: string;
  icon: React.ReactNode;
  tone: string;
  title: string;
  tools?: React.ReactNode;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="group/node sf-node-in relative w-full" style={{ ["--sf-i" as string]: order }}>
      <button
        type="button"
        data-flow-node={id}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "w-full rounded-surface border bg-card p-3.5 text-start shadow-(--elevation-1) outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring",
          selected ? "border-primary ring-2 ring-primary/25" : "hover:border-primary/40",
          invalid && !selected && "border-destructive/60",
        )}
      >
        <span className="flex items-start gap-3">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-control", tone, live && "sf-live-ring")}>{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</span>
            <span dir="auto" className="mt-0.5 block truncate text-body-sm font-semibold">{title}</span>
            {children ? <span className="mt-1.5 block">{children}</span> : null}
          </span>
          {invalid ? <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" /> : null}
        </span>
      </button>
      {tools ? (
        <div className="absolute -end-2 top-1/2 flex -translate-y-1/2 translate-x-full flex-col gap-0.5 rounded-control border bg-background p-0.5 opacity-0 shadow-(--elevation-2) transition-opacity group-focus-within/node:opacity-100 group-hover/node:opacity-100 rtl:-translate-x-full max-xl:hidden">
          {tools}
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  label,
  disabled,
  destructive,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-[calc(var(--radius-control)-2px)] text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5",
        destructive ? "hover:bg-destructive-soft hover:text-destructive" : "hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Connector({ live, children }: { live: boolean; children?: React.ReactNode }) {
  return (
    <div className="relative flex h-12 w-full items-center justify-center" aria-hidden={children ? undefined : true}>
      <span className="sf-flow-line absolute inset-y-0 start-1/2 w-0.5 -translate-x-1/2 rtl:translate-x-1/2" data-live={live ? "true" : undefined} aria-hidden="true" />
      {children}
    </div>
  );
}

/** "+" between blocks: inserts a step at that position, from the actions this trigger allows. */
function InsertButton({
  trigger,
  steps,
  index,
  disabled,
  onInsert,
}: {
  trigger: string;
  steps: readonly BuilderStep[];
  index: number;
  disabled: boolean;
  onInsert: (index: number, action: SellerAutomationAction) => void;
}) {
  const c = useAutomationCopy();
  // "Update order status" is not offered for new steps: orders created in
  // SahelFlow move only through governed confirmation, dispatch and delivery.
  const actions = (getSellerTriggerSpec(trigger)?.actions ?? []).filter((action) => action !== "update_status");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled || steps.length >= 20}
          aria-label={index === steps.length ? c("flow.addStep") : c("flow.insertStep")}
          title={index === steps.length ? c("flow.addStep") : c("flow.insertStep")}
          data-flow-insert={index}
          className="relative z-10 flex size-7 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-(--elevation-1) outline-none transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 data-[state=open]:border-primary data-[state=open]:bg-primary data-[state=open]:text-primary-foreground"
        >
          <Plus className="size-3.5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72">
        <DropdownMenuLabel>{c("flow.chooseAction")}</DropdownMenuLabel>
        {actions.map((action) => {
          const spec = getSellerActionSpec(action);
          const Icon = actionIcon(action);
          return (
            <DropdownMenuItem
              key={action}
              onSelect={() => onInsert(index, action)}
              className="items-start gap-2.5 py-2"
            >
              <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-control", ACTION_TONES[action])}>
                <Icon className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-body-sm font-medium">
                  {spec ? c(spec.copyKey as AutomationWorkspaceCopyKey) : action}
                </span>
                <span className="block text-caption leading-4 text-muted-foreground">
                  {c(`flow.actionHint.${action}` as AutomationWorkspaceCopyKey)}
                </span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
