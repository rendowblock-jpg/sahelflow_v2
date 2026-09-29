import "@/app/rtl-form-controls.css";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LicenseBoundary } from "@/components/license/license-boundary";
import { RuntimeUiReadyBeacon } from "@/components/runtime/runtime-ui-ready-beacon";
import { SpeculationRules } from "@/components/shared/speculation-rules";
import { isAuthenticated, isAuthSetup } from "@/lib/auth/server";
import { getLicenseAuthorityProjection } from "@/lib/license/license-authority";
import { redirect } from "next/navigation";

/**
 * Server Component — resolves protected setup/auth/license authority only.
 *
 * Locale is seeded once by the root ServerLocaleProvider and the hydrated shell
 * consumes the same reactive client locale authority as translated copy. Keeping
 * a second server-derived `dir` prop here caused the shell to retain stale geometry
 * while an interactive locale switch had already updated the client locale.
 */
export const dynamic = "force-dynamic";

export default async function DashboardRouteLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  /** Intercepted modal routes (Settings) rendered over the current page. */
  modal: React.ReactNode;
}) {
  if (!(await isAuthSetup())) redirect("/setup");
  if (!(await isAuthenticated())) redirect("/login");
  const licenseValid = await getLicenseAuthorityProjection()
    .then((projection) => projection.status === "valid")
    .catch(() => false);
  if (!licenseValid) {
    return (
      <>
        <RuntimeUiReadyBeacon />
        <LicenseBoundary>{null}</LicenseBoundary>
      </>
    );
  }

  return (
    <LicenseBoundary>
      <DashboardLayout>
        {/*
          Authentication, setup and entitlement authority have resolved above.
          Signal the hydrated workspace shell before slower page aggregates
          finish behind their route loading surface.
        */}
        <RuntimeUiReadyBeacon />
        <SpeculationRules />
        {children}
        {/*
          The route template wraps EVERY slot, so the empty `@modal` slot
          still arrives as a full-height transition box. Left in flow it
          doubled #main-content's scroll height: document pages gained a
          blank screen below their content and the Inbox/Agents
          scroll-to-latest pulled the workspace up into that void. The
          Settings modal portals to <body>, so its slot box never needs
          layout space.
        */}
        <div hidden data-shell-slot="modal">
          {modal}
        </div>
      </DashboardLayout>
    </LicenseBoundary>
  );
}
