"use client";

import { useI18n } from "@/hooks/use-i18n";
import { Card, CardContent } from "@/components/ui/card";

export default function Page() {
  const { t } = useI18n();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t("nav.returns")}</h1>
      <Card>
        <CardContent className="flex items-center justify-center py-16 text-muted-foreground">
          <p>{t("nav.returns")} — en construction</p>
        </CardContent>
      </Card>
    </div>
  );
}
