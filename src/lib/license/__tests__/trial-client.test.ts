import { afterEach, describe, expect, it, vi } from "vitest";

import type { ShopContext } from "@/lib/shops/context";
import { SahelFlowError } from "@/types/errors";
import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
} from "../entitlement-canonical";
import { requestOnlineTrial } from "../trial-client";

const ORIGINAL_ENV = {
  SF_LICENSE_SERVICE_URL: process.env.SF_LICENSE_SERVICE_URL,
  SF_DEVICE_BINDING: process.env.SF_DEVICE_BINDING,
  APP_VERSION: process.env.APP_VERSION,
};

const shop = {
  workspaceId: "1".repeat(32),
  installationId: "2".repeat(32),
} as ShopContext;

function entitlement() {
  return {
    claims: {
      domain: LICENSE_ENTITLEMENT_DOMAIN,
      formatVersion: LICENSE_ENTITLEMENT_FORMAT,
      licenseId: "trial_test_001",
      workspaceId: shop.workspaceId,
      installationId: shop.installationId,
      deviceBinding: `sfdb1_${"a".repeat(64)}`,
      productMajor: 1,
      type: "trial",
      issuedAt: "2026-08-10T12:00:00.000Z",
      expiresAt: "2026-08-17T12:00:00.000Z",
      supportEndsAt: "2026-08-17T12:00:00.000Z",
      shopSlots: 1,
      memberLimit: 25,
      deviceLimit: 1,
      backupBytes: 20_000_000_000,
      mediaBytes: 0,
      features: ["sahelflow.complete"],
      transferState: "active",
      transferEpoch: 0,
      recoveryEpoch: 0,
      revocationEpoch: 0,
      keyId: "trial_test_001",
      issuer: "trial-service",
    },
    signature: "A".repeat(64),
  } as const;
}

function configure() {
  process.env.SF_LICENSE_SERVICE_URL =
    "https://license-primary.example|https://license-recovery.example";
  process.env.SF_DEVICE_BINDING = `sfdb1_${"a".repeat(64)}`;
  process.env.APP_VERSION = "1.0.0-internal.14";
}

function restore(name: keyof typeof ORIGINAL_ENV) {
  const value = ORIGINAL_ENV[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("SF_LICENSE_SERVICE_URL");
  restore("SF_DEVICE_BINDING");
  restore("APP_VERSION");
  vi.restoreAllMocks();
});

describe("resilient online trial transport", () => {
  it("falls back from a primary transport timeout to the recovery origin", async () => {
    configure();
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://license-primary.example")) {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      }
      return Response.json(entitlement());
    }) as unknown as typeof fetch;

    await expect(requestOnlineTrial(shop, fetcher)).resolves.toMatchObject({
      claims: { licenseId: "trial_test_001" },
    });
    expect(calls).toEqual([
      "https://license-primary.example/v1/trials",
      "https://license-recovery.example/v1/trials",
    ]);
  });

  it("falls back on route/provider HTTP failures and malformed responses", async () => {
    configure();
    for (const primaryResponse of [
      new Response("missing", { status: 404 }),
      new Response("down", { status: 503 }),
      Response.json({ unexpected: true }),
    ]) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(primaryResponse)
        .mockResolvedValueOnce(Response.json(entitlement())) as unknown as typeof fetch;

      await expect(requestOnlineTrial(shop, fetcher)).resolves.toMatchObject({
        claims: { type: "trial" },
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  it("never uses recovery to bypass a rate limit", async () => {
    configure();
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: "rate_limited" }), {
        status: 429,
        headers: { "Retry-After": "60" },
      }),
    ) as unknown as typeof fetch;

    await expect(requestOnlineTrial(shop, fetcher)).rejects.toMatchObject({
      code: "LICENSE_TRIAL_RATE_LIMITED",
      statusCode: 429,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never uses recovery to bypass a business/input rejection", async () => {
    configure();
    const fetcher = vi.fn(async () =>
      Response.json({ error: "invalid_request" }, { status: 400 }),
    ) as unknown as typeof fetch;

    await expect(requestOnlineTrial(shop, fetcher)).rejects.toMatchObject({
      code: "LICENSE_TRIAL_ISSUANCE_FAILED",
      statusCode: 409,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports privacy-safe failure classes after both routes are exhausted", async () => {
    configure();
    const dnsError = Object.assign(new Error("lookup failed"), { code: "ENOTFOUND" });
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(dnsError)
      .mockRejectedValueOnce(Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" })) as unknown as typeof fetch;

    try {
      await requestOnlineTrial(shop, fetcher);
      throw new Error("expected requestOnlineTrial to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SahelFlowError);
      expect(error).toMatchObject({
        code: "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
        statusCode: 503,
      });
      expect((error as Error).message).toContain("primary:dns");
      expect((error as Error).message).toContain("recovery:connect");
      expect((error as Error).message).not.toContain(shop.workspaceId);
      expect((error as Error).message).not.toContain(shop.installationId);
    }
  });

  it("keeps a single configured route working for development and historical evidence harnesses", async () => {
    configure();
    process.env.SF_LICENSE_SERVICE_URL = "https://license-primary.example";
    const fetcher = vi.fn(async () => Response.json(entitlement())) as unknown as typeof fetch;

    await expect(requestOnlineTrial(shop, fetcher)).resolves.toMatchObject({
      claims: { licenseId: "trial_test_001" },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed packaged route sets", async () => {
    configure();
    for (const value of [
      "https://primary.example|",
      "https://primary.example| https://recovery.example",
      "https://one.example|https://two.example|https://three.example",
    ]) {
      process.env.SF_LICENSE_SERVICE_URL = value;
      await expect(
        requestOnlineTrial(shop, vi.fn() as unknown as typeof fetch),
      ).rejects.toMatchObject({
        code: "LICENSE_TRIAL_SERVICE_UNAVAILABLE",
        statusCode: 503,
      });
    }
  });
});
