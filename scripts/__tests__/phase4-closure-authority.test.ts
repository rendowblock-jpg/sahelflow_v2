import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  discoverPrismaModels,
  verifyPhase4Closure,
} from "../verify-phase4-closure";

describe("Phase 4 closure authority", () => {
  const repoDir = resolve(import.meta.dirname, "../..");

  it("classifies and governs every current Prisma model and survivability authority", () => {
    const models = discoverPrismaModels(repoDir);
    expect(models.length).toBeGreaterThanOrEqual(80);
    expect(models).toContain("ProtectedKeyAuthority");
    expect(models).toContain("ProviderIngressEvent");
    expect(verifyPhase4Closure(repoDir)).toEqual([]);
  });
});
