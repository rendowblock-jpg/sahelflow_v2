"use client";

import { AccountingSkeleton } from "@/components/accounting/accounting-skeleton";
import { useI18n } from "@/hooks/use-i18n";

export default function Loading() {
  const { t } = useI18n();
  return <AccountingSkeleton label={t("common.loading")} />;
}
