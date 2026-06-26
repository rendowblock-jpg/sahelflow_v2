"use client";

/**
 * OrderEditPanel — inline edit mode for the order detail page.
 *
 * Wraps the order detail page sections (items, delivery info, notes) and
 * makes them editable when the user clicks "Edit". On save, PATCHes the
 * order via /api/orders/[id].
 *
 * Pattern: Linear/Notion inline edit toggle (View ↔ Edit on same page).
 * The toggle is a button in the page header. When in edit mode, all editable
 * fields become inputs; when not, they render as read-only display.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { formatDZD } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n";
import { toast } from "sonner";

interface OrderItem {
  id: string;
  productId: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface OrderEditPanelProps {
  orderId: string;
  initialItems: OrderItem[];
  initialDeliveryCost: number;
  initialWilaya: string;
  initialCommune: string;
  initialAddress: string;
  initialPhone: string;
  initialNotes: string | null;
  /** Children = the read-only view (rendered when not in edit mode) */
  children: React.ReactNode;
}

export function OrderEditPanel({
  orderId,
  initialItems,
  initialDeliveryCost,
  initialWilaya,
  initialCommune,
  initialAddress,
  initialPhone,
  initialNotes,
  children,
}: OrderEditPanelProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Editable state
  const [items, setItems] = useState(initialItems);
  const [deliveryCost, setDeliveryCost] = useState(String(initialDeliveryCost));
  const [wilaya, setWilaya] = useState(initialWilaya);
  const [commune, setCommune] = useState(initialCommune);
  const [address, setAddress] = useState(initialAddress);
  const [phone, setPhone] = useState(initialPhone);
  const [notes, setNotes] = useState(initialNotes ?? "");

  function startEdit() {
    setIsEditing(true);
  }

  function cancelEdit() {
    // Reset to initial values
    setItems(initialItems);
    setDeliveryCost(String(initialDeliveryCost));
    setWilaya(initialWilaya);
    setCommune(initialCommune);
    setAddress(initialAddress);
    setPhone(initialPhone);
    setNotes(initialNotes ?? "");
    setIsEditing(false);
  }

  function updateItem(index: number, field: "quantity" | "unitPrice", value: number) {
    setItems(items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      updated.total = updated.quantity * updated.unitPrice;
      return updated;
    }));
  }

  async function saveEdit() {
    startTransition(async () => {
      try {
        const itemsTotal = items.reduce((sum, i) => sum + i.total, 0);
        const totalPrice = itemsTotal + (parseInt(deliveryCost) || 0);

        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              id: i.id,
              productId: i.productId,
              productName: i.productName,
              productVariantName: i.productVariantName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              total: i.total,
            })),
            deliveryCost: parseInt(deliveryCost) || 0,
            wilaya,
            commune,
            address,
            phone,
            notes: notes || null,
            totalPrice,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? t("orders.detail.editFailed"));
        }

        toast.success(t("orders.detail.editSaved"));
        setIsEditing(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("orders.detail.editFailed"));
      }
    });
  }

  // Read-only mode: render children (the original detail page content)
  if (!isEditing) {
    return (
      <>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t("orders.detail.edit")}
          </Button>
        </div>
        {children}
      </>
    );
  }

  // Edit mode: render editable fields
  const itemsTotal = items.reduce((sum, i) => sum + i.total, 0);
  const total = itemsTotal + (parseInt(deliveryCost) || 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={cancelEdit} disabled={isPending}>
          <X className="h-3.5 w-3.5" />
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={saveEdit} disabled={isPending}>
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {t("common.save")}
        </Button>
      </div>

      {/* Editable items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.detail.items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b last:border-0">
              <div className="flex-1 space-y-0.5">
                <p className="text-sm font-medium">{item.productName}</p>
                {item.productVariantName && (
                  <p className="text-xs text-muted-foreground">{item.productVariantName}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{t("orders.detail.qty")}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", parseInt(e.target.value) || 1)}
                    className="w-16 h-8 text-sm tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">{t("orders.detail.price")}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(i, "unitPrice", parseInt(e.target.value) || 0)}
                    className="w-24 h-8 text-sm tabular-nums"
                  />
                </div>
                <div className="text-sm font-medium w-24 text-end tabular-nums">
                  {formatDZD(item.total)}
                </div>
              </div>
            </div>
          ))}
          <Separator />
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("orders.detail.subtotal")}</span>
              <span className="tabular-nums">{formatDZD(itemsTotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm gap-3">
              <span className="text-muted-foreground">{t("orders.detail.shipping")}</span>
              <Input
                type="number"
                min="0"
                value={deliveryCost}
                onChange={(e) => setDeliveryCost(e.target.value)}
                className="w-24 h-8 text-sm tabular-nums text-end"
              />
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>{t("orders.total")}</span>
              <span className="tabular-nums">{formatDZD(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Editable delivery info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.form.delivery")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("orders.wilaya")}</Label>
              <Input value={wilaya} onChange={(e) => setWilaya(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("orders.commune")}</Label>
              <Input value={commune} onChange={(e) => setCommune(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("customers.address")}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("customers.phone")}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="font-mono"
            />
          </div>
        </CardContent>
      </Card>

      {/* Editable notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.notes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("orders.notesPlaceholder")}
            rows={3}
          />
        </CardContent>
      </Card>
    </div>
  );
}
