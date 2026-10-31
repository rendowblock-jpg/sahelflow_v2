import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n-server";

/** An automation id that does not exist (deleted, or an old link): calm, one way back. */
export default async function AutomationNotFound() {
  const { t } = await getI18n();
  return (
    <div className="app-content page-sections" data-automation-not-found>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <span className="rounded-surface bg-muted p-4">
          <SearchX className="size-8 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">{t("automations.notFound.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("automations.notFound.message")}</p>
        <Button asChild>
          <Link href="/automations">{t("automations.notFound.back")}</Link>
        </Button>
      </div>
    </div>
  );
}
