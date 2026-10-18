import { mkdtempSync, readFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/internal/launch-appearance/route";
import { RUNTIME_COOKIE, RUNTIME_LAUNCH_APPEARANCE_PATH } from "@/lib/runtime-auth";
import { LAUNCH_APPEARANCE_FILE } from "@/lib/runtime/launch-appearance";

const TOKEN = "c".repeat(64);
let dataDir: string;

function report(
  cookies: string[] = [`${RUNTIME_COOKIE}=${TOKEN}`],
  host = "127.0.0.1:4310",
): NextRequest {
  return new NextRequest(`http://${host}${RUNTIME_LAUNCH_APPEARANCE_PATH}`, {
    method: "POST",
    headers: cookies.length ? { cookie: cookies.join("; ") } : undefined,
  });
}

function stored(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dataDir, LAUNCH_APPEARANCE_FILE), "utf8"));
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "sf-launch-appearance-route-"));
  vi.stubEnv("SF_RUNTIME_APP_TOKEN", TOKEN);
  vi.stubEnv("SF_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/internal/launch-appearance", () => {
  it("records the language, colour mode and preset from the request's own cookies", async () => {
    const response = await POST(
      report([
        `${RUNTIME_COOKIE}=${TOKEN}`,
        "sahelflow-locale=ar",
        "sahelflow-theme=light",
        "sahelflow-theme-preset=dune",
      ]),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(stored()).toMatchObject({ locale: "ar", theme: "light", preset: "dune" });
  });

  it("follows the seller's latest choice on each report", async () => {
    const cookies = (theme: string, preset: string) => [
      `${RUNTIME_COOKIE}=${TOKEN}`,
      "sahelflow-locale=fr",
      `sahelflow-theme=${theme}`,
      `sahelflow-theme-preset=${preset}`,
    ];
    await POST(report(cookies("dark", "sahel")));
    expect(stored()).toMatchObject({ theme: "dark", preset: "sahel" });
    await POST(report(cookies("light", "oasis")));
    expect(stored()).toMatchObject({ theme: "light", preset: "oasis" });
  });

  it("never stores a cookie value it does not recognise", async () => {
    const response = await POST(
      report([
        `${RUNTIME_COOKIE}=${TOKEN}`,
        "sahelflow-locale=zz",
        "sahelflow-theme=%3Cscript%3E",
        "sahelflow-theme-preset=neon",
      ]),
    );
    expect(response.status).toBe(204);
    expect(stored()).toMatchObject({ locale: null, theme: null, preset: null });
    expect(readFileSync(join(dataDir, LAUNCH_APPEARANCE_FILE), "utf8")).not.toContain("script");
  });

  it("ignores any request body: the values come from cookies only", async () => {
    const request = new NextRequest(`http://127.0.0.1:4310${RUNTIME_LAUNCH_APPEARANCE_PATH}`, {
      method: "POST",
      headers: {
        cookie: [`${RUNTIME_COOKIE}=${TOKEN}`, "sahelflow-theme=dark"].join("; "),
        "content-type": "application/json",
      },
      body: JSON.stringify({ theme: "light", preset: "dune", locale: "ar" }),
    });
    expect((await POST(request)).status).toBe(204);
    expect(stored()).toMatchObject({ theme: "dark", preset: null, locale: null });
  });

  it("answers 401 and writes nothing without the per-launch runtime cookie", async () => {
    const response = await POST(report(["sahelflow-theme=light"]));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      status: "rejected",
      code: "RUNTIME_SESSION_REQUIRED",
    });
    expect(existsSync(join(dataDir, LAUNCH_APPEARANCE_FILE))).toBe(false);
  });

  it("answers 401 for a wrong or malformed runtime token", async () => {
    for (const supplied of ["d".repeat(64), "c".repeat(63), "not-hex-".repeat(8), ""]) {
      const response = await POST(report([`${RUNTIME_COOKIE}=${supplied}`]));
      expect(response.status).toBe(401);
    }
    expect(existsSync(join(dataDir, LAUNCH_APPEARANCE_FILE))).toBe(false);
  });

  it("is unavailable off loopback", async () => {
    const response = await POST(report(undefined, "shop.example.com"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "LAUNCH_APPEARANCE_UNAVAILABLE" });
    expect(existsSync(join(dataDir, LAUNCH_APPEARANCE_FILE))).toBe(false);
  });

  it("is unavailable outside the packaged runtime (no token or no data directory)", async () => {
    vi.stubEnv("SF_RUNTIME_APP_TOKEN", "");
    expect((await POST(report())).status).toBe(503);
    vi.stubEnv("SF_RUNTIME_APP_TOKEN", TOKEN);
    vi.stubEnv("SF_DATA_DIR", "");
    expect((await POST(report())).status).toBe(503);
    vi.stubEnv("SF_RUNTIME_APP_TOKEN", "short");
    vi.stubEnv("SF_DATA_DIR", dataDir);
    expect((await POST(report())).status).toBe(503);
  });

  it("answers 500 with a code when the record cannot be written", async () => {
    mkdirSync(join(dataDir, LAUNCH_APPEARANCE_FILE));
    const response = await POST(report([`${RUNTIME_COOKIE}=${TOKEN}`, "sahelflow-theme=dark"]));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      status: "blocked",
      code: "LAUNCH_APPEARANCE_PERSIST_FAILED",
    });
  });
});
