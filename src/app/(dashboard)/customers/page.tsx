import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { getRiskConfig } from "@/lib/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Eye, TrendingUp, AlertTriangle, UserCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import type { Customer } from "@/types/domain";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const { t } = await getI18n();
  const customers = await customerService.list({ prisma: db });

  const totalCustomers = customers.length;
  const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const activeCount = customers.filter((c) => c.orderCount > 0).length;
  const atRiskCount = customers.filter((c) => c.riskScore >= 6).length;

  const stats = [
    { label: t("customers.totalCustomers"), value: String(totalCustomers), icon: Users, accentBg: "bg-sky-500/10 dark:bg-sky-500/15", accentIcon: "text-sky-600 dark:text-sky-400" },
    { label: t("customers.totalSpent"), value: formatDZD(totalSpent), icon: TrendingUp, accentBg: "bg-emerald-500/10 dark:bg-emerald-500/15", accentIcon: "text-emerald-600 dark:text-emerald-400" },
    { label: "Clients actifs", value: String(activeCount), icon: UserCheck, accentBg: "bg-violet-500/10 dark:bg-violet-500/15", accentIcon: "text-violet-600 dark:text-violet-400" },
    { label: t("customers.atRisk"), value: String(atRiskCount), icon: AlertTriangle, accentBg: "bg-red-500/10 dark:bg-red-500/15", accentIcon: "text-red-600 dark:text-red-400" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <PageHeader
        title={t("customers.title")}
        description={t("customers.subtitle")}
        actions={<CustomerFormDialog />}
      />

      {/* Stat strip — upgraded with accent icons */}
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

      {/* Customers table — upgraded with shared status/risk configs */}
      <Card className="animate-fade-up" style={{ animationDelay: "240ms" }}>
        <CardHeader>
          <CardTitle className="text-base">{t("customers.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{t("customers.noCustomers")}</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-4">
                {t("customers.noCustomersDesc")}
              </p>
              <CustomerFormDialog />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customers.name")}</TableHead>
                  <TableHead>{t("customers.phone")}</TableHead>
                  <TableHead>{t("customers.location")}</TableHead>
                  <TableHead className="text-right">{t("customers.ordersCount")}</TableHead>
                  <TableHead className="text-right">{t("customers.spent")}</TableHead>
                  <TableHead>{t("customers.risk")}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer: Customer) => {
                  const riskConfig = getRiskConfig(customer.riskScore * 10); // Scale 0-100
                  return (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell className="font-mono text-sm">{customer.phone}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {customer.wilaya ?? "—"}
                        {customer.commune ? ` · ${customer.commune}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {customer.orderCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDZD(customer.totalSpent)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${riskConfig.color} bg-muted/50 border-border`}>
                          {riskConfig.label} · {customer.riskScore}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/customers/${customer.id}`}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">{t("customers.customerDetails")}</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
