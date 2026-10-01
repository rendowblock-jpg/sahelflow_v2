"use client";

import { useMemo } from "react";
import { MessageCircle, ShieldCheck, Truck } from "lucide-react";

import type { EntryPoint } from "@/components/system/entry-shell";
import { useI18n } from "@/hooks/use-i18n";
import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/support-contact";

/** Brand-rail copy shared by every entry surface, from the locale authority. */
export function useEntryBrand() {
  const { t } = useI18n();
  return useMemo(() => {
    const points: EntryPoint[] = [
      {
        icon: MessageCircle,
        title: t("entry.point.orders.title"),
        description: t("entry.point.orders.description"),
      },
      {
        icon: Truck,
        title: t("entry.point.delivery.title"),
        description: t("entry.point.delivery.description"),
      },
      {
        icon: ShieldCheck,
        title: t("entry.point.privacy.title"),
        description: t("entry.point.privacy.description"),
      },
    ];
    return {
      headline: t("entry.headline"),
      lede: t("entry.lede"),
      points,
      assurance: t("entry.support", { phone: SUPPORT_WHATSAPP_DISPLAY }),
      languageLabel: t("entry.language"),
    };
  }, [t]);
}
