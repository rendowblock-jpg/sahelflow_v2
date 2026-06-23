import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RotateCcw, CheckCircle2, Clock, ArrowLeftRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Retours — SahelFlow" };
export const dynamic = "force-dynamic";

/** i18n-driven return status styles */
const RETURN_STATUS_STYLES: Record<string, { i18nKey: string; dot: string; bg: string; text: string; border: string }> = {
  requested: { i18nKey: "returns.status.requested", dot: "bg-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/50" },
  approved: { i18nKey: "returns.status.approved", dot: "bg-sky-500", bg: "bg-sky-50 dark:bg-sky-950/40", text: "text-sky-700 dark:text-sky-400", border: "border-sky-200 dark:border-sky-800/50" },
  rejected: { i18nKey: "returns.status.rejected", dot: "bg-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", border: "border-red-200 dark:border-red-800/50" },
  completed: { i18nKey: "returns.status.completed", dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/50" },
};

const TYPE_I18N: Record<string, string> = {
  return: "returns.type.return",
  exchange: "returns.type.exchange",
};

export default async function ReturnsPage() {
  const { t, locale } = await getI18n();

  const returns = await db.return.findMany({
    include: { order: { include: { customer: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const requestedCount = returns.filter((r) => r.status === "requested").length;
  const completedCount = returns.filter((r) => r.status === "completed").length;
  const exchangeCount = returns.filter((r) => r.type === "exchange").length;

  const stats = [
    { label: t("returns.totalReturns"), value: String(returns.length), icon: RotateCcw, accentBg: "bg-sky-500/10 dark:bg-sky-500/15", accentIcon: "text-sky-600 dark:text-sky-400" },
    { label: t("returns.waiting"), value: String(requestedCount), icon: Clock, accentBg: "bg-amber-500/10 dark:bg-amber-500/15", accentIcon: "text-amber-600 dark:text-amber-400" },
    { label: t("returns.completed"), value: String(completedCount), icon: CheckCircle2, accentBg: "bg-emerald-500/10 dark:bg-emerald-500/15", accentIcon: "text-emerald-600 dark:text-emerald-400" },
    { label: t("returns.exchanges"), value: String(exchangeCount), icon: ArrowLeftRight, accentBg: "bg-violet-500/10 dark:bg-violet-500/15", accentIcon: "text-violet-600 dark:text-violet-400" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav.returns")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("returns.subtitle")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="card-hover animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.label}
                </CardTitle>
                <div className={`flex size-8 items-center justify-center rounded-lg ${stat.accentBg}`}>
                  <Icon className={`h-4 w-4 ${stat.accentIcon}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="text-base">{t("returns.history")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <RotateCcw className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{t("returns.noReturns")}</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {t("returns.willAppear")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <th className="px-4 py-3">{t("returns.table.order")}</th>
                    <th className="px-4 py-3">{t("returns.table.customer")}</th>
                    <th className="px-4 py-3">{t("returns.table.type")}</th>
                    <th className="px-4 py-3 hidden md:table-cell">{t("returns.table.reason")}</th>
                    <th className="px-4 py-3">{t("returns.table.status")}</th>
                    <th className="px-4 py-3 hidden lg:table-cell">{t("returns.table.date")}</th>
                    <th className="px-4 py-3 text-right">{t("returns.table.action")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {returns.map((ret) => {
                    const statusStyle = RETURN_STATUS_STYLES[ret.status];
                    return (
                      <tr key={ret.id} className="hover:bg-accent/50 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/orders/${ret.orderId}`}
                            className="font-mono text-sm font-medium text-primary hover:underline"
                          >
                            {ret.order.orderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {ret.order.customer?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{t(TYPE_I18N[ret.type] ?? ret.type)}</Badge>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                          {ret.reason}
                        </td>
                        <td className="px-4 py-3">
                          {statusStyle ? (
                            <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                              <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
                              {t(statusStyle.i18nKey)}
                            </span>
                          ) : (
                            <Badge variant="outline">{ret.status}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                          {formatDate(ret.createdAt, locale)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/orders/${ret.orderId}`}>
                              {t("returns.view")}
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
