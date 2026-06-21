import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { customerService } from "@/lib/data";
import { formatDZD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users, Eye } from "lucide-react";
import Link from "next/link";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import type { Customer } from "@/types/domain";

// Always fetch fresh data (local-first app, no ISR)
export const dynamic = "force-dynamic";

/** Risk level thresholds — low: 0-2, medium: 3-5, high: 6+. */
function getRiskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 6) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export default async function CustomersPage() {
  const { t } = await getI18n();
  const customers = await customerService.list({ prisma: db });

  const riskBadgeVariant: Record<"low" | "medium" | "high", "default" | "secondary" | "destructive" | "outline"> = {
    low: "secondary",
    medium: "outline",
    high: "destructive",
  };

  const riskLabel: Record<"low" | "medium" | "high", string> = {
    low: t("risk.lowRisk"),
    medium: t("risk.mediumRisk"),
    high: t("risk.highRisk"),
  };

  const totalCustomers = customers.length;
  const totalSpent = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const atRiskCount = customers.filter((c) => getRiskLevel(c.riskScore) === "high").length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("customers.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("customers.totalCustomers")}: {totalCustomers} ·{" "}
            {t("customers.totalSpent")}: {formatDZD(totalSpent)}
          </p>
        </div>
        <CustomerFormDialog />
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("customers.totalCustomers")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("customers.totalSpent")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDZD(totalSpent)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("customers.atRisk")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{atRiskCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Customers table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("customers.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
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
                  const level = getRiskLevel(customer.riskScore);
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
                        <Badge variant={riskBadgeVariant[level]}>
                          {riskLabel[level]} · {customer.riskScore}
                        </Badge>
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
