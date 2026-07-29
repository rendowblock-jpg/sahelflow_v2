"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import { formatDZD } from "@/lib/utils";

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
  children: React.ReactNode;
}

interface EditAuthority {
  version: number;
  trustedManual: boolean;
  activeReservation: boolean;
  legacyPricingEditable: boolean;
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
  const [isCheckingAuthority, setIsCheckingAuthority] = useState(false);
  const [trustedManual, setTrustedManual] = useState(false);
  const [editVersion, setEditVersion] = useState<number | null>(null);
  const [legacyPricingEditable, setLegacyPricingEditable] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState(initialItems);
  const [deliveryCost, setDeliveryCost] = useState(String(initialDeliveryCost));
  const [wilaya, setWilaya] = useState(initialWilaya);
  const [commune, setCommune] = useState(initialCommune);
  const [address, setAddress] = useState(initialAddress);
  const [phone, setPhone] = useState(initialPhone);
  const [notes, setNotes] = useState(initialNotes ?? "");

  async function startEdit() {
    setIsCheckingAuthority(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/edit-authority`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(t("orders.detail.editFailed"));
      }
      const authority = (await response.json()) as EditAuthority;
      if (authority.activeReservation) {
        toast.error(t("orders.detail.editFailed"));
        router.refresh();
        return;
      }
      setTrustedManual(authority.trustedManual);
      setEditVersion(authority.version);
      setLegacyPricingEditable(authority.legacyPricingEditable);
      setIsEditing(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("orders.detail.editFailed"),
      );
    } finally {
      setIsCheckingAuthority(false);
    }
  }

  function cancelEdit() {
    setItems(initialItems);
    setDeliveryCost(String(initialDeliveryCost));
    setWilaya(initialWilaya);
    setCommune(initialCommune);
    setAddress(initialAddress);
    setPhone(initialPhone);
    setNotes(initialNotes ?? "");
    setTrustedManual(false);
    setEditVersion(null);
    setIsEditing(false);
  }

  function updateItem(
    index: number,
    field: "quantity" | "unitPrice",
    value: number,
  ) {
    setItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const updated = { ...item, [field]: value };
        updated.total = updated.quantity * updated.unitPrice;
        return updated;
      }),
    );
  }

  function saveEdit() {
    startTransition(async () => {
      try {
        if (trustedManual && editVersion === null) {
          throw new Error(t("orders.detail.editFailed"));
        }
        const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);
        const parsedDeliveryCost = parseInt(deliveryCost, 10) || 0;
        const response = await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(trustedManual ? { expectedVersion: editVersion } : {}),
            ...(legacyPricingEditable
              ? {
                  items: items.map((item) => ({
                    id: item.id,
                    productId: item.productId,
                    productName: item.productName,
                    productVariantName: item.productVariantName,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total,
                  })),
                  deliveryCost: parsedDeliveryCost,
                  totalPrice: itemsTotal + parsedDeliveryCost,
                }
              : {}),
            wilaya,
            commune,
            address,
            phone,
            notes: notes || null,
          }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? body.error ?? t("orders.detail.editFailed"),
          );
        }

        if (typeof body.order?.version === "number") {
          setEditVersion(body.order.version);
        }
        toast.success(t("orders.detail.editSaved"));
        setIsEditing(false);
        router.refresh();
        void mutatePrefix("/api/orders");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("orders.detail.editFailed"),
        );
      }
    });
  }

  if (!isEditing) {
    return (
      <>
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={startEdit}
            disabled={isCheckingAuthority}
          >
            {isCheckingAuthority ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
            {t("orders.detail.edit")}
          </Button>
        </div>
        {children}
      </>
    );
  }

  const itemsTotal = items.reduce((sum, item) => sum + item.total, 0);
  const total = itemsTotal + (parseInt(deliveryCost, 10) || 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={cancelEdit}
          disabled={isPending}
        >
          <X className="h-3.5 w-3.5" />
          {t("common.cancel")}
        </Button>
        <Button size="sm" onClick={saveEdit} disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {t("common.save")}
        </Button>
      </div>

      {legacyPricingEditable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("orders.detail.items")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-2 border-b last:border-0"
              >
                <div className="flex-1 space-y-0.5">
                  <p className="text-sm font-medium">{item.productName}</p>
                  {item.productVariantName && (
                    <p className="text-xs text-muted-foreground">
                      {item.productVariantName}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("orders.detail.qty")}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(
                          index,
                          "quantity",
                          parseInt(event.target.value, 10) || 1,
                        )
                      }
                      className="w-16 h-8 text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      {t("orders.detail.price")}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(
                          index,
                          "unitPrice",
                          parseInt(event.target.value, 10) || 0,
                        )
                      }
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
                <span className="text-muted-foreground">
                  {t("orders.detail.subtotal")}
                </span>
                <span className="tabular-nums">{formatDZD(itemsTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-sm gap-3">
                <span className="text-muted-foreground">
                  {t("orders.detail.shipping")}
                </span>
                <Input
                  type="number"
                  min="0"
                  value={deliveryCost}
                  onChange={(event) => setDeliveryCost(event.target.value)}
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
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.form.delivery")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("orders.wilaya")}</Label>
              <Input value={wilaya} onChange={(event) => setWilaya(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("orders.commune")}</Label>
              <Input value={commune} onChange={(event) => setCommune(event.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("customers.address")}</Label>
            <Input value={address} onChange={(event) => setAddress(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("customers.phone")}</Label>
            <Input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="font-mono"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("orders.notes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("orders.notesPlaceholder")}
            rows={3}
          />
        </CardContent>
      </Card>
    </div>
  );
}
