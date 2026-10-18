import type {
  LicenseClientProjection,
  LicenseClientStatus,
} from "@/stores/license-store";

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

/**
 * What the boundary renders from.
 *
 * The dashboard server layout validates the entitlement before it renders the
 * licensed tree, and it hands that same projection down. Once the client has
 * taken over, using it means the workspace (and the `RuntimeUiReadyBeacon`
 * inside it) does not wait for a client round trip to `/api/license/status`
 * before it mounts. That wait sat on every launch. The server HTML and the
 * hydrating first client render stay the loading surface, exactly as before, so
 * hydration never sees page content the server did not render. The caller
 * decides when the server copy may stand in.
 *
 * Whatever the client has fetched is fresher and always wins. The loading
 * spinner now blocks only when there is nothing at all to show; a refresh that
 * already has a projection no longer unmounts the workspace behind a spinner.
 * With no server copy (the lockout branch passes none) behaviour is unchanged:
 * the store's loading flag decides.
 */
export function resolveLicenseBoundaryState(input: {
  storeProjection: LicenseClientProjection | null;
  storeIsLoading: boolean;
  serverProjection: LicenseClientProjection | null | undefined;
}): { projection: LicenseClientProjection | null; isLoading: boolean } {
  const projection = input.storeProjection ?? input.serverProjection ?? null;
  return {
    projection,
    isLoading: input.storeIsLoading && projection === null,
  };
}
