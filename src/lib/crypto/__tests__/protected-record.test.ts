import { describe, expect, it } from "vitest";

import {
  deriveShopBlindIndex,
  openShopRecordField,
  sealShopRecordField,
} from "@/lib/crypto/protected-record";
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

class FakeProtectedRecordPrisma {
  readonly rows = new Map<string, StoredAuthorityRow>();

  readonly protectedKeyAuthority = {
    findUnique: async (args: {
      where: { purpose: string };
    }): Promise<StoredAuthorityRow | null> => {
      return this.rows.get(args.where.purpose) ?? null;
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
  };
}

const CONTEXT: ShopContext = Object.freeze({
  workspaceId: "11".repeat(16),
  installationId: "22".repeat(16),
  shopId: "shop-algiers",
  shopIncarnationId: "33".repeat(16),
  registryRevision: 3,
  databaseFileId: "shop-algiers.db",
  migrationSetSha256: "44".repeat(32),
});

const INSTALLATION_ROOT = Buffer.alloc(32, 0x77);
type RecordClient = Parameters<typeof sealShopRecordField>[0];

function client(fake: FakeProtectedRecordPrisma): RecordClient {
  return fake as unknown as RecordClient;
}

describe("canonical protected record codec", () => {
  it("round-trips under exact workspace/shop/incarnation/record/field binding", async () => {
    const fake = new FakeProtectedRecordPrisma();
    const reference = {
      recordType: "Customer",
      recordId: "customer-1",
      field: "name",
    } as const;
    const encoded = await sealShopRecordField(
      client(fake),
      "أمينة بن يوسف",
      reference,
      {
        shopContext: CONTEXT,
        installationRoot: INSTALLATION_ROOT,
      },
    );

    await expect(
      openShopRecordField(client(fake), encoded, reference, {
        shopContext: CONTEXT,
        installationRoot: INSTALLATION_ROOT,
      }),
    ).resolves.toBe("أمينة بن يوسف");
  });

  it("rejects record and field substitution", async () => {
    const fake = new FakeProtectedRecordPrisma();
    const encoded = await sealShopRecordField(
      client(fake),
      "0555123456",
      { recordType: "Order", recordId: "order-1", field: "phone" },
      {
        shopContext: CONTEXT,
        installationRoot: INSTALLATION_ROOT,
      },
    );

    await expect(
      openShopRecordField(
        client(fake),
        encoded,
        { recordType: "Order", recordId: "order-2", field: "phone" },
        {
          shopContext: CONTEXT,
          installationRoot: INSTALLATION_ROOT,
        },
      ),
    ).rejects.toMatchObject({ code: "PROTECTED_DATA_CONTEXT_MISMATCH" });
    await expect(
      openShopRecordField(
        client(fake),
        encoded,
        { recordType: "Order", recordId: "order-1", field: "address" },
        {
          shopContext: CONTEXT,
          installationRoot: INSTALLATION_ROOT,
        },
      ),
    ).rejects.toMatchObject({ code: "PROTECTED_DATA_CONTEXT_MISMATCH" });
  });

  it("keeps blind indexes deterministic only within one field context", async () => {
    const fake = new FakeProtectedRecordPrisma();
    const options = {
      shopContext: CONTEXT,
      installationRoot: INSTALLATION_ROOT,
    } as const;
    const first = await deriveShopBlindIndex(
      client(fake),
      " 0555123456 ",
      { recordType: "Customer", field: "phone" },
      options,
    );
    const second = await deriveShopBlindIndex(
      client(fake),
      "0555123456",
      { recordType: "Customer", field: "phone" },
      options,
    );
    const anotherField = await deriveShopBlindIndex(
      client(fake),
      "0555123456",
      { recordType: "Order", field: "phone" },
      options,
    );

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(anotherField).not.toBe(first);
  });

  it("prevents cross-shop blind-index correlation", async () => {
    // One SQLite file owns one shop key authority. Model the other shop with a
    // separate store rather than attempting to open Algiers authority under an
    // Oran binding in the same fake database.
    const algiers = new FakeProtectedRecordPrisma();
    const oran = new FakeProtectedRecordPrisma();
    const first = await deriveShopBlindIndex(
      client(algiers),
      "0555123456",
      { recordType: "Customer", field: "phone" },
      {
        shopContext: CONTEXT,
        installationRoot: INSTALLATION_ROOT,
      },
    );
    const otherShop: ShopContext = Object.freeze({
      ...CONTEXT,
      shopId: "shop-oran",
      shopIncarnationId: "55".repeat(16),
      databaseFileId: "shop-oran.db",
    });
    const second = await deriveShopBlindIndex(
      client(oran),
      "0555123456",
      { recordType: "Customer", field: "phone" },
      {
        shopContext: otherShop,
        installationRoot: INSTALLATION_ROOT,
      },
    );

    expect(second).not.toBe(first);
  });

  it("rejects legacy payloads at the canonical reader boundary", async () => {
    const fake = new FakeProtectedRecordPrisma();
    await expect(
      openShopRecordField(
        client(fake),
        '{"iv":"AA==","ciphertext":"AA==","tag":"AA=="}',
        { recordType: "Customer", recordId: "customer-1", field: "name" },
        {
          shopContext: CONTEXT,
          installationRoot: INSTALLATION_ROOT,
        },
      ),
    ).rejects.toThrow(/contextual envelope/);
  });
});
