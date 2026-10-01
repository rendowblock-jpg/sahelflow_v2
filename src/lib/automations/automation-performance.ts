import "server-only";

/**
 * Per-automation run health over the last 30 days, read from the durable
 * `AutomationRun` ledger (one row per definition-bound execution), never from
 * the legacy `runCount` counter. Success is measured over runs that reached a
 * terminal state; queued or waiting runs are counted but not judged.
 */

export const AUTOMATION_PERFORMANCE_DAYS = 30;
export const AUTOMATION_TREND_DAYS = 14;

const TERMINAL = new Set(["succeeded", "failed", "dead_letter", "ambiguous", "partially_completed"]);
const ATTENTION = new Set(["failed", "dead_letter", "ambiguous", "partially_completed"]);

export interface AutomationPerformance {
  runs: number;
  succeeded: number;
  terminal: number;
  attention: number;
  /** Runs per day, oldest → latest. */
  trend: Array<{ date: string; value: number }>;
}

export interface AutomationRunRow {
  automationId: string;
  status: string;
  createdAt: Date;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function emptyAutomationPerformance(now = new Date(), days = AUTOMATION_TREND_DAYS): AutomationPerformance {
  const trend: Array<{ date: string; value: number }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - offset);
    trend.push({ date: dayKey(day), value: 0 });
  }
  return { runs: 0, succeeded: 0, terminal: 0, attention: 0, trend };
}

function add(target: AutomationPerformance, run: AutomationRunRow) {
  target.runs += 1;
  if (run.status === "succeeded") target.succeeded += 1;
  if (TERMINAL.has(run.status)) target.terminal += 1;
  if (ATTENTION.has(run.status)) target.attention += 1;
  const point = target.trend.find((day) => day.date === dayKey(run.createdAt));
  if (point) point.value += 1;
}

/** Totals for the workspace and one entry per automation that ran. */
export function summarizeAutomationRuns(
  runs: readonly AutomationRunRow[],
  now = new Date(),
): { total: AutomationPerformance; byAutomation: Map<string, AutomationPerformance> } {
  const total = emptyAutomationPerformance(now, AUTOMATION_PERFORMANCE_DAYS);
  const byAutomation = new Map<string, AutomationPerformance>();
  for (const run of runs) {
    add(total, run);
    let entry = byAutomation.get(run.automationId);
    if (!entry) {
      entry = emptyAutomationPerformance(now);
      byAutomation.set(run.automationId, entry);
    }
    add(entry, run);
  }
  return { total, byAutomation };
}

/** Success share of finished runs, or null when nothing has finished. */
export function successRate(performance: Pick<AutomationPerformance, "succeeded" | "terminal">): number | null {
  return performance.terminal > 0 ? Math.round((performance.succeeded / performance.terminal) * 100) : null;
}
