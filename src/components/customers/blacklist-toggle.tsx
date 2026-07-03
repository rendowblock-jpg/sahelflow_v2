"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/hooks/use-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface BlacklistToggleProps {
  customerId: string;
  isBlacklisted: boolean;
  /** "icon" = small icon button for row actions; "button" = full button for detail page */
  variant?: "icon" | "button";
}

/**
 * Client-side blacklist toggle.
 *
 * - When NOT blacklisted: opens a dialog with an optional reason, then POSTs to
 *   /api/risk/blacklist.
 * - When blacklisted: opens a confirmation, then DELETEs
 *   /api/risk/blacklist/[customerId].
 *
 * After a successful toggle it calls router.refresh() so the server component
 * re-renders with the updated isBlacklisted column.
 */
export function BlacklistToggle({
  customerId,
  isBlacklisted,
  variant = "button",
}: BlacklistToggleProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [addOpen, setAddOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirmAdd() {
    setSaving(true);
    try {
      const res = await fetch("/api/risk/blacklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      toast.success(t("risk.blacklist.add"));
      setAddOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/risk/blacklist/${customerId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      toast.success(t("risk.blacklist.remove"));
      setRemoveOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  }

  if (isBlacklisted) {
    return (
      <>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setRemoveOpen(true)}
            title={t("risk.blacklist.remove")}
            className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
          >
            <ShieldCheck className="h-4 w-4" />
            <span className="sr-only">{t("risk.blacklist.remove")}</span>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRemoveOpen(true)}
          >
            <ShieldCheck className="me-1.5 h-4 w-4" />
            {t("risk.blacklist.remove")}
          </Button>
        )}

        <AlertDialog open={removeOpen} onOpenChange={(o) => { if (!saving) setRemoveOpen(o); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("risk.blacklist.remove")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("risk.blacklist.subtitle")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void confirmRemove(); }}
                disabled={saving}
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("risk.blacklist.remove")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setAddOpen(true)}
          title={t("risk.blacklist.add")}
          className="text-red-600 hover:text-red-700 dark:text-red-400"
        >
          <Ban className="h-4 w-4" />
          <span className="sr-only">{t("risk.blacklist.add")}</span>
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddOpen(true)}
          className="text-red-600 hover:text-red-700 dark:text-red-400"
        >
          <Ban className="me-1.5 h-4 w-4" />
          {t("risk.blacklist.add")}
        </Button>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => { if (!saving) setAddOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("risk.blacklist.add")}</DialogTitle>
            <DialogDescription>{t("risk.blacklist.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="blacklist-reason">{t("risk.blacklist.addReason")}</Label>
            <Textarea
              id="blacklist-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("risk.blacklist.reason")}
              rows={3}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void confirmAdd()} disabled={saving}>
              {saving && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
              {t("risk.blacklist.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
