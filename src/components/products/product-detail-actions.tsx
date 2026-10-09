"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import {
  ProductFormDialog,
  type ProductFormDialogProduct,
} from "@/components/products/product-form-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import type { Category } from "@/types/domain";

/**
 * Header actions for the server-rendered product page: the same edit dialog
 * the list uses, followed by a server refresh so the page shows what was
 * saved.
 */
export function ProductDetailActions({
  product,
  categories,
}: {
  product: ProductFormDialogProduct;
  categories: Category[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <ProductFormDialog
      product={product}
      categories={categories}
      onSaved={() => router.refresh()}
      trigger={
        <Button variant="outline">
          <Pencil className="size-4" aria-hidden="true" />
          {t("products.edit")}
        </Button>
      }
    />
  );
}
