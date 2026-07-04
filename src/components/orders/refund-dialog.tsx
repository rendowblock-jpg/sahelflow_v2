"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DollarSign, Loader2 } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { useApiMutation } from "@/hooks/use-api-mutation";
import { mutatePrefix } from "@/lib/swr/mutate";
import { formatDZD } from "@/lib/utils";

interface RefundDialogProps {
  orderId: string;
  orderNumber: string;
  maxAmount: number;
  /** Already-refunded total (to show remaining). */
  alreadyRefunded?: number;
}

export function RefundDialog({ orderId, orderNumber, maxAmount, alreadyRefunded = 0 }: RefundDialogProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(maxAmount - alreadyRefunded));
  const [method, setMethod] = useState("cash");
  const [reason, setReason] = useState("");

  const mutation = useApiMutation({
    successMessage: t("orders.refund.created") || "Refund created",
    onSuccess: async () => {
      await mutatePrefix("/api/orders");
      setOpen(false);
      setAmount(String(maxAmount - alreadyRefunded));
      setReason("");
    },
  });

  const refundAmount = parseInt(amount) || 0;
  const remaining = maxAmount - alreadyRefunded;
  const isValid = refundAmount > 0 && refundAmount <= remaining;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <DollarSign className="h-4 w-4 me-1.5" />
          {t("orders.refund.create") || "Refund"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            {t("orders.refund.title") || "Create Refund"} — {orderNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order total</span>
              <span className="font-medium">{formatDZD(maxAmount)}</span>
            </div>
            {alreadyRefunded > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already refunded</span>
                <span className="font-medium text-amber-600">{formatDZD(alreadyRefunded)}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-1">
              <span className="text-muted-foreground">Refundable remaining</span>
              <span className="font-bold">{formatDZD(remaining)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("orders.refund.amount") || "Amount (DZD)"}</Label>
            <Input
              type="number"
              min="1"
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {!isValid && refundAmount > 0 && (
              <p className="text-xs text-destructive">Amount exceeds refundable remaining</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t("orders.refund.method") || "Method"}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="bank">Bank transfer</SelectItem>
                <SelectItem value="courier_deduction">Courier deduction</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("orders.refund.reason") || "Reason (optional)"}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer return, damaged item, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!isValid || mutation.isSubmitting}
            onClick={() =>
              mutation.submit(`/api/orders/${orderId}/refund`, {
                method: "POST",
                body: JSON.stringify({ amount: refundAmount, method, reason: reason || undefined }),
              })
            }
          >
            {mutation.isSubmitting ? (
              <><Loader2 className="h-4 w-4 me-1.5 animate-spin" />Processing...</>
            ) : (
              t("orders.refund.confirm") || "Process refund"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
