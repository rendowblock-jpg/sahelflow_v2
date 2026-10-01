import Link from "next/link";
import { ArrowRight, MapPin, Package, PhoneCall, Radio, ShieldCheck, UserX } from "lucide-react";

import { RiskLevelBadgeServer } from "@/components/risk/risk-badges";
import type { RiskAnalyticsReport } from "@/lib/risk-engine/analytics";
import type { OutcomeGroup } from "@/lib/risk-engine/seller-insights";
import type { RiskLevel } from "@/lib/risk-engine";
import { cn } from "@/lib/utils";

type Copy = (key: string, params?: Record<string, string | number>) => string;
type Format = {
  t: (key: string) => string;
  pct: (value: number) => string;
  dzd: (value: number) => string;
  int: (value: number) => string;
  /** One decimal, locale-aware ("3,2" in French). */
  dec: (value: number) => string;
};

const LEVEL_BAR: Record<RiskLevel, string> = {
  low: "bg-success",
  medium: "bg-warning",
  high: "bg-[var(--status-returned)]",
  critical: "bg-destructive",
};

function SectionCard({
  icon,
  title,
  hint,
  action,
  children,
  className,
  ...rest
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
} & Record<`data-${string}`, string>) {
  return (
    <section className={cn("rounded-surface border bg-card", className)} {...rest}>
      <header className="flex items-start gap-3 border-b px-4 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-body font-semibold leading-6">{title}</h2>
          {hint ? <p className="text-caption leading-5 text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Open orders the score flags: the seller's first job of the day. */
export function CheckBeforeShipping({
  report,
  copy,
  format,
}: {
  report: RiskAnalyticsReport;
  copy: Copy;
  format: Format;
}) {
  const rest = report.openRiskyCount - report.openRisky.length;
  return (
    <SectionCard
      icon={<PhoneCall />}
      title={copy("checkTitle")}
      hint={copy("checkHint")}
      data-risk-check-queue="true"
      action={
        report.openRiskyCount > 0 ? (
          <span className="rounded-full bg-destructive-soft px-2.5 py-0.5 text-caption font-semibold tabular-nums text-destructive">
            {format.int(report.openRiskyCount)}
          </span>
        ) : null
      }
    >
      {report.openRisky.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-8 text-body-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
          {copy("checkEmpty")}
        </p>
      ) : (
        <ul className="divide-y">
          {report.openRisky.map((order) => (
            <li key={order.orderId}>
              <Link
                href={`/orders/${encodeURIComponent(order.orderId)}`}
                className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-caption font-semibold" dir="ltr">{order.orderNumber}</span>
                    <span dir="auto" className="truncate text-body-sm font-medium">{order.customerName ?? "—"}</span>
                    <RiskLevelBadgeServer level={order.level} label={format.t(`risk.level.${order.level}`)} />
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden="true" />
                      {order.wilaya}
                    </span>
                    <span className="tabular-nums">{format.dzd(order.totalPrice)}</span>
                    {order.reasons.length ? <span className="truncate">{order.reasons.map((reason) => format.t(reason)).join(" · ")}</span> : null}
                  </p>
                </div>
                <span className="shrink-0 text-title-3 font-semibold tabular-nums text-muted-foreground">{order.score}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground icon-rtl-flip" aria-hidden="true" />
              </Link>
            </li>
          ))}
          {rest > 0 ? (
            <li className="px-4 py-2.5 text-caption font-medium text-muted-foreground">{copy("checkMore", { count: format.int(rest) })}</li>
          ) : null}
        </ul>
      )}
    </SectionCard>
  );
}

/** Whether higher risk levels really came back more often — the score's honesty check. */
export function ScoreCheck({ report, copy, format }: { report: RiskAnalyticsReport; copy: Copy; format: Format }) {
  const { byLevel, lift } = report.insights.scoreCheck;
  const max = Math.max(0.0001, ...byLevel.map((row) => row.returnRate));
  const outcomes = report.insights.outcomes;
  return (
    <SectionCard icon={<ShieldCheck />} title={copy("scoreTitle")} hint={copy("scoreHint")} data-risk-score-check="true">
      <div className="space-y-3 px-4 py-4">
        {byLevel.map((row) => (
          <div key={row.level} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3">
            <span className="text-body-sm font-medium">{format.t(`risk.level.${row.level}`)}</span>
            <span className="relative h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className={cn("absolute inset-y-0 start-0 rounded-full transition-[width] duration-500", LEVEL_BAR[row.level])}
                style={{ width: `${row.completed ? Math.max(3, (row.returnRate / max) * 100) : 0}%` }}
              />
            </span>
            <span className="text-end text-body-sm font-semibold tabular-nums">
              {row.completed ? format.pct(row.returnRate) : "—"}
            </span>
            <span className="col-start-2 -mt-2 text-caption text-muted-foreground">{copy("finished", { count: format.int(row.completed) })}</span>
          </div>
        ))}
        <p className={cn("rounded-control px-3 py-2.5 text-body-sm leading-5", lift !== null && lift > 1 ? "bg-success-subtle" : "bg-muted/50 text-muted-foreground")}>
          {lift !== null ? copy("scoreLift", { lift: format.dec(lift) }) : copy("scoreEarly")}
        </p>
        <div className="rounded-control border border-dashed px-3 py-2.5">
          <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">{copy("preventTitle")}</p>
          <p className="mt-1 text-body-sm leading-5">
            {outcomes.preventableReturns > 0
              ? copy("preventBody", { amount: format.dzd(outcomes.preventableLossDzd), count: format.int(outcomes.preventableReturns) })
              : copy("preventNone")}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function LossTable({
  title,
  icon,
  column,
  rows,
  copy,
  format,
  labelOf,
}: {
  title: string;
  icon: React.ReactNode;
  column: string;
  rows: OutcomeGroup[];
  copy: Copy;
  format: Format;
  labelOf?: (row: OutcomeGroup) => string;
}) {
  return (
    <SectionCard icon={icon} title={title}>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">{copy("lossEmpty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="border-b text-caption text-muted-foreground">
                <th className="px-4 py-2 text-start font-medium">{column}</th>
                <th className="px-2 py-2 text-end font-medium">{copy("colFinished")}</th>
                <th className="px-2 py-2 text-end font-medium">{copy("colReturnRate")}</th>
                <th className="px-4 py-2 text-end font-medium">{copy("colLost")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="max-w-0 px-4 py-2.5">
                    <span dir="auto" className="block truncate font-medium">{labelOf ? labelOf(row) : row.label}</span>
                    {row.early ? <span className="text-caption text-muted-foreground">{copy("early")}</span> : null}
                  </td>
                  <td className="px-2 py-2.5 text-end tabular-nums text-muted-foreground">{format.int(row.completed)}</td>
                  <td className="px-2 py-2.5 text-end">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                        <span className="block h-full rounded-full bg-destructive/70" style={{ width: `${Math.round(row.returnRate * 100)}%` }} />
                      </span>
                      <span className="font-semibold tabular-nums">{format.pct(row.returnRate)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-end font-semibold tabular-nums">{format.dzd(row.lostDzd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/** Where returns cost money: places, products, channels, people, and the signs that warned. */
export function WhereYouLoseMoney({
  report,
  copy,
  format,
  sourceLabel,
}: {
  report: RiskAnalyticsReport;
  copy: Copy;
  format: Format;
  sourceLabel: (source: string) => string;
}) {
  const insights = report.insights;
  return (
    <div className="space-y-4" data-risk-loss-analysis="true">
      <div className="grid gap-4 xl:grid-cols-2">
        <LossTable title={copy("lossWilaya")} icon={<MapPin />} column={copy("colPlace")} rows={insights.lossByWilaya} copy={copy} format={format} />
        <LossTable title={copy("lossProduct")} icon={<Package />} column={copy("colProduct")} rows={insights.lossByProduct} copy={copy} format={format} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <LossTable
          title={copy("lossSource")}
          icon={<Radio />}
          column={copy("colChannel")}
          rows={insights.lossBySource}
          copy={copy}
          format={format}
          labelOf={(row) => sourceLabel(row.key)}
        />
        <SectionCard icon={<UserX />} title={copy("repeatTitle")} hint={copy("repeatHint")} data-risk-repeat-refusers="true">
          {insights.repeatRefusers.length === 0 ? (
            <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">{copy("repeatEmpty")}</p>
          ) : (
            <ul className="divide-y">
              {insights.repeatRefusers.map((customer) => (
                <li key={customer.customerId} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="truncate text-body-sm font-medium">{customer.name ?? "—"}</p>
                    <p className="text-caption text-muted-foreground">
                      {copy("colCameBack")}: <span className="font-semibold tabular-nums text-foreground">{format.int(customer.cameBack)}</span>
                      {" · "}
                      {copy("colLost")}: <span className="font-semibold tabular-nums text-foreground">{format.dzd(customer.lostDzd)}</span>
                    </p>
                  </div>
                  {customer.isBlacklisted ? (
                    <span className="shrink-0 rounded-full bg-destructive-soft px-2 py-0.5 text-caption font-medium text-destructive">{copy("blacklisted")}</span>
                  ) : (
                    <Link
                      href={`/customers/${encodeURIComponent(customer.customerId)}`}
                      className="shrink-0 rounded-control border px-2.5 py-1 text-caption font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {copy("review")}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <SectionCard icon={<ShieldCheck />} title={copy("signsTitle")} hint={copy("signsHint")} data-risk-warning-signs="true">
        {insights.warningSigns.length === 0 ? (
          <p className="px-4 py-8 text-center text-body-sm text-muted-foreground">{copy("signsEmpty")}</p>
        ) : (
          <ul className="grid gap-px bg-border sm:grid-cols-2">
            {insights.warningSigns.map((sign) => (
              <li key={sign.factorId} className="flex items-center gap-3 bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium">{format.t(sign.labelKey)}</p>
                  <p className="text-caption text-muted-foreground">
                    {copy("finished", { count: format.int(sign.completed) })} · {copy("colReturnRate")} {format.pct(sign.returnRate)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold tabular-nums",
                    sign.lift >= 1.5 ? "bg-destructive-soft text-destructive" : sign.lift > 1 ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground",
                  )}
                >
                  {copy("signLift", { lift: format.dec(sign.lift) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
