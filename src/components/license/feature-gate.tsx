"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";

interface FeatureGateProps {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * <FeatureGate> — conditionally renders children based on the active license's
 * feature set. Trial + permanent licenses include "all" features by default.
 *
 * PROD-003: License feature-gating was dead code. This component wires
 * client-side gating into the UI.
 *
 * Usage:
 *   <FeatureGate feature="ai_chat" fallback={<PremiumUpsell />}>
 *     <AiChat />
 *   </FeatureGate>
 */
export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { license, isLoading } = useLicense();
  const { t } = useI18n();

  if (isLoading) return <>{children}</>;

  const features = license?.payload?.features ?? [];
  const hasFeature = features.includes("all") || features.includes(feature);

  if (!hasFeature) {
    return (
      <>
        {fallback ?? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{t('license.premiumFeature')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('license.premiumFeatureDescription')}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </>
    );
  }

  return <>{children}</>;
}
