import { describe, expect, it } from "vitest";

import { ProtectedDataCorruptionError } from "@/lib/crypto/protected-data-error";
import {
  resolveShopProtectedKey,
  rewrapShopProtectedKeys,
} from "@/lib/crypto/protected-key-authority";
import type { ShopContext } from "@/lib/shops/context";

interface StoredAuthorityRow {
  purpose: string;
  formatVersion: number;
  algorithm: string;
  keyVersion: number;
  keyId: string;
  wrappingKeyId: string;
  wrappedKey: string;
}

class FakeProtectedKeyPrisma {
  readonly rows = new Map<string, StoredAuthorityRow>();

  readonly protectedKeyAuthority = {
    findUnique: async (args: {
      where: { purpose: string };
    }): Promise<StoredAuthorityRow | null> => {
      return this.rows.get(args.where.purpose) ?? null;
    },
    findMany: async (): Promise<StoredAuthorityRow[]> => {
      return [...this.rows.values()].map((row) => ({ ...row }));
    },
    create: async (args: {
      data: StoredAuthorityRow;
    }): Promise<StoredAuthorityRow> => {
      if (this.rows.has(args.data.purpose)) {
        throw Object.assign(new Error("unique"), { code: "P2002" });
      }
      const row = { ...args.data };
      this.rows.set(row.purpose, row);
      return row;
    },
    update: async (args: {
      where: { purpose: string };
      data: Partial<StoredAuthorityRow>;
    }): Promise<StoredAuthorityRow> => {
      const row = this.rows.get(args.where.purpose);
      if (!row) throw new Error("missing authority row");
      Object.assign(row, args.data);
      return { ...row };
    },
  };
}

const CONTEXT: ShopContext = Object.freeze({
  workspaceId: "10".repeat(16),
  installationId: "20".repeat(16),
  shopId: "shop-algiers",
  shopIncarnationId: "30".repeat(16),
  registryRevision: 7,
  databaseFileId: "shop-algiers.db",
  migrationSetSha256: "40".repeat(32),
});

const INSTALLATION_ROOT = Buffer.alloc(32, 0x55);
const NEXT_INSTALLATION_ROOT = Buffer.alloc(32, 0x66);

type AuthorityClient = Parameters<typeof resolveShopProtectedKey>[0];

function client(fake: FakeProtectedKeyPrisma): AuthorityClient {
  return fake as unknown as AuthorityClient;
}

describe("protected shop key authority", () => {
  it("creates one wrapped random key and reopens the same authority", async () => {
    const fake = new FakeProtectedKeyPrisma();

    const first = await resolveShopProtectedKey(client(fake), "shop-data", {
      shopContext: CONTEXT,
      installationRoot: INSTALLATION_ROOT,
    });
    const second = await resolveShopProtectedKey(client(fake), "shop-data", {
      shopContext: CONTEXT,
      installationRoot: INSTALLATION_ROOT,
    });

    expect(first.key.equals(second.key)).toBe(true);
    expect(first.descriptor).toEqual(second.descriptor);
    expect(fake.rows.get("shop-data")?.wrappedKey).not.toContain(
      first.key.toString("hex"),
    );
    expect(first.descriptor.keyId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("separates data, blind-index, and secret-store keys", async () => {
    const fake = new FakeProtectedKeyPrisma();
    const keys = await Promise.all(
      (["shop-data", "shop-blind-index", "shop-secret"] as const).map(
        (purpose) =>
          resolveShopProtectedKey(client(fake), purpose, {
            shopContext: CONTEXT,
            installationRoot: INSTALLATION_ROOT,
          }),
      ),
    );

    expect(new Set(keys.map((entry) => entry.key.toString("hex"))).size).toBe(3);
    expect(new Set(keys.map((entry) => entry.descriptor.keyId)).size).toBe(3);
    expect(new Set(keys.map((entry) => entry.wrappingKeyId)).size).toBe(3);
  });

  it("re-wraps every shop key without changing its identity", async () => {
    const fake = new FakeProtectedKeyPrisma();
    const before = await Promise.all(
      (["shop-data", "shop-blind-index", "shop-secret"] as const).map(
        (purpose) =>
          resolveShopProtectedKey(client(fake), purpose, {
            shopContext: CONTEXT,
            installationRoot: INSTALLATION_ROOT,
          }),
      ),
    );
    const beforeIds = before.map((entry) => entry.descriptor.keyId);
    const beforeWrapping = before.map((entry) => entry.wrappingKeyId);

    await expect(
      rewrapShopProtectedKeys(
        client(fake),
        CONTEXT,
        INSTALLATION_ROOT,
        NEXT_INSTALLATION_ROOT,
      ),
    ).resolves.toEqual({ total: 3, rewrapped: 3, alreadyCurrent: 0 });

    const after = await Promise.all(
      (["shop-data", "shop-blind-index", "shop-secret"] as const).map(
        (purpose) =>
          resolveShopProtectedKey(client(fake), purpose, {
            shopContext: CONTEXT,
            installationRoot: NEXT_INSTALLATION_ROOT,
            createIfMissing: false,
          }),
      ),
    );
    expect(after.map((entry) => entry.descriptor.keyId)).toEqual(beforeIds);
    expect(after.map((entry) => entry.wrappingKeyId)).not.toEqual(beforeWrapping);

    await expect(
      rewrapShopProtectedKeys(
        client(fake),
        CONTEXT,
        INSTALLATION_ROOT,
        NEXT_INSTALLATION_ROOT,
      ),
    ).resolves.toEqual({ total: 3, rewrapped: 0, alreadyCurrent: 3 });
  });

  it("dry-run verifies old authority without modifying it", async () => {
    const fake = new FakeProtectedKeyPrisma();
    await resolveShopProtectedKey(client(fake), "shop-data", {
      shopContext: CONTEXT,
      installationRoot: INSTALLATION_ROOT,
    });
    const before = { ...fake.rows.get("shop-data")! };

    await expect(
      rewrapShopProtectedKeys(
        client(fake),
        CONTEXT,
        INSTALLATION_ROOT,
        NEXT_INSTALLATION_ROOT,
        true,
      ),
    ).resolves.toEqual({ total: 1, rewrapped: 1, alreadyCurrent: 0 });
    expect(fake.rows.get("shop-data")).toEqual(before);
  });

  it("rejects a replacement installation until explicit re-wrapping", async () => {
    const fake = new FakeProtectedKeyPrisma();
    await resolveShopProtectedKey(client(fake), "shop-data", {
      shopContext: CONTEXT,
      installationRoot: INSTALLATION_ROOT,
    });

    const replacement: ShopContext = Object.freeze({
      ...CONTEXT,
      installationId: "60".repeat(16),
    });

    await expect(
      resolveShopProtectedKey(client(fake), "shop-data", {
        shopContext: replacement,
        installationRoot: INSTALLATION_ROOT,
      }),
    ).rejects.toBeInstanceOf(ProtectedDataCorruptionError);
  });

  it("rejects tampered wrapped key material", async () => {
    const fake = new FakeProtectedKeyPrisma();
    await resolveShopProtectedKey(client(fake), "shop-secret", {
      shopContext: CONTEXT,
      installationRoot: INSTALLATION_ROOT,
    });
    const row = fake.rows.get("shop-secret");
    if (!row) throw new Error("missing test row");
    const envelope = JSON.parse(row.wrappedKey) as { ciphertext: string };
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 1;
    envelope.ciphertext = ciphertext.toString("base64");
    row.wrappedKey = JSON.stringify(envelope);

    await expect(
      resolveShopProtectedKey(client(fake), "shop-secret", {
        shopContext: CONTEXT,
        installationRoot: INSTALLATION_ROOT,
      }),
    ).rejects.toMatchObject({
      code: "PROTECTED_DATA_AUTHENTICATION_FAILED",
    });
  });

  it("fails when persisted key identity is inconsistent", async () => {
    const fake = new FakeProtectedKeyPrisma();
    await resolveShopProtectedKey(client(fake), "shop-blind-index", {
      shopContext: CONTEXT,
      installationRoot: INSTALLATION_ROOT,
    });
    const row = fake.rows.get("shop-blind-index");
    if (!row) throw new Error("missing test row");
    row.keyId = "00".repeat(32);

    await expect(
      resolveShopProtectedKey(client(fake), "shop-blind-index", {
        shopContext: CONTEXT,
        installationRoot: INSTALLATION_ROOT,
      }),
    ).rejects.toMatchObject({ code: "PROTECTED_DATA_KEY_MISMATCH" });
  });
});
