"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { OrderFormDialog } from "@/components/orders/order-form-dialog";
import type { OrderFormCustomer } from "@/components/orders/order-customer-combobox";
import type { OrderFormProduct } from "@/components/orders/order-product-combobox";
import { ProductFormDialog } from "@/components/products/product-form-dialog";
import { Button } from "@/components/ui/button";
import { useCreateParam } from "@/hooks/use-create-param";
import { useI18n } from "@/hooks/use-i18n";
import type { Category } from "@/types/domain";

export type CreateParamDialogProps =
  | { kind: "order"; customers: OrderFormCustomer[]; products: OrderFormProduct[] }
  | { kind: "customer" }
  | { kind: "product"; categories: Category[] };

/**
 * R4-f create deep-link host.
 *
 * Each list page renders this instead of its bare form dialog. It keeps the
 * page's usual trigger button AND opens the dialog when the URL carries
 * `?create=1` (command palette create actions). Closing the dialog clears the
 * param so refresh/back never re-opens it; other list params survive.
 *
 * Permissions remain the page's server-computed authority: the page only
 * renders this host when the actor may create, so a deep link without
 * permission lands on the plain list.
 */
export function CreateParamDialog(props: CreateParamDialogProps) {
  const { t } = useI18n();
  const { createRequested, clearCreateParam } = useCreateParam();
  // Trigger clicks (manual open) coexist with the param: either source opens
  // the dialog, and closing always settles both.
  const [manualOpen, setManualOpen] = useState(false);
  const open = createRequested || manualOpen;

  function handleOpenChange(next: boolean) {
    setManualOpen(next);
    if (!next) clearCreateParam();
  }

  if (props.kind === "order") {
    return (
      <OrderFormDialog
        customers={props.customers}
        products={props.products}
        open={open}
        onOpenChange={handleOpenChange}
      />
    );
  }

  if (props.kind === "customer") {
    return (
      <CustomerFormDialog
        open={open}
        onOpenChange={handleOpenChange}
        trigger={
          <Button>
            <Plus className="h-4 w-4" />
            {t("common.create")}
          </Button>
        }
      />
    );
  }

  return (
    <ProductFormDialog
      categories={props.categories}
      open={open}
      onOpenChange={handleOpenChange}
      trigger={
        <Button>
          <Plus className="h-4 w-4" />
          {t("products.addProduct")}
        </Button>
      }
    />
  );
}
