import Link from "next/link";
import { Info, ShieldAlert } from "lucide-react";

import {
  RiskActionBadgeServer,
  RiskLevelBadgeServer,
} from "@/components/risk/risk-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CUSTOMER_SIGNALS_SCALE,
  engineMeterPercent,
  getCustomerSignalsLevel,
  signalsLevelsDisagree,
  signalsMeterPercent,
  type CustomerSignalsLevel,
} from "@/lib/customers/customer-risk-scale";
import { cn } from "@/lib/utils";
import type { RiskAction, RiskAssessment, RiskLevel } from "@/lib/risk-engine/types";

/**
 * Customer risk reconciliation card (R3-c).
 *
 * The customer profile carries TWO risk vocabularies that must never be
 * presented as one number:
 *
 *   - "Order risk engine (0-100)" — the governed engine's READ-ONLY assessment
 *     of the customer's latest order, rendered with the seller's configurable
 *     thresholds exactly like the order-detail risk card (score / 100, level
 *     badge, recommended action).
 *   - "Customer signals score" — the separate ~0-10 `customer.riskScore` index
 *     with its fixed local thresholds (>= 6 high, >= 3 medium).
 *
 * There is deliberately NO conversion between the scales; when the two tiers
 * disagree a subtle note explains the difference instead of inventing an
 * equivalence. Presentational only — no hooks, safe in Server Components.
 */

const ENGINE_FILL: Record<RiskLevel, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-orange-500",
  critical: "bg-destructive",
};

const SIGNALS_FILL: Record<CustomerSignalsLevel, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-destructive",
};

/** Pre-translated labels — the page owns the i18n authority (runtime dict). */
export interface CustomerRiskCardLabels {
  title: string;
  engineLabel: string;
  engineScaleHint: string;
  engineLatestOrder: string;
  engineNoOrders: string;
  engineUnavailable: string;
  engineActionCaption: string;
  engineMeterAria: (score: number) => string;
  engineLevelLabel: (level: RiskLevel) => string;
  engineActionLabel: (action: RiskAction) => string;
  signalsLabel: string;
  signalsScaleHint: string;
  signalsNoScore: string;
  signalsMeterAria: (score: number) => string;
  signalsLevelLabel: (level: CustomerSignalsLevel) => string;
  disagreeNote: string;
}

export interface CustomerRiskCardProps {
  labels: CustomerRiskCardLabels;
  /** Whether the actor may read the engine's verdict (risk.read authority). */
  showEngine: boolean;
  /** Latest-order assessment from the engine (read-only), when available. */
  engineAssessment: RiskAssessment | null;
  /** The order the engine verdict was computed on, for the source link. */
  engineOrder: { id: string; orderNumber: string } | null;
  /** Engine thresholds (low/medium/high, 0-100) for the meter boundaries. */
  engineThresholds: { low: number; medium: number; high: number } | null;
  /** Raw customer.riskScore (separate ~0-10 index). */
  signalsScore: number | null;
}

export function CustomerRiskCard({
  labels,
  showEngine,
  engineAssessment,
  engineOrder,
  engineThresholds,
  signalsScore,
}: CustomerRiskCardProps) {
  const signalsLevel =
    signalsScore === null ? null : getCustomerSignalsLevel(signalsScore);
  const disagree =
    engineAssessment !== null &&
    signalsLevel !== null &&
    signalsLevelsDisagree(engineAssessment.level, signalsLevel);

  return (
    <Card data-customer-risk-reconciliation="dual-scale">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="size-4" aria-hidden="true" />
          {labels.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scale 1 — the governed order risk engine (0-100), latest-order verdict. */}
        {showEngine ? (
          <section
            data-customer-risk-engine="0-100"
            className="space-y-2"
            aria-label={labels.engineLabel}
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {labels.engineLabel}
            </p>
            {engineAssessment ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold tabular-nums">
                      {engineAssessment.score}
                    </span>
                    <span className="text-sm text-muted-foreground">/ 100</span>
                    <RiskLevelBadgeServer
                      level={engineAssessment.level}
                      label={labels.engineLevelLabel(engineAssessment.level)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {labels.engineActionCaption}
                    </span>
                    <RiskActionBadgeServer
                      action={engineAssessment.action}
                      label={labels.engineActionLabel(engineAssessment.action)}
                    />
                  </div>
                </div>
                <RiskMeter
                  percent={engineMeterPercent(engineAssessment.score)}
                  fillClass={ENGINE_FILL[engineAssessment.level]}
                  ticks={
                    engineThresholds
                      ? [
                          engineThresholds.low,
                          engineThresholds.medium,
                          engineThresholds.high,
                        ]
                      : []
                  }
                  ariaLabel={labels.engineMeterAria(engineAssessment.score)}
                />
                <p className="text-xs text-muted-foreground">
                  {engineOrder ? (
                    <>
                      {labels.engineLatestOrder}{" "}
                      <Link
                        href={`/orders/${engineOrder.id}`}
                        className="font-mono text-primary hover:underline"
                      >
                        {engineOrder.orderNumber}
                      </Link>
                    </>
                  ) : null}
                  {engineThresholds ? ` · ${labels.engineScaleHint}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {engineOrder ? labels.engineUnavailable : labels.engineNoOrders}
              </p>
            )}
          </section>
        ) : null}

        {showEngine ? <Separator /> : null}

        {/* Scale 2 — the separate customer signals index (~0-10). */}
        <section
          data-customer-risk-signals="0-10"
          className="space-y-2"
          aria-label={labels.signalsLabel}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {labels.signalsLabel}
          </p>
          {signalsScore === null || signalsLevel === null ? (
            <p className="text-sm text-muted-foreground">{labels.signalsNoScore}</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {signalsScore}
                </span>
                <span className="text-sm text-muted-foreground">
                  / {CUSTOMER_SIGNALS_SCALE.max}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
                    signalsLevel === "high" &&
                      "border-destructive/25 bg-destructive/10 text-destructive",
                    signalsLevel === "medium" &&
                      "border-warning/25 bg-warning/10 text-warning",
                    signalsLevel === "low" &&
                      "border-success/25 bg-success/10 text-success",
                  )}
                >
                  <span className="size-1.5 rounded-full bg-current opacity-70" />
                  {labels.signalsLevelLabel(signalsLevel)}
                </span>
              </div>
              <RiskMeter
                percent={signalsMeterPercent(signalsScore)}
                fillClass={SIGNALS_FILL[signalsLevel]}
                ticks={[
                  CUSTOMER_SIGNALS_SCALE.mediumThreshold * 10,
                  CUSTOMER_SIGNALS_SCALE.highThreshold * 10,
                ]}
                ariaLabel={labels.signalsMeterAria(signalsScore)}
              />
              <p className="text-xs text-muted-foreground">
                {labels.signalsScaleHint}
              </p>
            </>
          )}
        </section>

        {disagree ? (
          <p
            data-customer-risk-disagree="true"
            className="flex items-start gap-1.5 text-xs text-muted-foreground"
          >
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {labels.disagreeNote}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** A slim labeled meter with threshold boundary ticks (logical RTL geometry). */
function RiskMeter({
  percent,
  fillClass,
  ticks,
  ariaLabel,
}: {
  percent: number;
  fillClass: string;
  ticks: number[];
  ariaLabel: string;
}) {
  return (
    <div
      className="relative h-2 w-full rounded-full bg-muted"
      role="img"
      aria-label={ariaLabel}
    >
      <div
        className={cn("h-full rounded-full", fillClass)}
        style={{ width: `${percent}%` }}
      />
      {ticks.map((tick) => {
        const clamped = Math.max(0, Math.min(100, tick));
        return (
          <span
            key={tick}
            className="absolute inset-y-0 w-px bg-border"
            style={{ insetInlineStart: `calc(${clamped}% - 0.5px)` }}
            title={String(tick)}
          />
        );
      })}
    </div>
  );
}
