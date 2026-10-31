"use client";

import { CodReconciliationSkeleton } from "@/components/accounting/cod-reconciliation-skeleton";
import { useI18n } from "@/hooks/use-i18n";

export default function Loading() {
  const { t } = useI18n();
  return <CodReconciliationSkeleton label={t("common.loading")} />;
}
