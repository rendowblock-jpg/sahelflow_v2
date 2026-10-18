import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { LicenseClientProjection } from "@/stores/license-store";

import { resolveLicenseBoundaryState } from "../license-boundary-state";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const squash = (source: string) => source.replace(/\s+/g, " ");

function projection(
  status: LicenseClientProjection["status"],
): LicenseClientProjection {
  return {
    status,
    message: status,
    onlineTrialAvailable: false,
    licenseId: null,
    type: null,
    expiresAt: null,
    supportEndsAt: null,
    shopSlots: 1,
    memberLimit: 1,
    deviceLimit: 1,
    features: [],
    minimumPermanentRecoveryEpoch: null,
  };
}

describe("licence boundary first paint", () => {
  it("renders from the server projection while the client store is still loading", () => {
    const seed = projection("valid");
    expect(
      resolveLicenseBoundaryState({
        storeProjection: null,
        storeIsLoading: true,
        serverProjection: seed,
      }),
    ).toEqual({ projection: seed, isLoading: false });
  });

  it("lets anything the client has fetched replace the server copy", () => {
    const fresh = projection("expired");
    expect(
      resolveLicenseBoundaryState({
        storeProjection: fresh,
        storeIsLoading: false,
        serverProjection: projection("valid"),
      }),
    ).toEqual({ projection: fresh, isLoading: false });
  });

  it("does not put the workspace behind a spinner while a refresh already has something to show", () => {
    const known = projection("valid");
    expect(
      resolveLicenseBoundaryState({
        storeProjection: known,
        storeIsLoading: true,
        serverProjection: undefined,
      }),
    ).toEqual({ projection: known, isLoading: false });
  });

  it("keeps the previous behaviour when no server copy is passed", () => {
    expect(
      resolveLicenseBoundaryState({
        storeProjection: null,
        storeIsLoading: true,
        serverProjection: undefined,
      }),
    ).toEqual({ projection: null, isLoading: true });
    expect(
      resolveLicenseBoundaryState({
        storeProjection: null,
        storeIsLoading: false,
        serverProjection: null,
      }),
    ).toEqual({ projection: null, isLoading: false });
  });
});

describe("licence boundary wiring", () => {
  const layout = read("src/app/(dashboard)/layout.tsx");
  const boundary = read("src/components/license/license-boundary.tsx");
  const statusRoute = read("src/app/api/license/status/route.ts");

  it("validates the licence once on the server and passes that projection to the licensed tree only", () => {
    expect(layout.match(/getLicenseAuthorityProjection\(/g)).toHaveLength(1);
    expect(layout).toContain("initialProjection={");
    // The lockout branch keeps rendering the boundary with no children and no
    // seed, so an invalid entitlement still resolves through the client store.
    expect(layout).toContain("<LicenseBoundary>{null}</LicenseBoundary>");
    expect(layout.indexOf("if (!licenseValid)")).toBeLessThan(
      layout.indexOf("initialProjection={"),
    );
  });

  it("hands the client the same shape and the same trial flag as GET /api/license/status", () => {
    const flag = "Boolean(process.env.SF_LICENSE_SERVICE_URL?.trim())";
    expect(squash(layout).replace(/\( /g, "(").replace(/,? \)/g, ")")).toContain(
      flag,
    );
    expect(squash(statusRoute)).toContain(flag);
    expect(squash(layout)).toContain("...licenseProjection,");
  });

  it("lets the server copy stand in only after the client has taken over, so the first client render equals the server HTML", () => {
    // Server snapshot false, client snapshot true: hydration renders the loading surface.
    expect(squash(boundary)).toContain(
      "useSyncExternalStore( subscribeNever, clientSnapshot, serverSnapshot, )",
    );
    expect(boundary).toContain("const serverSnapshot = () => false;");
    expect(boundary).toContain("const clientSnapshot = () => true;");
    // The flag must be read before the server copy is used, never after.
    expect(boundary.indexOf("const mounted = useSyncExternalStore(")).toBeLessThan(
      boundary.indexOf("resolveLicenseBoundaryState({"),
    );
  });

  it("keeps the workspace-ready beacon inside the seeded boundary and the spinner contract intact", () => {
    const seeded = layout.indexOf("initialProjection={");
    const beacon = layout.indexOf("<RuntimeUiReadyBeacon />", seeded);
    const close = layout.lastIndexOf("</LicenseBoundary>");
    expect(seeded).toBeGreaterThan(-1);
    expect(beacon).toBeGreaterThan(seeded);
    expect(beacon).toBeLessThan(close);
    expect(boundary).toContain(
      "serverProjection: mounted ? initialProjection : undefined",
    );
    expect(boundary).toContain("if (isLoading || needsServerTreeRefresh)");
  });
});
