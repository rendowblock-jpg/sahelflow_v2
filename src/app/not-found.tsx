import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n-server";
import { SearchX } from "lucide-react";

export default async function NotFound() {
  const { t } = await getI18n();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="animate-fade-up text-center space-y-4">
        {/* Premium 404 display */}
        <div className="mx-auto rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 p-5 ring-1 ring-primary/20 w-fit">
          <SearchX className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-6xl font-bold text-muted-foreground">{t("notFound.code")}</h1>
        <h2 className="text-xl font-semibold">{t("notFound.title")}</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {t("notFound.message")}
        </p>
      </div>
      <Button asChild className="animate-fade-up" style={{ animationDelay: "100ms" }}>
        <Link href="/dashboard">{t("notFound.backToDashboard")}</Link>
      </Button>
    </div>
  );
}
