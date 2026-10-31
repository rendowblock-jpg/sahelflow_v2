import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REJECTION_REASONS } from "@/lib/orders/rejection-reasons";
import {
  COMMAND_EXPIRY_MS,
  COMMAND_KINDS,
  COMMAND_LABELS,
  COMMAND_PERMISSIONS,
  COMMAND_RESULT_TTL_MS,
  CONVERSATIONS_PLAINTEXT_BUDGET,
  FRESH_MS,
  ORDERS_PLAINTEXT_BUDGET,
  PROJECTION_KINDS,
  PROJECTION_TTL_MS,
  REJECT_REASON_KEYS,
  SEAL_HARD_LIMIT,
  STALE_MS,
  commandPermitted,
  isCommandKind,
  isProjectionKind,
  projectionMessageType,
} from "./contracts";

const HOUR = 60 * 60_000;
const readText = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

// "15 * 60_000" -> 900000 (the phone and desktop files hold these as products).
function constMs(text: string, name: string): number {
  const m = new RegExp(`const ${name} = ([0-9_ *]+);`).exec(text);
  if (!m) throw new Error(`${name} not found`);
  return (m[1] ?? "")
    .split("*")
    .map((part) => Number(part.trim().replace(/_/g, "")))
    .reduce((a, b) => a * b, 1);
}

describe("connected-platform contracts", () => {
  it("lists the three projection kinds and maps them to relay message types", () => {
    expect([...PROJECTION_KINDS]).toEqual(["dashboard", "orders", "conversations"]);
    expect(projectionMessageType("orders")).toBe("projection.orders");
    for (const kind of PROJECTION_KINDS) {
      // protocol.ts accepts messageType matching this pattern.
      expect(projectionMessageType(kind)).toMatch(/^projection\.[a-z][a-z0-9._-]{2,94}$/);
      expect(isProjectionKind(kind)).toBe(true);
    }
    expect(isProjectionKind("alerts")).toBe(false);
  });

  it("every command kind has permissions, an expiry and a label, and nothing else", () => {
    expect([...COMMAND_KINDS]).toEqual([
      "command.comments.write",
      "command.orders.confirm",
      "command.orders.reject",
      "command.messages.reply",
    ]);
    for (const table of [COMMAND_PERMISSIONS, COMMAND_EXPIRY_MS, COMMAND_LABELS]) {
      expect(Object.keys(table).sort()).toEqual([...COMMAND_KINDS].sort());
    }
    for (const kind of COMMAND_KINDS) {
      expect(COMMAND_PERMISSIONS[kind].all.length).toBeGreaterThan(0);
      expect(Number.isInteger(COMMAND_EXPIRY_MS[kind])).toBe(true);
      expect(COMMAND_EXPIRY_MS[kind]).toBeGreaterThan(0);
      expect(COMMAND_LABELS[kind].length).toBeGreaterThan(0);
      expect(isCommandKind(kind)).toBe(true);
    }
    expect(isCommandKind("command.orders.delete")).toBe(false);
    expect(COMMAND_LABELS["command.comments.write"]).toBe("note");
  });

  it("maps each kind to the permissions the server rules need (reply needs two)", () => {
    expect(COMMAND_PERMISSIONS["command.orders.confirm"].all).toEqual(["orders.update"]);
    expect(COMMAND_PERMISSIONS["command.orders.reject"].all).toEqual(["orders.update"]);
    expect(COMMAND_PERMISSIONS["command.messages.reply"].all).toEqual([
      "conversations.reply",
      "customers.contact.read",
    ]);
    expect(COMMAND_PERMISSIONS["command.comments.write"].all).toEqual(["comments.write"]);
    expect(COMMAND_PERMISSIONS["command.comments.write"].anyOf).toEqual([
      "orders.read",
      "conversations.read",
    ]);
  });

  it("commandPermitted needs ALL of `all` and one of `anyOf`", () => {
    expect(commandPermitted("command.orders.confirm", ["orders.update"])).toBe(true);
    expect(commandPermitted("command.orders.confirm", ["orders.read"])).toBe(false);
    expect(commandPermitted("command.messages.reply", ["conversations.reply"])).toBe(false);
    expect(commandPermitted("command.messages.reply", ["customers.contact.read"])).toBe(false);
    expect(
      commandPermitted("command.messages.reply", ["conversations.reply", "customers.contact.read"]),
    ).toBe(true);
    expect(commandPermitted("command.comments.write", ["comments.write"])).toBe(false);
    expect(commandPermitted("command.comments.write", ["comments.write", "orders.read"])).toBe(true);
    expect(commandPermitted("command.comments.write", ["comments.write", "conversations.read"])).toBe(true);
    expect(commandPermitted("command.comments.write", ["orders.read"])).toBe(false);
  });

  it("orders expiry as reply < confirm = reject < note, with the agreed hours", () => {
    const e = COMMAND_EXPIRY_MS;
    expect(e["command.messages.reply"]).toBe(4 * HOUR);
    expect(e["command.orders.confirm"]).toBe(12 * HOUR);
    expect(e["command.orders.reject"]).toBe(12 * HOUR);
    expect(e["command.comments.write"]).toBe(24 * HOUR);
    expect(e["command.messages.reply"]).toBeLessThan(e["command.orders.confirm"]);
    expect(e["command.orders.confirm"]).toBe(e["command.orders.reject"]);
    expect(e["command.orders.reject"]).toBeLessThan(e["command.comments.write"]);
  });

  it("keeps result and projection lifetimes", () => {
    expect(COMMAND_RESULT_TTL_MS).toBe(24 * HOUR);
    expect(PROJECTION_TTL_MS).toBe(15 * 60_000);
    // A result must outlive the shortest command it answers.
    expect(COMMAND_RESULT_TTL_MS).toBeGreaterThanOrEqual(COMMAND_EXPIRY_MS["command.messages.reply"]);
  });

  it("keeps freshness equal to the phone's own constants", () => {
    const phone = readText("../../../control-plane/pwa/src/today/projection.ts");
    expect(FRESH_MS).toBe(constMs(phone, "FRESH_MS"));
    // The phone file calls the 24 h offline window OFFLINE_WINDOW_MS.
    expect(STALE_MS).toBe(constMs(phone, "OFFLINE_WINDOW_MS"));
    expect(FRESH_MS).toBe(15 * 60_000);
    expect(STALE_MS).toBe(24 * HOUR);
  });

  it("keeps the projection lifetime equal to the desktop publisher's", () => {
    const desktop = readText("./desktop-projection.ts");
    expect(PROJECTION_TTL_MS).toBe(constMs(desktop, "PROJECTION_TTL_MS"));
  });

  it("holds the size budgets under the relay's 512 KB base64 cap", () => {
    expect(ORDERS_PLAINTEXT_BUDGET).toBe(60 * 1024);
    expect(CONVERSATIONS_PLAINTEXT_BUDGET).toBe(150 * 1024);
    expect(SEAL_HARD_LIMIT).toBe(250 * 1024);
    expect(ORDERS_PLAINTEXT_BUDGET).toBeLessThan(CONVERSATIONS_PLAINTEXT_BUDGET);
    expect(CONVERSATIONS_PLAINTEXT_BUDGET).toBeLessThan(SEAL_HARD_LIMIT);
    expect(Math.ceil(SEAL_HARD_LIMIT / 3) * 4).toBeLessThan(512 * 1024);
  });

  it("is a dependency-free file (the phone and the Cloudflare worker import it)", () => {
    const code = readText("./contracts.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bimport\b/);
    expect(code).not.toMatch(/\brequire\s*\(/);
    expect(code).not.toMatch(/\bfrom\s+["']/);
  });

  it("copies the server's rejection reason keys, in order", () => {
    expect([...REJECT_REASON_KEYS]).toEqual(REJECTION_REASONS.map((reason) => reason.key));
  });

  it("is a superset of what the relay allow-list accepts today", () => {
    const policy = readText("./command-policy.ts");
    const block = /EXECUTABLE_COMMAND_KINDS = Object\.freeze\(\[([\s\S]*?)\]/.exec(policy);
    expect(block).not.toBeNull();
    const kinds = [...(block?.[1] ?? "").matchAll(/"([a-z.]+)"/g)].map((m) => m[1]);
    expect(kinds.length).toBeGreaterThan(0);
    for (const kind of kinds) {
      expect(COMMAND_KINDS as readonly string[]).toContain(kind);
    }
  });
});
