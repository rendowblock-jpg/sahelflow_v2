import { describe, expect, it } from "vitest";

import {
  clearManualOrderCommand,
  manualOrderCommandStorageKey,
  resolveManualOrderCommand,
  type CommandStorage,
} from "../manual-order-command-key";

class MemoryStorage implements CommandStorage {
  constructor(
    private readonly values: Map<string, string> = new Map<string, string>(),
  ) {}

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const baseKey = "manual-order-command";
const request = '{"customerId":"c1","items":[{"productId":"p1","quantity":1}]}';

describe("manual order command key persistence", () => {
  it("reuses the same browser-scoped key after a reload", () => {
    const shared = new Map<string, string>();
    const firstTab = new MemoryStorage(shared);
    const reloadedTab = new MemoryStorage(shared);

    const first = resolveManualOrderCommand(
      firstTab,
      baseKey,
      request,
      () => "browser-scope-first",
    );
    const afterReload = resolveManualOrderCommand(
      reloadedTab,
      baseKey,
      request,
      () => "must-not-replace-scope",
    );

    expect(afterReload).toEqual(first);
    expect(first.idempotencyKey).toMatch(
      /^manual-create-browser-scope-first-[0-9a-f]{32}-0$/,
    );
  });

  it("keeps the same key when an in-flight draft is edited", () => {
    const storage = new MemoryStorage();
    const first = resolveManualOrderCommand(
      storage,
      baseKey,
      '{"quantity":1}',
      () => "browser-scope-edit",
    );
    const edited = resolveManualOrderCommand(
      storage,
      baseKey,
      '{"quantity":2}',
      () => "must-not-be-used",
    );

    expect(edited.idempotencyKey).toBe(first.idempotencyKey);
    expect(edited.requestJson).toBe('{"quantity":2}');
  });

  it("advances the generation after a successful response", () => {
    const storage = new MemoryStorage();
    const scope = "browser-scope-generation";
    const first = resolveManualOrderCommand(
      storage,
      baseKey,
      request,
      () => scope,
    );
    clearManualOrderCommand(storage, baseKey);
    const next = resolveManualOrderCommand(
      storage,
      baseKey,
      request,
      () => "must-not-replace-scope",
    );

    expect(first.idempotencyKey).toMatch(/-0$/);
    expect(next.idempotencyKey).toMatch(/-1$/);
    expect(next.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(
      storage.getItem(
        manualOrderCommandStorageKey(baseKey, request, 0, scope),
      ),
    ).toBeNull();
  });

  it("gives tabs sharing one restored browser draft the same key", () => {
    const shared = new Map<string, string>();
    const tabA = new MemoryStorage(shared);
    const tabB = new MemoryStorage(shared);

    const receiptA = resolveManualOrderCommand(
      tabA,
      baseKey,
      request,
      () => "shared-browser-scope",
    );
    const receiptB = resolveManualOrderCommand(
      tabB,
      baseKey,
      request,
      () => "must-not-replace-scope",
    );

    expect(receiptB.idempotencyKey).toBe(receiptA.idempotencyKey);

    clearManualOrderCommand(tabB, baseKey);
    const recoveredA = resolveManualOrderCommand(
      tabA,
      baseKey,
      request,
      () => "must-not-be-used",
    );
    expect(recoveredA.idempotencyKey).toBe(receiptA.idempotencyKey);

    const newTab = new MemoryStorage(shared);
    const newOrder = resolveManualOrderCommand(
      newTab,
      baseKey,
      request,
      () => "must-not-replace-scope",
    );
    expect(newOrder.idempotencyKey).toMatch(/-1$/);
  });

  it("does not replay identical content from another browser profile or cleared storage", () => {
    const browserA = new MemoryStorage(new Map());
    const browserB = new MemoryStorage(new Map());

    const receiptA = resolveManualOrderCommand(
      browserA,
      baseKey,
      request,
      () => "browser-profile-a",
    );
    const receiptB = resolveManualOrderCommand(
      browserB,
      baseKey,
      request,
      () => "browser-profile-b",
    );

    expect(receiptB.idempotencyKey).not.toBe(receiptA.idempotencyKey);
    expect(receiptA.idempotencyKey).toContain("browser-profile-a");
    expect(receiptB.idempotencyKey).toContain("browser-profile-b");
  });

  it("keeps distinct drafts isolated within one browser scope", () => {
    const shared = new Map<string, string>();
    const tabA = new MemoryStorage(shared);
    const tabB = new MemoryStorage(shared);
    const requestA = '{"customerId":"a","quantity":1}';
    const requestB = '{"customerId":"b","quantity":2}';
    const scope = "shared-distinct-scope";

    const receiptA = resolveManualOrderCommand(
      tabA,
      baseKey,
      requestA,
      () => scope,
    );
    const receiptB = resolveManualOrderCommand(
      tabB,
      baseKey,
      requestB,
      () => "must-not-replace-scope",
    );

    expect(receiptB.idempotencyKey).not.toBe(receiptA.idempotencyKey);
    clearManualOrderCommand(tabB, baseKey);
    expect(
      shared.get(
        manualOrderCommandStorageKey(baseKey, requestA, 0, scope),
      ),
    ).toContain(receiptA.idempotencyKey);
  });
});
