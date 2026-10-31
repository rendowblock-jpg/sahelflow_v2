import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { pairingButtonPlacement } from "@/components/inbox/inbox-link-state";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("pairingButtonPlacement: where the Connect WhatsApp button lives", () => {
  const rows: Array<[string, Parameters<typeof pairingButtonPlacement>[0], "banner" | "header" | "none"]> = [
    ["waiting for a scan, seller may manage: the banner owns it", { status: "qr", reachable: true, canManage: true }, "banner"],
    ["waiting for a scan, service answer not known yet: the banner owns it", { status: "qr", reachable: null, canManage: true }, "banner"],
    ["waiting for a scan, seller may NOT manage: the header keeps its own (as before)", { status: "qr", reachable: true, canManage: false }, "header"],
    ["link lost but the service answers: Connect stays in the header", { status: "disconnected", reachable: true, canManage: true }, "header"],
    ["connected: Connect stays in the header", { status: "connected", reachable: true, canManage: true }, "header"],
    ["status not known yet: Connect stays in the header", { status: null, reachable: null, canManage: true }, "header"],
    ["the WhatsApp service does not answer: Connect cannot help, only Retry can", { status: "disconnected", reachable: false, canManage: true }, "none"],
    ["the service does not answer while a QR was waiting: still no Connect", { status: "qr", reachable: false, canManage: true }, "none"],
    ["the service does not answer, seller may not manage: still no Connect", { status: "connected", reachable: false, canManage: false }, "none"],
  ];
  it.each(rows)("%s", (_name, input, want) => {
    expect(pairingButtonPlacement(input)).toBe(want);
  });
});

describe("the header asks the pure function instead of writing its own rule", () => {
  const header = read("src/components/inbox/inbox-v3-header.tsx");
  it("imports and calls pairingButtonPlacement", () => {
    expect(header).toContain("pairingButtonPlacement");
  });
  it("draws the Connect dialog only when the placement is 'header'", () => {
    expect(header).toMatch(/placement\s*===\s*"header"[\s\S]{0,80}<WhatsAppPairingDialog/);
  });
});
