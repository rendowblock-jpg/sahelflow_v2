"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FlaskConical,
  Loader2,
} from "lucide-react";

import { SellerConditionBuilder, type SellerConditionGroupDraft } from "@/components/automations/seller-condition-builder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import {
  getSellerActionSpec,
  getSellerTriggerSpec,
  type SellerAutomationAction,
  type SellerAutomationTrigger,
} from "@/lib/automations/catalog";
import type { AutomationWorkspaceCopyKey } from "@/lib/i18n/automation-workspace";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { FlowCanvas, type FlowSelection } from "./flow/flow-canvas";
import {
  defaultStep,
  flowIssues,
  flowPayload,
  isSellerAction,
  normalizeStepsForTrigger,
  parseStoredConditions,
  parseStoredSteps,
  statusTargetsForStep,
  type AutomationBuilderAutomation,
  type AutomationBuilderPreset,
  type BuilderStep,
  type FlowDraft,
  type FlowIssue,
} from "./flow/flow-model";
import { TriggerGlyph, useAutomationCopy } from "./flow/flow-visuals";
import { StepEditor } from "./flow/step-editor";
import { RunHistory } from "./flow/run-history";
import { TriggerPicker } from "./flow/trigger-picker";
import type { AutomationRunSummary } from "@/lib/automations/automation-readiness";

export type { AutomationBuilderAutomation, AutomationBuilderPreset } from "./flow/flow-model";

function initialFlow(
  automation: AutomationBuilderAutomation | undefined,
  preset: AutomationBuilderPreset | undefined,
  locale: string,
): FlowDraft {
  const trigger =
    automation && getSellerTriggerSpec(automation.trigger)
      ? (automation.trigger as SellerAutomationTrigger)
      : preset?.trigger ?? "order.created";
  const stored = automation ? parseStoredSteps(automation, locale) : preset?.steps ?? [];
  const firstAllowed = getSellerTriggerSpec(trigger)?.actions[0];
  return {
    name: automation?.name ?? preset?.name ?? "",
    trigger,
    conditions: automation ? parseStoredConditions(automation) : preset?.conditions ?? null,
    steps: stored.length > 0 ? stored : firstAllowed ? [defaultStep(firstAllowed, locale, trigger)] : [],
    dryRun: automation?.dryRun ?? false,
    maxRetries: automation?.maxRetries ?? 2,
    retryDelayMs: automation?.retryDelayMs ?? 500,
  };
}

/**
 * The automation editor: a When → If → Then flow on a canvas, edited block by
 * block in the inspector, saved through the same governed automations API.
 */
export function AutomationBuilder({
  automation,
  preset,
  whatsappConnected = true,
  runs,
}: {
  automation?: AutomationBuilderAutomation;
  preset?: AutomationBuilderPreset;
  /** False when no WhatsApp number is connected right now. */
  whatsappConnected?: boolean;
  /** Recent runs of this automation (edit only). */
  runs?: AutomationRunSummary[];
}) {
  const { t, locale } = useI18n();
  const c = useAutomationCopy();
  const router = useRouter();
  const isEdit = Boolean(automation);
  const [flow, setFlow] = useState<FlowDraft>(() => initialFlow(automation, preset, locale));
  const [isActive, setIsActive] = useState(automation?.isActive ?? true);
  const [snapshot, setSnapshot] = useState(() => JSON.stringify([initialFlow(automation, preset, locale), automation?.isActive ?? true]));
  const [selection, setSelection] = useState<FlowSelection>(() =>
    automation || preset ? "step-0" : "trigger",
  );
  const [saving, setSaving] = useState(false);
  const [inspectorView, setInspectorView] = useState<"edit" | "runs">("edit");
  const [stepKeys, setStepKeys] = useState<string[]>(() => flow.steps.map(() => crypto.randomUUID()));
  // Keys follow structural edits; anything else that changes the count
  // (switching trigger) simply re-keys.
  const keys = stepKeys.length === flow.steps.length ? stepKeys : flow.steps.map((_, index) => stepKeys[index] ?? `k-${index}`);

  const legacyInvalid = Boolean(
    automation &&
      (!getSellerTriggerSpec(automation.trigger) ||
        (!isSellerAction(automation.action) && parseStoredSteps(automation, locale).length === 0)),
  );
  const issues = useMemo(() => flowIssues(flow), [flow]);
  const valid = issues.length === 0 && !legacyInvalid;
  const dirty = JSON.stringify([flow, isActive]) !== snapshot;

  const patch = (next: Partial<FlowDraft>) => setFlow((current) => ({ ...current, ...next }));
  const setSteps = (updater: (steps: BuilderStep[]) => BuilderStep[]) =>
    setFlow((current) => ({ ...current, steps: updater(current.steps) }));

  function setTrigger(trigger: SellerAutomationTrigger) {
    const compatible = normalizeStepsForTrigger(trigger, flow.steps, locale);
    const fallback = getSellerTriggerSpec(trigger)?.actions[0];
    const steps = compatible.length > 0 ? compatible : fallback ? [defaultStep(fallback, locale, trigger)] : [];
    setFlow((current) => ({ ...current, trigger, conditions: null, steps }));
    setStepKeys(steps.map(() => crypto.randomUUID()));
  }

  function insertStep(index: number, action: SellerAutomationAction) {
    setSteps((steps) => {
      let step = defaultStep(action, locale, flow.trigger);
      if (action === "update_status") {
        const targetStatus = statusTargetsForStep(flow.trigger, steps, index)[0];
        if (!targetStatus) return steps;
        step = { action, onFailure: "stop", config: { targetStatus } };
      }
      return [...steps.slice(0, index), step, ...steps.slice(index)];
    });
    setStepKeys((current) => [...current.slice(0, index), crypto.randomUUID(), ...current.slice(index)]);
    setSelection(`step-${index}`);
  }

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= flow.steps.length) return;
    setSteps((steps) => {
      const next = [...steps];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
    setStepKeys((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
    setSelection(`step-${target}`);
  }

  function removeStep(index: number) {
    if (flow.steps.length <= 1) return;
    setSteps((steps) => steps.filter((_, position) => position !== index));
    setStepKeys((current) => current.filter((_, position) => position !== index));
    setSelection(index > 0 ? `step-${index - 1}` : "conditions");
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const response = await fetch(isEdit ? `/api/automations/${automation?.id}` : "/api/automations", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flowPayload(flow, isActive)),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t("automations.updateFailed"));
      }
      setSnapshot(JSON.stringify([flow, isActive]));
      if (isEdit) {
        toast.success(t("automations.editor.updated"));
        router.refresh();
      } else {
        toast.success(t("automations.editor.created"));
        router.push("/automations?tab=my");
        router.refresh();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("automations.updateFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/⌘+S saves; leaving with unsaved changes asks first.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const selectedIssues = issues.filter((issue) => issue.target === selection || (issue.target === "steps" && selection.startsWith("step")));
  const stepIndex = selection.startsWith("step-") ? Number(selection.slice(5)) : -1;
  const selectedStep = flow.steps[stepIndex];
  const triggerSpec = getSellerTriggerSpec(flow.trigger);

  return (
    <div
      data-automation-flow-editor="true"
      data-automation-builder="when-if-then"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <Link
          href="/automations?tab=my"
          aria-label={c("flow.back")}
          title={c("flow.back")}
          onClick={(event) => {
            if (dirty && !window.confirm(c("flow.discardConfirm"))) event.preventDefault();
          }}
          className="flex size-9 shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4 icon-rtl-flip" aria-hidden="true" />
        </Link>
        <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-primary-subtle text-primary max-sm:hidden">
          <TriggerGlyph trigger={flow.trigger} className="size-4" />
        </span>
        <label htmlFor="automation-name-v2" className="sr-only">{c("builder.name")}</label>
        <input
          id="automation-name-v2"
          value={flow.name}
          maxLength={120}
          disabled={saving}
          placeholder={c("builder.namePlaceholder")}
          onChange={(event) => patch({ name: event.target.value })}
          className="h-9 min-w-0 flex-1 rounded-control border border-transparent bg-transparent px-2 text-body font-semibold outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
        />

        {dirty ? (
          <span className="shrink-0 text-caption text-muted-foreground max-md:hidden">{c("flow.unsaved")}</span>
        ) : isEdit ? (
          <span className="flex shrink-0 items-center gap-1 text-caption text-muted-foreground max-md:hidden">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {c("flow.allSaved")}
          </span>
        ) : null}

        <IssuesStatus issues={issues} legacyInvalid={legacyInvalid} onSelect={(target) => {
          if (target === "trigger" || target === "conditions" || target.startsWith("step-")) setSelection(target as FlowSelection);
          if (target === "steps") setSelection("step-0");
        }} />

        {flow.dryRun ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-info-soft px-2 py-1 text-caption font-medium text-info max-lg:hidden">
            <FlaskConical className="size-3.5" aria-hidden="true" />
            {c("workspace.dryRun")}
          </span>
        ) : null}

        <label className="flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-control border px-2.5 text-caption font-medium" title={c("flow.activeHint")}>
          <Switch checked={isActive} disabled={saving || legacyInvalid} onCheckedChange={setIsActive} aria-label={c("flow.active")} />
          <span className="max-sm:hidden">{c("flow.active")}</span>
        </label>

        <button
          type="button"
          onClick={() => void save()}
          disabled={!valid || saving || (isEdit && !dirty)}
          data-automation-save="true"
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-control bg-primary px-3.5 text-body-sm font-semibold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isEdit ? c("builder.save") : c("builder.create")}
        </button>
      </header>

      {!whatsappConnected && flow.steps.some((step) => step.action === "send_whatsapp") ? (
        <div role="status" data-automation-whatsapp-warning="true" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning-subtle px-4 py-2 text-body-sm">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1">{c("flow.waNotConnected")}</p>
          <Link href="/inbox" className="shrink-0 font-semibold text-primary hover:underline">
            {c("flow.waConnect")}
          </Link>
        </div>
      ) : null}

      {legacyInvalid ? (
        <div role="alert" className="flex items-start gap-3 border-b border-destructive/30 bg-destructive-subtle px-4 py-2.5 text-body-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p>{c("builder.invalidLegacy")}</p>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <main className="relative min-w-0 flex-1 bg-muted/40 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:16px_16px] px-6 lg:overflow-y-auto">
          <FlowCanvas
            trigger={flow.trigger}
            conditions={flow.conditions}
            steps={flow.steps}
            stepKeys={keys}
            live={isActive && !flow.dryRun && valid}
            issues={issues}
            selection={selection}
            disabled={saving}
            onSelect={setSelection}
            onInsert={insertStep}
            onMove={moveStep}
            onDuplicate={(index) => {
              const step = flow.steps[index];
              if (step) insertStepCopy(index + 1, step);
            }}
            onRemove={removeStep}
          />
        </main>

        <aside
          data-automation-inspector="true"
          className="flex shrink-0 flex-col border-s bg-background max-lg:border-s-0 max-lg:border-t lg:w-[400px] lg:overflow-y-auto"
        >
          {isEdit ? (
            <div role="tablist" aria-label={c("flow.tabRuns")} className="flex shrink-0 gap-1 border-b px-5 pt-3">
              {(["edit", "runs"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={inspectorView === view}
                  data-automation-inspector-tab={view}
                  onClick={() => setInspectorView(view)}
                  className={cn(
                    "-mb-px flex items-center gap-1.5 border-b-2 px-2.5 pb-2 text-body-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    inspectorView === view ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {view === "edit" ? c("flow.tabEdit") : c("flow.tabRuns")}
                  {view === "runs" && runs?.length ? (
                    <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{runs.length}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          {inspectorView === "runs" ? (
            <div className="flex-1 p-5">
              <RunHistory runs={runs ?? []} />
            </div>
          ) : (
          <div className="flex-1 space-y-5 p-5">
            <InspectorHeading
              eyebrow={
                selection === "trigger"
                  ? c("flow.trigger")
                  : selection === "conditions"
                    ? c("flow.conditions")
                    : c("flow.step", { n: stepIndex + 1 })
              }
              title={
                selection === "trigger"
                  ? triggerSpec ? t(triggerSpec.labelKey) : flow.trigger
                  : selection === "conditions"
                    ? c("workspace.onlyIf")
                    : selectedStep
                      ? actionTitle(selectedStep.action, c)
                      : ""
              }
              hint={
                selection === "trigger"
                  ? c("flow.chooseTrigger")
                  : selection === "conditions"
                    ? c("builder.ifHint")
                    : selectedStep
                      ? c(`flow.actionHint.${selectedStep.action}` as AutomationWorkspaceCopyKey)
                      : c("flow.selectHint")
              }
            />

            {selectedIssues.length > 0 ? (
              <ul className="space-y-1.5 rounded-control border border-destructive/30 bg-destructive-subtle p-3">
                {selectedIssues.map((issue) => (
                  <li key={`${issue.target}-${issue.code}`} className="flex items-start gap-2 text-caption text-destructive">
                    <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    {c(`flow.issue.${issue.code}`)}
                  </li>
                ))}
              </ul>
            ) : null}

            {selection === "trigger" ? (
              <TriggerPicker value={flow.trigger} disabled={saving} onChange={setTrigger} />
            ) : null}
            {selection === "conditions" ? (
              <SellerConditionBuilder
                trigger={flow.trigger}
                value={flow.conditions}
                onChange={(conditions: SellerConditionGroupDraft) => patch({ conditions })}
                disabled={saving}
                variant="inspector"
              />
            ) : null}
            {selectedStep ? (
              <StepEditor
                trigger={flow.trigger}
                steps={flow.steps}
                index={stepIndex}
                disabled={saving}
                onChange={(index, step) => setSteps((steps) => steps.map((candidate, position) => (position === index ? step : candidate)))}
              />
            ) : null}
          </div>
          )}

          <details className="group shrink-0 border-t">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span>
                <span className="block text-body-sm font-semibold">{c("flow.reliability")}</span>
                <span className="block text-caption text-muted-foreground">{c("builder.advancedHint")}</span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="automation-retries-v2">{c("builder.retries")}</Label>
                <Input
                  id="automation-retries-v2"
                  type="number"
                  min={0}
                  max={8}
                  dir="ltr"
                  value={flow.maxRetries}
                  disabled={saving}
                  onChange={(event) => patch({ maxRetries: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="automation-delay-v2">{c("builder.retryDelay")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="automation-delay-v2"
                    type="number"
                    min={100}
                    max={300000}
                    step={100}
                    dir="ltr"
                    value={flow.retryDelayMs}
                    disabled={saving}
                    onChange={(event) => patch({ retryDelayMs: Number(event.target.value) })}
                  />
                  <span className="shrink-0 text-caption text-muted-foreground">{c("builder.retryDelayUnit")}</span>
                </div>
              </div>
              <div className="flex items-start justify-between gap-4 rounded-control border p-3 sm:col-span-2">
                <div>
                  <Label htmlFor="automation-test-v2">{c("builder.testMode")}</Label>
                  <p className="mt-1 text-caption leading-5 text-muted-foreground">{c("builder.testModeHint")}</p>
                </div>
                <Switch id="automation-test-v2" checked={flow.dryRun} disabled={saving} onCheckedChange={(dryRun) => patch({ dryRun })} />
              </div>
            </div>
          </details>
        </aside>
      </div>
    </div>
  );

  function insertStepCopy(index: number, step: BuilderStep) {
    if (flow.steps.length >= 20) return;
    setSteps((steps) => [...steps.slice(0, index), { ...step, config: { ...step.config } }, ...steps.slice(index)]);
    setStepKeys((current) => [...current.slice(0, index), crypto.randomUUID(), ...current.slice(index)]);
    setSelection(`step-${index}`);
  }
}

function actionTitle(action: string, c: ReturnType<typeof useAutomationCopy>): string {
  const spec = getSellerActionSpec(action);
  return spec ? c(spec.copyKey as AutomationWorkspaceCopyKey) : action;
}

function InspectorHeading({ eyebrow, title, hint }: { eyebrow: string; title: string; hint: string }) {
  return (
    <div className="border-b pb-4">
      <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-1 text-title-3 font-semibold">{title}</h2>
      <p className="mt-1 text-body-sm leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

/** "3 to fix" (with the list) or "Ready", so a seller knows why Save is disabled. */
function IssuesStatus({
  issues,
  legacyInvalid,
  onSelect,
}: {
  issues: readonly FlowIssue[];
  legacyInvalid: boolean;
  onSelect: (target: string) => void;
}) {
  const c = useAutomationCopy();
  if (issues.length === 0 && !legacyInvalid) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-2 py-1 text-caption font-medium text-success">
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        <span className="max-sm:sr-only">{c("flow.ready")}</span>
      </span>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-automation-issues={issues.length}
          className="flex shrink-0 items-center gap-1 rounded-full bg-destructive-soft px-2 py-1 text-caption font-medium text-destructive outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AlertCircle className="size-3.5" aria-hidden="true" />
          {c("flow.issues", { count: issues.length + (legacyInvalid ? 1 : 0) })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-1.5">
        <ul>
          {legacyInvalid ? (
            <li className="flex items-start gap-2 rounded-control px-2.5 py-2 text-body-sm">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
              {c("builder.invalidLegacy")}
            </li>
          ) : null}
          {issues.map((issue) => (
            <li key={`${issue.target}-${issue.code}`}>
              <button
                type="button"
                onClick={() => onSelect(issue.target)}
                className="flex w-full items-start gap-2 rounded-control px-2.5 py-2 text-start text-body-sm outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden="true" />
                {c(`flow.issue.${issue.code}`)}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
