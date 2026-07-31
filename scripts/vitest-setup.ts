import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";

// Direct route suites use a disposable unconfigured database. Authentication
// tests explicitly delete this variable so configured session authority remains
// fully exercised. Vitest runs setupFiles before every test file, preventing one
// strict auth suite from leaking its environment into later business-route tests.
process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY = "vitest-business-routes";

// Installation identity, invitation, accepted-member and revocation authority is
// durable in production but isolated per test file. Tests that need restart
// persistence exercise it within one file.
const dataDirectory = resolve(
  process.env.SF_DATA_DIR ?? join(process.cwd(), "data"),
);
const systemDirectory = join(dataDirectory, "system");
if (existsSync(systemDirectory)) {
  for (const name of readdirSync(systemDirectory)) {
    if (
      name.startsWith("identity-authority") ||
      name.startsWith("member-authority") ||
      name.startsWith("team-directory") ||
      name.startsWith("team-revocation")
    ) {
      try {
        unlinkSync(join(systemDirectory, name));
      } catch {
        // A focused authority test will surface any real cleanup problem.
      }
    }
  }
}
