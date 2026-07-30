import { describe, expect, it } from "vitest";

import {
  clearManualOrderCommand,
  resolveManualOrderCommand,
  type CommandStorage,
} from "../manual-order-command-key";

class MemoryStorage implements CommandStorage {
  constructor(private readonly values = new Map<string, string>()) {}

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

describe("manual order command key persistence", () => {
  it("reuses one browser-scoped key across a reload", () => {
    const values = new Map<string, string>();
    const first = resolveManualOrderCommand(
      new MemoryStorage(values),
      "manual-order",
      '{"quantity":1}',
      () => "browser-scope-1",
    );
    const reloaded = resolveManualOrderCommand(
      new MemoryStorage(values),
      "manual-order",
      '{"quantity":1}',
      () => "must-not-replace",
    );

    expect(reloaded.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("keeps an in-flight key and its original request stable while the draft changes", () => {
    const storage = new MemoryStorage();
    const first = resolveManualOrderCommand(
      storage,
      "manual-order",
      '{"quantity":1}',
      () => "browser-scope-2",
    );
    const edited = resolveManualOrderCommand(
      storage,
      "manual-order",
      '{"quantity":2}',
      () => "must-not-replace",
    );

    expect(edited.idempotencyKey).toBe(first.idempotencyKey);
    expect(edited.requestJson).toBe('{"quantity":1}');
  });

  it("advances generation only after success clears the receipt", () => {
    const storage = new MemoryStorage();
    const first = resolveManualOrderCommand(
      storage,
      "manual-order",
      '{"quantity":1}',
      () => "browser-scope-3",
    );
    clearManualOrderCommand(storage, "manual-order");
    const next = resolveManualOrderCommand(
      storage,
      "manual-order",
      '{"quantity":1}',
      () => "must-not-replace",
    );

    expect(first.idempotencyKey).toMatch(/-0$/);
    expect(next.idempotencyKey).toMatch(/-1$/);
  });
});
