import { describe, expect, it } from "vitest";

import { AuthIoStats } from "./auth-io-stats";

describe("AuthIoStats", () => {
  it("starts empty", () => {
    expect(new AuthIoStats().take()).toEqual({
      authReads: 0,
      authReadMs: 0,
      authWrites: 0,
      authWriteMs: 0,
      authMaxCallMs: 0,
    });
  });

  it("counts records and time separately for reads and writes", () => {
    const stats = new AuthIoStats();
    stats.note("read", 12.4, 3);
    stats.note("read", 8.2, 1);
    stats.note("write", 150.6, 30);
    expect(stats.take()).toEqual({
      authReads: 4,
      authReadMs: 21,
      authWrites: 30,
      authWriteMs: 151,
      authMaxCallMs: 151,
    });
  });

  it("starts a new window after each take", () => {
    const stats = new AuthIoStats();
    stats.note("write", 40, 2);
    stats.take();
    stats.note("read", 5, 1);
    expect(stats.take()).toMatchObject({
      authReads: 1,
      authWrites: 0,
      authWriteMs: 0,
      authMaxCallMs: 5,
    });
  });

  it("ignores impossible values instead of poisoning the window", () => {
    const stats = new AuthIoStats();
    stats.note("read", Number.NaN, 1);
    stats.note("read", -3, 1);
    stats.note("write", 10, 0);
    stats.note("write", 10, -1);
    stats.note("write", Number.POSITIVE_INFINITY, 1);
    expect(stats.take()).toEqual({
      authReads: 0,
      authReadMs: 0,
      authWrites: 0,
      authWriteMs: 0,
      authMaxCallMs: 0,
    });
  });
});
