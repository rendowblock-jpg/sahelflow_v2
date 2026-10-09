"use client";

import { useI18n } from "@/hooks/use-i18n";
import { deliveryProviderLabel } from "@/lib/shared";

/**
 * Courier picker for cash-collection records. The stored value stays the
 * courier id the COD ledger already uses ("yalidine", "manual-courier", …);
 * sellers pick a name instead of typing an id.
 */
const COURIERS = ["yalidine", "maystro", "zrexpress", "ecotrack", "noest", "manual-courier"] as const;

export function CourierSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const options: string[] = value && !COURIERS.includes(value as (typeof COURIERS)[number])
    ? [value, ...COURIERS]
    : [...COURIERS];
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded-control border bg-background px-3 text-sm"
    >
      {options.map((courier) => (
        <option key={courier} value={courier}>
          {deliveryProviderLabel(courier, t)}
        </option>
      ))}
    </select>
  );
}
