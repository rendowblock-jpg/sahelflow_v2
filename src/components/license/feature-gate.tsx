"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/hooks/use-i18n";
import { useLicense } from "@/hooks/use-license";

type FeatureGateProps = {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
};

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { projection, isLoading } = useLicense();
  const { t } = useI18n();

  if (isLoading) return null;
  const features = projection?.features ?? [];
  const allowed =
    projection?.status === "valid" &&
    (features.includes("sahelflow.complete") || features.includes(feature));
  if (allowed) return <>{children}</>;

  return (
    <>
      {fallback ?? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">{t("license.premiumFeature")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("license.premiumFeatureDescription")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
