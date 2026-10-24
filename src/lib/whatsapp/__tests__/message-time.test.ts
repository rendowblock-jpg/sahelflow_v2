import { describe, expect, it } from "vitest";

import { storedMessageTime } from "../message-time";

const RECEIVED = "2026-08-03T10:00:00.000Z";

describe("storedMessageTime", () => {
  it("uses the received time for provider time 0", () => {
    expect(storedMessageTime(null, 0, RECEIVED).toISOString()).toBe(RECEIVED);
    expect(storedMessageTime(new Date(0), 0, RECEIVED).toISOString()).toBe(
      RECEIVED,
    );
  });

  it("returns a real provider time unchanged", () => {
    expect(storedMessageTime(null, 1_786_000_100, RECEIVED).getTime()).toBe(
      1_786_000_100_000,
    );
    const column = new Date(1_786_000_100_000);
    expect(storedMessageTime(column, 0, RECEIVED)).toBe(column);
  });
});
