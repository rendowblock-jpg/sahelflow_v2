import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * IDN-01 contract: no sign-in or PIN-proof route may feed a client-controlled
 * value into the limiter. `getClientIp` reads x-forwarded-for / x-real-ip, so
 * it is audit metadata only; every bucket key comes from a helper in
 * src/lib/auth/rate-limit.ts that derives it from the account or the verified
 * session.
 */
const ROUTES = [
  "login",
  "reauthenticate",
  "change-pin",
  "invitations/accept",
  "me/pin",
] as const;

const LIMITER_CALLS = [
  "checkLoginRateLimit",
  "recordLoginAttempt",
  "recordLoginFailure",
  "recordLoginSuccess",
] as const;

/** Source text without comments, so prose about headers is not mistaken for code. */
function routeSource(route: string): string {
  return readFileSync(
    join(process.cwd(), "src", "app", "api", "auth", route, "route.ts"),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("limiter bucket keys are never client-controlled (IDN-01)", () => {
  for (const route of ROUTES) {
    it(`${route}: getClientIp output never reaches the limiter`, () => {
      const source = routeSource(route);
      const ipVariables = [
        ...source.matchAll(/(?:const|let)\s+(\w+)\s*=\s*getClientIp\(/g),
      ].map((match) => match[1] as string);

      for (const call of LIMITER_CALLS) {
        expect(source, `${call}(getClientIp(...))`).not.toMatch(
          new RegExp(`${call}\\(\\s*getClientIp\\(`),
        );
        for (const variable of ipVariables) {
          expect(source, `${call}(${variable})`).not.toMatch(
            new RegExp(`${call}\\(\\s*${variable}\\s*\\)`),
          );
        }
      }
    });

    it(`${route}: reads no forwarding header of its own`, () => {
      const source = routeSource(route);
      expect(source.toLowerCase()).not.toContain("x-forwarded-for");
      expect(source.toLowerCase()).not.toContain("x-real-ip");
    });

    it(`${route}: takes its bucket key from a rate-limit key helper`, () => {
      const source = routeSource(route);
      expect(source).toMatch(
        /get(?:Owner|Member)?(?:Login|Confirmation|InvitationAccept)LimiterKey\(/,
      );
    });
  }
});
