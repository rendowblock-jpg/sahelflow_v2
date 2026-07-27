import { cookies } from "next/headers";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { SpeculationRules } from "@/components/shared/speculation-rules";
import { getDirection, type Locale } from "@/lib/i18n";
import { isAuthenticated, isAuthSetup } from "@/lib/auth/server";
import { redirect } from "next/navigation";

const VALID_LOCALES: readonly string[] = ["ar", "fr", "en"];

/**
 * Server Component — reads the sahellflow-locale cookie and passes
 * locale + dir as props to the client DashboardLayout.
 *
 * This eliminates the hydration mismatch that occurred when the client-side
 * useI18n() hook returned a different dir than the server render. Now both
 * server + client start with the same cookie-derived values.
 *
 * force-dynamic ensures the cookie is always re-read on every request
 * (no caching), so locale switching via router.refresh() works instantly.
 */
export const dynamic = "force-dynamic";

export default async function DashboardRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthSetup())) redirect("/setup");
  if (!(await isAuthenticated())) redirect("/login");

  const cookieStore = await cookies();
  const localeCookie = cookieStore.get("sahelflow-locale")?.value;
  const locale: Locale =
    localeCookie && VALID_LOCALES.includes(localeCookie)
      ? (localeCookie as Locale)
      : "fr";
  const dir = getDirection(locale);

  return (
    <DashboardLayout locale={locale} dir={dir}>
      {/*
        Authentication and setup authority have resolved above. Signal the
        hydrated workspace shell before slower page aggregates finish behind
        their route loading surface.
      */}
      <RuntimeUiReadyBeacon />
      <SpeculationRules />
      {children}
    </DashboardLayout>
  );
}
