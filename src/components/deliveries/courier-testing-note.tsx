"use client";

import { TestingBadge } from "@/components/integrations/testing-badge";
import { useI18n } from "@/hooks/use-i18n";
import { deliveryIntegrationId, integrationStatus } from "@/lib/integrations/certification";

/**
 * Where a seller books or follows a parcel, the courier carries the same "in testing" chip as in Settings. It reads
 * the registry, so promoting a courier there removes the chip and the hint here with no other edit.
 */
export function CourierTestingChip({ provider, className }: { provider: string; className?: string }) {
  const integration = deliveryIntegrationId(provider);
  if (!integration) return null;
  return <TestingBadge integration={integration} className={className} />;
}

/** One quiet sentence under the courier choice, only while the registry still says "testing". */
export function CourierTestingHint({ provider }: { provider: string }) {
  const { t } = useI18n();
  const integration = deliveryIntegrationId(provider);
  if (!integration || integrationStatus(integration) !== "testing") return null;
  return (
    <p className="text-xs text-muted-foreground" data-courier-testing-hint>
      {t("integrations.experimentalHint")}
    </p>
  );
}
