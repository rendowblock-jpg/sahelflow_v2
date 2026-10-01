import { describe, expect, it } from "vitest";

import {
  emptyAutomationPerformance,
  successRate,
  summarizeAutomationRuns,
} from "@/lib/automations/automation-performance";

import { flowIssues, flowPayload, type FlowDraft } from "../flow-model";
import { AUTOMATION_TEMPLATES, findAutomationTemplate } from "../flow-templates";

function draftFrom(templateKey: string, locale: "en" | "fr" | "ar"): FlowDraft {
  const template = findAutomationTemplate(templateKey);
  if (!template) throw new Error(`missing template ${templateKey}`);
  const preset = template.build(locale);
  return {
    name: preset.name,
    trigger: preset.trigger,
    conditions: preset.conditions ?? null,
    steps: preset.steps,
    dryRun: false,
    maxRetries: 2,
    retryDelayMs: 500,
  };
}

describe("automation flow templates", () => {
  it("every template is a saveable flow in every locale", () => {
    for (const template of AUTOMATION_TEMPLATES) {
      for (const locale of ["en", "fr", "ar"] as const) {
        expect(flowIssues(draftFrom(template.key, locale)), `${template.key}/${locale}`).toEqual([]);
      }
    }
  });

  it("keys are unique and resolvable", () => {
    const keys = AUTOMATION_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(findAutomationTemplate("nope")).toBeUndefined();
  });
});

describe("flow validation", () => {
  it("points each problem at the block that owns it", () => {
    const flow = draftFrom("confirm-reminder", "en");
    const broken: FlowDraft = {
      ...flow,
      name: "  ",
      steps: flow.steps.map((step, index) =>
        index === 0 ? { ...step, config: { messageTemplate: "Hi {{unknownVar}}" } } : step,
      ),
      maxRetries: 9,
    };
    expect(flowIssues(broken)).toEqual([
      { target: "name", code: "nameRequired" },
      { target: "step-0", code: "stepIncompatible" },
      { target: "settings", code: "retriesOutOfRange" },
    ]);
  });

  it("builds the exact API payload from the first step and conditions", () => {
    const payload = flowPayload(draftFrom("high-value", "en"), true);
    expect(payload.action).toBe("tag_customer");
    expect(payload.isActive).toBe(true);
    expect(payload.conditions).toEqual({ all: [{ field: "totalPrice", operator: "greater_than", value: 7000 }] });
    expect(payload.steps).toHaveLength(1);
  });
});

describe("automation run health", () => {
  it("summarizes runs per automation and judges success only on finished runs", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const day = (offset: number) => new Date(now.getTime() - offset * 86_400_000);
    const { total, byAutomation } = summarizeAutomationRuns(
      [
        { automationId: "a", status: "succeeded", createdAt: day(0) },
        { automationId: "a", status: "failed", createdAt: day(1) },
        { automationId: "a", status: "waiting", createdAt: day(1) },
        { automationId: "b", status: "succeeded", createdAt: day(20) },
      ],
      now,
    );
    expect(total.runs).toBe(4);
    expect(total.attention).toBe(1);
    expect(successRate(total)).toBe(67);
    const a = byAutomation.get("a") ?? emptyAutomationPerformance(now);
    expect(a.runs).toBe(3);
    expect(successRate(a)).toBe(50);
    expect(a.trend.at(-1)?.value).toBe(1);
    expect(a.trend.at(-2)?.value).toBe(2);
    expect(successRate(emptyAutomationPerformance(now))).toBeNull();
  });
});
