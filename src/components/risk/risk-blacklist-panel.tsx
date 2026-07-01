"use client";

/**
 * Risk blacklist panel — lists blacklisted customers + lets the seller remove them.
 *
 * Add-to-blacklist is done from the customer detail page (future) or the API.
 * This panel focuses on viewing + removing.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Ban, UserX } from "lucide-react";

interface BlacklistedCustomer {
  id: string;
  name: string;
  phone: string;
  notes: string | null;
  orderCount: number;
}

interface Props {
  customers: BlacklistedCustomer[];
}

export function RiskBlacklistPanel({ customers }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleRemove = async (customerId: string) => {
    setRemovingId(customerId);
    try {
      const res = await fetch(`/api/risk/blacklist/${customerId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("error.removeFailed"));
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
    <Card className="animate-fade-up">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Ban className="h-4 w-4" />
          {t("risk.blacklist.title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{t("risk.blacklist.subtitle")}</p>
      </CardHeader>
      <CardContent>
        {customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 p-5 mb-5 ring-1 ring-primary/10">
              <UserX className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-1">{t("risk.blacklist.empty")}</h3>
          </div>
        ) : (
          <div className="space-y-3">
            {customers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{c.phone}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("risk.blacklist.orders")}: <span className="tabular-nums font-medium">{c.orderCount}</span>
                    {c.notes && (
                      <span className="ms-2 truncate">
                        · {c.notes.replace(/\[BLACKLISTED[^\]]*\]/g, "").trim()}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmId(c.id)}
                  disabled={removingId === c.id}
                >
                  {t("risk.blacklist.remove")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(v) => !v && setConfirmId(null)}
        title={t("risk.blacklist.remove")}
        description={t("risk.blacklist.subtitle")}
        onConfirm={() => { if (confirmId) void handleRemove(confirmId); }}
      />
    </Card>
  );
}
