import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RotateCcw,
  Package,
  User,
  FileText,
  Clock,
  Tag,
} from "lucide-react";

import { getI18n } from "@/lib/i18n-server";
import { db } from "@/lib/db";
import { formatDZD, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { StatCard } from "@/components/shared/stat-card";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.returns") };
}

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

const RETURN_STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  requested: { bg: "bg-amber-500/10", text: "text-warning", border: "border-amber-500/20", dot: "bg-warning" },
  approved: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20", dot: "bg-blue-500" },
  processed: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", border: "border-violet-500/20", dot: "bg-violet-500" },
  completed: { bg: "bg-emerald-500/10", text: "text-success", border: "border-emerald-500/20", dot: "bg-success" },
  refused: { bg: "bg-red-500/10", text: "text-destructive", border: "border-red-500/20", dot: "bg-destructive" },
};

export default async function ReturnDetailPage({ params }: PageProps) {
  const { t, locale } = await getI18n();
  const { id } = await params;

  // Session 30 (AUDIT-1 P2): use findFirst with deletedAt:null filter.
  // Previously: db.return.findUnique bypassed the soft-delete filter →
  // soft-deleted returns leaked via stale URLs.
  const ret = await db.return.findFirst({
    where: { id, deletedAt: null },
    include: {
      order: {
        include: {
          customer: { select: { id: true, name: true, phone: true, wilaya: true, commune: true } },
          items: true,
        },
      },
      notes_rel: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!ret) notFound();

  const statusStyle = RETURN_STATUS_STYLES[ret.status] ?? {
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
    dot: "bg-muted-foreground",
  };
  const orderStatus = ret.order.status;
  const orderStyle = orderStatusStyles[orderStatus as keyof typeof orderStatusStyles];

  return (
    <div className="app-content page-sections">
      <Breadcrumbs
        items={[
          { label: t("nav.returns"), href: "/returns" },
          { label: ret.order.orderNumber },
        ]}
        className="mb-4"
      />

      <PageHeader
        title={`${t("returns.title")}: ${ret.order.orderNumber}`}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(ret.createdAt, locale)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              {ret.type}
            </span>
          </span>
        }
        actions={
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
            <span className={`size-1.5 rounded-full ${statusStyle.dot}`} />
            {t(`returns.status.${ret.status}` as string) || ret.status}
          </span>
        }
      />

      {/* Stat cards */}
      <div className="card-grid-3 stagger-grid">
        <StatCard
          label={t("returns.type")}
          value={ret.type}
          icon={<Tag />}
          accentBg="bg-teal-500/10 dark:bg-teal-500/15"
          accentIcon="text-teal-600 dark:text-teal-400"
          style={{ animationDelay: "60ms" }}
        />
        <StatCard
          label={t("orders.total")}
          value={formatDZD(ret.order.totalPrice)}
          icon={<Package />}
          accentBg="bg-violet-500/10 dark:bg-violet-500/15"
          accentIcon="text-violet-600 dark:text-violet-400"
          style={{ animationDelay: "120ms" }}
        />
        <StatCard
          label={t("returns.status")}
          value={t(`returns.status.${ret.status}` as string) || ret.status}
          icon={<RotateCcw />}
          accentBg="bg-amber-500/10 dark:bg-amber-500/15"
          accentIcon="text-warning"
          style={{ animationDelay: "180ms" }}
        />
      </div>

      {/* Reason + Order/Customer info */}
      <div className="card-grid-2">
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              {t("returns.reason")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{ret.reason}</p>
            {ret.notes && (
              <div className="mt-4 border-t pt-3">
                <p className="text-xs text-muted-foreground mb-1">{t("publicForm.notes")}</p>
                <p className="text-sm whitespace-pre-wrap">{ret.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              {t("returns.customerAndOrder")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("customers.name")}</span>
              <Link href={`/customers/${ret.order.customer.id}`} className="text-sm font-medium hover:underline">
                {ret.order.customer.name}
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("customers.phone")}</span>
              <span className="font-mono text-sm">{ret.order.customer.phone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("orders.orderNumber")}</span>
              <Link href={`/orders/${ret.order.id}`} className="font-mono text-sm font-medium hover:underline">
                {ret.order.orderNumber}
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("orders.status")}</span>
              {orderStyle ? (
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${orderStyle.bg} ${orderStyle.text} ${orderStyle.border}`}>
                  <span className={`size-1.5 rounded-full ${orderStyle.dot}`} />
                  {t(orderStyle.i18nKey)}
                </span>
              ) : (
                <Badge variant="outline">{t(statusI18nKey(orderStatus))}</Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t("orders.total")}</span>
              <span className="text-sm font-semibold tabular-nums">{formatDZD(ret.order.totalPrice)}</span>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${ret.order.id}`}>
                  {t("orders.viewDetails") || t("common.viewAll")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity timeline (return notes) */}
      {ret.notes_rel.length > 0 && (
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="text-base">{t("returns.activityTimeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ret.notes_rel.map((note) => (
                <div key={note.id} className="flex gap-3 border-l-2 border-border ps-3">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{formatDate(note.createdAt, locale)}</p>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap">{note.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
