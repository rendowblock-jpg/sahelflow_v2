"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, UserX } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "@/lib/toast";

interface BlacklistedCustomer {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  orderCount: number;
}

interface Props {
  customers: BlacklistedCustomer[];
  canManage?: boolean;
}

export function RiskBlacklistPanel({ customers, canManage = false }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleRemove = async (customerId: string) => {
    if (!canManage) return;
    setRemovingId(customerId);
    try {
      const response = await fetch(`/api/risk/blacklist/${customerId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(t("error.removeFailed"));
      toast.success(t("risk.blacklist.remove"));
      router.refresh();
    } catch {
      toast.error(t("error.removeFromBlacklist"));
    } finally {
      setRemovingId(null);
      setConfirmId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ban className="size-4" aria-hidden="true" />
          {t("risk.blacklist.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("risk.blacklist.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <StateSurface
            icon={UserX}
            title={t("risk.blacklist.empty")}
            tone="neutral"
            size="inline"
          />
        ) : (
          <div className="space-y-2">
            {customers.map((customer) => (
              <div
                key={customer.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {customer.name}
                    </Link>
                    <span className="font-mono text-xs text-muted-foreground">
                      {customer.phone}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("risk.blacklist.orders")}: {customer.orderCount}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmId(customer.id)}
                    disabled={removingId === customer.id}
                  >
                    {t("risk.blacklist.remove")}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {canManage ? (
        <ConfirmDialog
          open={confirmId !== null}
          onOpenChange={(open) => !open && setConfirmId(null)}
          title={t("risk.blacklist.remove")}
          description={t("risk.blacklist.subtitle")}
          onConfirm={() => {
            if (confirmId) void handleRemove(confirmId);
          }}
        />
      ) : null}
    </Card>
  );
}
