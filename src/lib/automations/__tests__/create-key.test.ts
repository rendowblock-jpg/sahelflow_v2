import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  automationCreateKeyForDraft,
  isAutomationCreateKey,
  newAutomationCreateKey,
} from "@/lib/automations/create-key";

const UUID = "3f2b8c1e-9d4a-4b7e-8a61-0c5d2e9f7a14";

describe("the automation create key", () => {
  it("accepts a UUID and nothing else", () => {
    expect(isAutomationCreateKey(UUID)).toBe(true);
    expect(isAutomationCreateKey(UUID.toUpperCase())).toBe(true);
    for (const bad of ["", "abc", ` ${UUID}`, `${UUID} `, "3f2b8c1e9d4a4b7e8a610c5d2e9f7a14", `${UUID}0`, "zzzzzzzz-9d4a-4b7e-8a61-0c5d2e9f7a14", 42, null, undefined, {}]) {
      expect(isAutomationCreateKey(bad)).toBe(false);
    }
  });

  it("mints a fresh valid key every time", () => {
    const first = newAutomationCreateKey();
    const second = newAutomationCreateKey();
    expect(isAutomationCreateKey(first)).toBe(true);
    expect(isAutomationCreateKey(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it("keeps one key for retries of the same draft", () => {
    const mint = vi.fn(() => UUID);
    const first = automationCreateKeyForDraft(null, '{"name":"A"}', mint);
    const retry = automationCreateKeyForDraft(first, '{"name":"A"}', mint);
    expect(retry).toBe(first);
    expect(retry.key).toBe(UUID);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("mints a new key when the draft changed, because the server refuses a used key with other content", () => {
    const keys = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const mint = vi.fn(() => keys.shift()!);
    const first = automationCreateKeyForDraft(null, '{"name":"A"}', mint);
    const edited = automationCreateKeyForDraft(first, '{"name":"B"}', mint);
    expect(edited.key).not.toBe(first.key);
    expect(edited.fingerprint).toBe('{"name":"B"}');
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("mints a new key once the old one was discarded after success", () => {
    const keys = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const mint = vi.fn(() => keys.shift()!);
    const first = automationCreateKeyForDraft(null, '{"name":"A"}', mint);
    const afterSuccess = automationCreateKeyForDraft(null, '{"name":"A"}', mint);
    expect(afterSuccess.key).not.toBe(first.key);
  });
});

describe("how the two screens use it (source check, not a browser run)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the builder sends one key per draft on create only and drops it after success", () => {
    const source = read("src/components/automations/automation-builder.tsx");
    expect(source).toContain("automationCreateKeyForDraft(draftKeyRef.current");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("draftKeyRef.current = null");
    expect(source).toMatch(/isEdit \? payload : \{ \.\.\.payload, idempotencyKey/);
  });

  it("duplicate makes one key per click and is blocked while a request is pending", () => {
    const source = read("src/components/automations/automation-actions.tsx");
    expect(source).toContain("newAutomationCreateKey()");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("duplicatingRef.current");
    expect(source).toContain("disabled={repairRequired || loading}");
  });
});
