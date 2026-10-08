import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const bun = spawnSync("bun", ["--version"], { encoding: "utf8" });

describe("License Desk build", () => {
  it.skipIf(bun.status !== 0)("the committed offline page matches its sources", () => {
    const check = spawnSync("bun", ["run", "scripts/build-license-desk.ts", "--check"], {
      encoding: "utf8",
    });
    expect(check.stderr).toBe("");
    expect(check.status).toBe(0);
  });
});
