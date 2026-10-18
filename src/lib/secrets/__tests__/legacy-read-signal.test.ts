/**
 * S01b-12: reading a legacy-generation secret row (opened with the installation
 * root, readable only as migration input) leaves a counted, secret-free signal so
 * the sunset of the legacy path can be seen. Behaviour of getSecret is unchanged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const info = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info, warn: vi.fn(), error: vi.fn() },
}));

import { encryptString } from "@/lib/crypto/field-crypto";
import {
  getLegacyGenerationReadCounts,
  resetLegacyGenerationReadCountsForTests,
} from "@/lib/crypto/legacy-generation-diagnostics";
import { getMasterKey, _resetMasterKeyCacheForTests } from "@/lib/crypto/master-key";
import type { ServiceContext } from "@/lib/data/service-base";
import { getSecret } from "../index";

const SECRET_VALUE = "sf-test-secret-value-9c2e";
const SECRET_NAME = "sf-test-secret-name";

function legacyContext(): ServiceContext {
  const payload = encryptString(SECRET_VALUE, getMasterKey());
  const row = {
    key: SECRET_NAME,
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    tag: payload.tag,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
  return {
    prisma: { secret: { findUnique: async () => row } },
  } as unknown as ServiceContext;
}

function missingContext(): ServiceContext {
  return {
    prisma: { secret: { findUnique: async () => null } },
  } as unknown as ServiceContext;
}

beforeEach(() => {
  _resetMasterKeyCacheForTests();
  info.mockClear();
  resetLegacyGenerationReadCountsForTests();
});

describe("legacy-generation read signal (S01b-12)", () => {
  it("still opens the legacy row", async () => {
    await expect(getSecret(legacyContext(), SECRET_NAME)).resolves.toBe(SECRET_VALUE);
  });

  it("counts a legacy secret read and logs the first one without any secret material", async () => {
    await getSecret(legacyContext(), SECRET_NAME);
    expect(getLegacyGenerationReadCounts()).toEqual({ secret_row: 1 });
    expect(info).toHaveBeenCalledTimes(1);
    const [message, fields] = info.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toBe("protected_data.legacy_generation_read");
    expect(fields).toEqual({ kind: "secret_row", count: 1 });
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain(SECRET_VALUE);
    expect(logged).not.toContain(SECRET_NAME);
  });

  it("keeps counting but logs only the first read and every hundredth", async () => {
    const context = legacyContext();
    for (let index = 0; index < 100; index += 1) {
      await getSecret(context, SECRET_NAME);
    }
    expect(getLegacyGenerationReadCounts()).toEqual({ secret_row: 100 });
    const counts = info.mock.calls.map((call) => (call[1] as { count: number }).count);
    expect(counts).toEqual([1, 100]);
  });

  it("does not count a missing secret", async () => {
    await expect(getSecret(missingContext(), SECRET_NAME)).resolves.toBeNull();
    expect(getLegacyGenerationReadCounts()).toEqual({});
    expect(info).not.toHaveBeenCalled();
  });
});
