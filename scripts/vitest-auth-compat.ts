import { expect, vi } from "vitest";

/**
 * Legacy business and route suites historically used an empty authentication
 * database as an implicit authenticated owner. Production setup mode no longer
 * grants that authority.
 *
 * Keep strict authentication evidence on the real module. For every other test
 * file, upgrade only the genuine `setup` result to one synthetic local test
 * session. Configured-but-unauthenticated, revoked, expired, inactive, invalid,
 * and unavailable authority still fail exactly as production does.
 */
const testPath = (expect.getState().testPath ?? "").replaceAll("\\", "/");
const strictAuthorityTest =
  !testPath ||
  testPath.includes("/src/lib/auth/__tests__/") ||
  testPath.endsWith("/src/app/api/__tests__/auth.test.ts") ||
  testPath.endsWith("/src/lib/identity/__tests__/session-authority.test.ts");

if (!strictAuthorityTest) {
  // `doMock` is intentionally non-hoisted: setup files run before each test file,
  // so this conditional applies only to the current non-auth evidence file.
  vi.doMock("@/lib/auth/server", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/auth/server")>();

    async function getCompatibleAuthority() {
      const authority = await actual.getCurrentSessionAuthority();
      if (authority.status !== "setup") return authority;

      const now = new Date();
      return {
        status: "authenticated" as const,
        sessionId: "vitest-setup-compatibility-session",
        issuedAt: now,
        lastSeenAt: now,
      };
    }

    return {
      ...actual,
      getCurrentSessionAuthority: getCompatibleAuthority,
      isAuthenticated: async () =>
        (await getCompatibleAuthority()).status === "authenticated",
      requireAuth: async () => {
        const authority = await getCompatibleAuthority();
        if (authority.status === "authenticated") return;
        await actual.requireAuth();
      },
      getCurrentUserKey: async () => {
        const authority = await getCompatibleAuthority();
        return authority.status === "authenticated"
          ? authority.sessionId
          : "default";
      },
    };
  });
}
