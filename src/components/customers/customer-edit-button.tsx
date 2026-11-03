"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

import {
  CustomerFormDialog,
  type CustomerFormDialogCustomer,
} from "@/components/customers/customer-form-dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";

/**
 * Edit button for the server-rendered customer page: opens the existing edit form (CustomerFormDialog in PATCH
 * mode) and, once saved, refreshes the server data so the page shows what was saved (same pattern as
 * ProductDetailActions).
 */
export function CustomerEditButton({ customer }: { customer: CustomerFormDialogCustomer }) {
  const { t } = useI18n();
  const router = useRouter();
  return (
    <CustomerFormDialog
      customer={customer}
      onSaved={() => router.refresh()}
      trigger={
        <Button variant="outline" size="sm">
          <Pencil className="me-1.5 size-4" aria-hidden="true" />
          {t("customers.edit")}
        </Button>
      }
    />
  );
}
