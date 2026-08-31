"use client";

import { useCallback } from "react";
import { Plus } from "lucide-react";

import { AsyncCombobox } from "@/components/shared/combobox/async-combobox";
import { CommandItem } from "@/components/ui/command";
import { useI18n } from "@/hooks/use-i18n";

export interface OrderFormCustomer {
  id: string;
  name: string;
  phone: string;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
}

interface CustomerSearchResponseRow {
  id?: unknown;
  name?: string | null;
  phone?: string | null;
  wilaya?: string | null;
  commune?: string | null;
  address?: string | null;
}

/**
 * Remote customer search for the order form.
 *
 * GET /api/customers/search?q=&limit=50 is the blind-index-aware customer
 * search authority (exact phone/name match under ADR-003 encryption; the
 * workbench `q` contains-filter cannot match encrypted columns) and — unlike
 * the workbench list — its projection still carries `address`, which the
 * dialog needs for delivery prefill.
 */
export async function fetchCustomerOptions(
  query: string,
): Promise<OrderFormCustomer[]> {
  const res = await fetch(
    `/api/customers/search?q=${encodeURIComponent(query)}&limit=50`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`customer search failed (${res.status})`);
  const data = (await res.json()) as { customers?: CustomerSearchResponseRow[] };
  return (data.customers ?? [])
    .filter(
      (row): row is CustomerSearchResponseRow & { id: string } =>
        typeof row.id === "string",
    )
    .map((row) => ({
      id: row.id,
      name: row.name ?? "",
      phone: row.phone ?? "",
      wilaya: row.wilaya ?? null,
      commune: row.commune ?? null,
      address: row.address ?? null,
    }));
}

interface OrderCustomerComboboxProps {
  id?: string;
  /** Capped most-recent slice passed server-side (initial rows). */
  customers: OrderFormCustomer[];
  value: string;
  onSelect: (customer: OrderFormCustomer) => void;
  /** "Create new customer" affordance — receives the typed query as the name. */
  onCreateNew: (name: string) => void;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  disabled?: boolean;
}

export function OrderCustomerCombobox({
  id,
  customers,
  value,
  onSelect,
  onCreateNew,
  ariaInvalid,
  ariaDescribedBy,
  disabled,
}: OrderCustomerComboboxProps) {
  const { t } = useI18n();

  const searchFields = useCallback(
    (customer: OrderFormCustomer) => [
      customer.name,
      customer.phone,
      customer.wilaya,
      customer.commune,
    ],
    [],
  );

  return (
    <AsyncCombobox<OrderFormCustomer>
      id={id}
      value={value}
      options={customers}
      onSelect={onSelect}
      fetchOptions={fetchCustomerOptions}
      searchFields={searchFields}
      placeholder={t("orders.form.selectCustomerPlaceholder")}
      searchPlaceholder={t("customers.searchPlaceholder")}
      emptyMessage={t("orders.form.combobox.noCustomerMatch")}
      searchingMessage={t("orders.form.combobox.searching")}
      searchFailedMessage={t("orders.form.combobox.searchFailed")}
      ariaInvalid={ariaInvalid}
      ariaDescribedBy={ariaDescribedBy}
      disabled={disabled}
      renderTriggerLabel={(customer) =>
        customer ? (
          <span>
            {customer.name}{" "}
            <span className="text-muted-foreground" dir="ltr">
              {customer.phone}
            </span>
          </span>
        ) : null
      }
      renderOption={(customer) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{customer.name}</span>
            {/* Phone digits are technical LTR content — keep group order in RTL. */}
            <span
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
              dir="ltr"
            >
              {customer.phone}
            </span>
          </span>
          {(customer.wilaya || customer.commune) && (
            <span className="truncate text-xs text-muted-foreground">
              {[customer.wilaya, customer.commune].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      )}
      footer={({ query, hasMatches, fetching }) =>
        query && !hasMatches && !fetching ? (
          <CommandItem
            value="__create_customer__"
            onSelect={() => onCreateNew(query)}
            data-testid="combobox-create-customer"
            className="text-muted-foreground"
          >
            <Plus className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {t("orders.form.combobox.createCustomer", { query })}
            </span>
          </CommandItem>
        ) : null
      }
    />
  );
}
