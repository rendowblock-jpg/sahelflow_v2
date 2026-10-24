import { afterAll, beforeAll } from "vitest";

/**
 * Run the tests of the enclosing describe with the machine time zone set to
 * `zone`. Node re-reads process.env.TZ on assignment (vitest runs each file in
 * a forked process), so Date getters like getHours() really change. Used to
 * prove that shop day boundaries do not depend on the host time zone.
 */
export function useHostTimeZone(zone: string): void {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TZ;
    process.env.TZ = zone;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
}

/** Host zones the day-boundary tests run under: UTC, US west coast, UTC+14. */
export const HOST_TIME_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "Pacific/Kiritimati",
] as const;
