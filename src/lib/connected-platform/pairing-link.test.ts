import { beforeAll, describe, expect, it } from "vitest";

import {
  PAIRING_TTL_MS,
  PHONE_APP_ORIGIN,
  buildDesktopPairingLink,
  pairingCountdown,
  parseDesktopPairingHash,
  parseTypingCode,
} from "./pairing-link";
import { base64Encode } from "./web/bytes";
import { deviceFingerprint } from "./web/fingerprint";

const subtle = globalThis.crypto.subtle;
const PAIRING_ID = "pair_0123456789abcdef0123456789abcdef";
const TOKEN = "A".repeat(43);
let signingKey = "";
let pin = "";

beforeAll(async () => {
  const pair = (await subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  signingKey = base64Encode(new Uint8Array(await subtle.exportKey("raw", pair.publicKey)));
  pin = (await deviceFingerprint(signingKey)) as string;
});

describe("buildDesktopPairingLink", () => {
  it("is the origin plus a fragment of exactly three segments and nothing else", async () => {
    const built = await buildDesktopPairingLink({ pairingId: PAIRING_ID, pairingToken: TOKEN, desktopSigningPublicKey: signingKey });
    expect(built).not.toBeNull();
    const url = new URL(built?.link ?? "");
    expect(`${url.origin}`).toBe(PHONE_APP_ORIGIN);
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("");
    expect(url.username + url.password).toBe("");
    expect(url.hash).toBe(`#p=${PAIRING_ID}.${TOKEN}.${pin.replaceAll("-", "")}`);
    expect(url.hash.slice(3).split(".")).toHaveLength(3);
    expect(built?.link.startsWith(`${PHONE_APP_ORIGIN}/#p=`)).toBe(true);
    expect(built?.link.split("#")).toHaveLength(2);
    expect(built?.link.includes(signingKey)).toBe(false);
    expect(built?.pin).toBe(pin);
  });

  it("round-trips through the strict parser, and pin is upper case with dashes", async () => {
    const built = await buildDesktopPairingLink({ pairingId: PAIRING_ID, pairingToken: TOKEN, desktopSigningPublicKey: signingKey });
    expect(parseDesktopPairingHash(built?.hash ?? "")).toEqual({ pairingId: PAIRING_ID, pairingToken: TOKEN, pin });
    expect(parseDesktopPairingHash((built?.hash ?? "").toLowerCase())).toBeNull();
  });

  it.each([
    ["http origin", "http://app.sahelflow.com"],
    ["origin with a path", "https://app.sahelflow.com/x"],
    ["origin with a query", "https://app.sahelflow.com?a=1"],
    ["origin with credentials", "https://user:pw@app.sahelflow.com"],
    ["origin with a trailing slash", "https://app.sahelflow.com/"],
    ["empty origin", ""],
  ])("refuses %s", async (_name, origin) => {
    expect(await buildDesktopPairingLink({ pairingId: PAIRING_ID, pairingToken: TOKEN, desktopSigningPublicKey: signingKey, origin })).toBeNull();
  });

  it("refuses a bad token, a bad id and a signing key that is not 32 bytes", async () => {
    expect(await buildDesktopPairingLink({ pairingId: PAIRING_ID, pairingToken: "short", desktopSigningPublicKey: signingKey })).toBeNull();
    expect(await buildDesktopPairingLink({ pairingId: "no", pairingToken: TOKEN, desktopSigningPublicKey: signingKey })).toBeNull();
    expect(await buildDesktopPairingLink({ pairingId: PAIRING_ID, pairingToken: TOKEN, desktopSigningPublicKey: base64Encode(new Uint8Array(5)) })).toBeNull();
  });
});

describe("parseDesktopPairingHash", () => {
  const good = `#p=${PAIRING_ID}.${TOKEN}.A1B2C3D4E5F67788`;
  it("reads a good fragment", () => {
    expect(parseDesktopPairingHash(good)?.pin).toBe("A1B2-C3D4-E5F6-7788");
  });
  it.each([
    ["two segments", `#p=${PAIRING_ID}.${TOKEN}`],
    ["four segments", `${good}.AAAA`],
    ["pin too short", `#p=${PAIRING_ID}.${TOKEN}.A1B2C3D4E5F6778`],
    ["pin not hex", `#p=${PAIRING_ID}.${TOKEN}.G1B2C3D4E5F67788`],
    ["pin with dashes", `#p=${PAIRING_ID}.${TOKEN}.A1B2-C3D4-E5F6-7788`],
    ["no #p=", good.slice(1)],
    ["a query smuggled in", `${good}?x=1`],
    ["empty", ""],
  ])("refuses %s", (_name, hash) => {
    expect(parseDesktopPairingHash(hash)).toBeNull();
  });
});

describe("typing code", () => {
  it("is groups of four characters, three parts, and parses back exactly", async () => {
    const built = await buildDesktopPairingLink({ pairingId: PAIRING_ID, pairingToken: TOKEN, desktopSigningPublicKey: signingKey });
    const parts = (built?.code ?? "").split(" / ");
    expect(parts).toHaveLength(3);
    for (const part of parts) for (const group of part.split(" ")) expect(group.length).toBeLessThanOrEqual(4);
    expect(parts[2]?.split(" ")).toHaveLength(4);
    expect(parseTypingCode(built?.code ?? "")).toEqual(parseDesktopPairingHash(built?.hash ?? ""));
  });
  it("tolerates stray spaces and line breaks, reads a changed character as that character (the relay then rejects it), and refuses a short code", async () => {
    const built = await buildDesktopPairingLink({ pairingId: PAIRING_ID, pairingToken: TOKEN, desktopSigningPublicKey: signingKey });
    const messy = `  ${(built?.code ?? "").replaceAll(" / ", " \n/\n ")}  `;
    expect(parseTypingCode(messy)?.pairingId).toBe(PAIRING_ID);
    expect(parseTypingCode((built?.code ?? "").replace("pair", "paiz"))?.pairingId).toBe("paiz_0123456789abcdef0123456789abcdef");
    expect(parseTypingCode("abcd efgh")).toBeNull();
    expect(parseTypingCode("")).toBeNull();
  });
});

describe("pairingCountdown with a fake clock", () => {
  const expires = 1_000_000_000_000;
  it.each([
    [expires - PAIRING_TTL_MS, "10:00", false],
    [expires - PAIRING_TTL_MS + 1, "10:00", false],
    [expires - 5 * PAIRING_TTL_MS, "10:00", false],
    [expires - 599_000, "09:59", false],
    [expires - 61_000, "01:01", false],
    [expires - 60_000, "01:00", false],
    [expires - 59_001, "01:00", false],
    [expires - 1_001, "00:02", false],
    [expires - 1, "00:01", false],
    [expires, "00:00", true],
    [expires + 5_000, "00:00", true],
  ])("at %i shows %s (expired %s)", (now, label, expired) => {
    const result = pairingCountdown(expires, now);
    expect(result.label).toBe(label);
    expect(result.expired).toBe(expired);
  });
  it("progress goes from 1 to 0 and never leaves that range", () => {
    expect(pairingCountdown(expires, expires - PAIRING_TTL_MS).progress).toBe(1);
    expect(pairingCountdown(expires, expires - PAIRING_TTL_MS / 2).progress).toBe(0.5);
    expect(pairingCountdown(expires, expires - 5 * PAIRING_TTL_MS).progress).toBe(1);
    expect(pairingCountdown(expires, expires + 1).progress).toBe(0);
  });
  it("treats a broken clock as expired", () => {
    expect(pairingCountdown(Number.NaN, 1).expired).toBe(true);
    expect(pairingCountdown(1, Number.POSITIVE_INFINITY).expired).toBe(true);
  });
});
