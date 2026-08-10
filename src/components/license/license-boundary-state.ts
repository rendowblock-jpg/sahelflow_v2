import type { LicenseClientStatus } from "@/stores/license-store";

/**
 * The server intentionally withholds protected dashboard children while the
 * entitlement is invalid. If the client later observes a valid entitlement,
 * those old `null` children cannot become the licensed workspace by themselves;
 * the App Router must request a new Server Component tree.
 */
export function needsLicensedServerTreeRefresh(
  status: LicenseClientStatus | null | undefined,
  hasServerChildren: boolean,
): boolean {
  return status === "valid" && !hasServerChildren;
}
