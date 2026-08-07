import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, FileText, Package, RotateCcw, Tag, User } from "lucide-react";

import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n-server";
import {
  assertTrustedAction,
  requireTrustedAction,
} from "@/lib/identity/authorization";
import { orderStatusStyles } from "@/lib/shared";
import { statusI18nKey } from "@/lib/shared/status-colors";
import { formatDZD, formatDate } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t("metadata.title.returns") };
}

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }> };

const RETURN_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  requested: "secondary",
  approved: "default",
  processed: "default",
  completed: "default",
  refused: "destructive",
  rejected: "destructive",
};

export default async function ReturnDetailPage({ params }: PageProps) {
  const actorContext = await requireTrustedAction("orders.read");
  assertTrustedAction(actorContext, "customers.contact.read");
  assertTrustedAction(actorContext, "orders.financials.read");
  const { t, locale } = await getI18n();
  const { id } = await params;

  const ret = await db.return.findFirst({
    where: { id, deletedAt: null },
    include: {
      order: {
        include: {
          customer: { select: { id: true, name: true, phone: true, wilaya: true, commune: true } },
          items: true,
        },
      },
      notes_rel: { orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
    },
  });
  if (!ret) notFound();

  const orderStatus = ret.order.status;
  const orderStyle = orderStatusStyles[orderStatus as keyof typeof orderStatusStyles];

  return (
    <div className="app-content page-sections">
      <Breadcrumbs
        items={[
          { label: t("nav.returns"), href: "/returns" },
          { label: ret.order.orderNumber },
        ]}
      />

      <PageHeader
        title={`${t("returns.title")}: ${ret.order.orderNumber}`}
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatDate(ret.createdAt, locale)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Tag className="size-3.5" aria-hidden="true" />
              {t(`returns.type.${ret.type}`)}
            </span>
          </span>
        }
        actions={
          <Badge variant={RETURN_STATUS_VARIANT[ret.status] ?? "outline"}>
            {t(`returns.status.${ret.status}`)}
          </Badge>
        }
      />

      <div className="card-grid-3">
        <StatCard label={t("returns.type")} value={t(`returns.type.${ret.type}`)} icon={<Tag />} />
        <StatCard label={t("orders.total")} value={formatDZD(ret.order.totalPrice, locale)} icon={<Package />} />
        <StatCard label={t("returns.status")} value={t(`returns.status.${ret.status}`)} icon={<RotateCcw />} />
      </div>

      <div className="card-grid-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" aria-hidden="true" />
              {t("returns.reason")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{ret.reason}</p>
            {ret.notes ? (
              <div className="mt-4 border-t pt-3">
                <p className="mb-1 text-xs text-muted-foreground">{t("publicForm.notes")}</p>
                <p className="whitespace-pre-wrap text-sm">{ret.notes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="size-4" aria-hidden="true" />
              {t("returns.customerAndOrder")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("customers.name")}</span>
              <Link href={`/customers/${ret.order.customer.id}`} className="text-sm font-medium text-primary hover:underline">
                {ret.order.customer.name}
              </Link>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("customers.phone")}</span>
              <span className="font-mono text-sm" dir="ltr">{ret.order.customer.phone}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("orders.orderNumber")}</span>
              <Link href={`/orders/${ret.order.id}`} className="font-mono text-sm font-medium text-primary hover:underline">
                {ret.order.orderNumber}
              </Link>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("orders.status")}</span>
              {orderStyle ? (
                <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${orderStyle.bg} ${orderStyle.text} ${orderStyle.border}`}>
                  <span className={`size-1.5 rounded-full ${orderStyle.dot}`} aria-hidden="true" />
                  {t(orderStyle.i18nKey)}
                </span>
              ) : (
                <Badge variant="outline">{t(statusI18nKey(orderStatus))}</Badge>
              )}
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("orders.total")}</span>
              <span className="text-sm font-semibold tabular-nums">{formatDZD(ret.order.totalPrice, locale)}</span>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${ret.order.id}`}>{t("orders.viewDetails")}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {ret.notes_rel.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("returns.activityTimeline")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ret.notes_rel.map((note) => (
                <div key={note.id} className="flex gap-3 border-s-2 border-border ps-3">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{formatDate(note.createdAt, locale)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{note.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
