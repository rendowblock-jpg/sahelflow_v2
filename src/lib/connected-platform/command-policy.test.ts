import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  EXECUTABLE_COMMAND_KINDS,
  isRemoteCommandType,
  remoteCommandTypesForPermissions,
} from "./command-policy";
import { COMMAND_KINDS } from "./contracts";

describe("command policy", () => {
  it("lets through the four phone commands and nothing else", () => {
    expect([...EXECUTABLE_COMMAND_KINDS].sort()).toEqual([...COMMAND_KINDS].sort());
    expect(isRemoteCommandType("command.orders.confirm")).toBe(true);
    expect(isRemoteCommandType("command.orders.delete")).toBe(false);
    expect(isRemoteCommandType(42)).toBe(false);
  });

  it("gives a member only the kinds the member's rights cover", () => {
    expect(remoteCommandTypesForPermissions(["orders.update"])).toEqual([
      "command.orders.confirm",
      "command.orders.reject",
    ]);
    expect(remoteCommandTypesForPermissions(["comments.write", "orders.read"])).toEqual(["command.comments.write"]);
    expect(remoteCommandTypesForPermissions(["orders.read"])).toEqual([]);
  });

  it("a reply needs BOTH conversations.reply and customers.contact.read", () => {
    expect(remoteCommandTypesForPermissions(["conversations.reply"])).toEqual([]);
    expect(remoteCommandTypesForPermissions(["customers.contact.read"])).toEqual([]);
    expect(remoteCommandTypesForPermissions(["conversations.reply", "customers.contact.read"])).toEqual([
      "command.messages.reply",
    ]);
  });

  it("is bundled by the relay: its only import is the dependency-free contracts file", () => {
    const code = readFileSync(join(__dirname, "command-policy.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const imports = [...code.matchAll(/^import\s.*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["../identity/permissions", "./contracts"]);
    expect(code).not.toMatch(/node:|@\//);
  });
});
