import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as api from "../index";

const DIR = join(process.cwd(), "src/lib/notifications/web-push");
const strip = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sources = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ f, text: strip(readFileSync(join(DIR, f), "utf8")) }));

describe("library hygiene", () => {
  it("has every module", () => {
    const names = sources.map((s) => s.f).sort();
    for (const expected of ["contract", "dispatcher", "encrypt", "index", "payload", "sender", "ssrf", "store", "util", "vapid"]) {
      expect(names).toContain(expected + ".ts");
    }
  });

  it("never logs, never reads the environment, never touches the network on its own", () => {
    for (const { f, text } of sources) {
      expect(text, f + " console").not.toMatch(/\bconsole\s*\./);
      expect(text, f + " process.env").not.toMatch(/process\s*\.\s*env/);
      expect(text, f + " global fetch").not.toMatch(/(?<![\w.])fetch\s*\(/);
      expect(text, f + " real endpoint path").not.toMatch(/\/fcm\/send\//);
    }
  });

  it("imports only node:crypto, zod and its own files", () => {
    for (const { f, text } of sources) {
      for (const m of text.matchAll(/from\s+"([^"]+)"/g)) {
        const target = m[1] ?? "";
        expect(target.startsWith("./") || target === "node:crypto" || target === "zod", f + " imports " + target).toBe(true);
      }
    }
  });

  it("avoids ES2023 array methods", () => {
    for (const { f, text } of sources) {
      expect(text, f).not.toMatch(/\.(findLast|findLastIndex|toSorted|toReversed|toSpliced)\s*\(/);
    }
  });

  it("exposes the public API from index.ts", () => {
    for (const name of [
      "encryptPayload", "buildVapidHeader", "generateVapidKeys", "assertPushEndpoint", "isAllowedPushEndpoint",
      "buildPayload", "serializePayload", "topicFor", "PUSH_KINDS", "PUSH_POLICY", "sendPush", "createDispatcher",
      "SubscriptionStore", "SubscriptionStoreError", "subscribeCommandSchema", "unsubscribeCommandSchema", "endpointHash",
    ]) {
      expect(Object.keys(api), name).toContain(name);
    }
  });
});
