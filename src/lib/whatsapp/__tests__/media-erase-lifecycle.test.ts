import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  commitWhatsAppMediaErase,
  reconcileWhatsAppMediaEraseAfterRestart,
  rollbackWhatsAppMediaErase,
  stageWhatsAppMediaErase,
  whatsAppMediaEraseEpoch,
  whatsAppMediaErasePending,
} from "../media-erase-lifecycle";

let root = "";
let active = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sahelflow-media-erase-"));
  active = join(root, "whatsapp-media", "a".repeat(64));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("WhatsApp media erase tombstones", () => {
  it("hides and restores a fresh media tree when the DB erase fails", () => {
    mkdirSync(active, { recursive: true });
    writeFileSync(join(active, "private.sfmedia"), "ciphertext");

    const stage = stageWhatsAppMediaErase(active);
    expect(stage).toMatchObject({ fresh: true, hadActiveTree: true });
    expect(existsSync(active)).toBe(false);
    expect(whatsAppMediaErasePending(active)).toBe(true);

    rollbackWhatsAppMediaErase(stage);
    expect(whatsAppMediaErasePending(active)).toBe(false);
    expect(readFileSync(join(active, "private.sfmedia"), "utf8")).toBe(
      "ciphertext",
    );
  });

  it("advances the read generation even when a destructive erase later rolls back", () => {
    mkdirSync(active, { recursive: true });
    writeFileSync(join(active, "private.sfmedia"), "ciphertext");
    const before = whatsAppMediaEraseEpoch(active);

    const stage = stageWhatsAppMediaErase(active);
    const staged = whatsAppMediaEraseEpoch(active);
    expect(staged).not.toBe(before);

    rollbackWhatsAppMediaErase(stage);
    expect(whatsAppMediaEraseEpoch(active)).toBe(staged);
    expect(whatsAppMediaErasePending(active)).toBe(false);
  });

  it("rejects a second same-process erase owner before it can share the tombstone", () => {
    mkdirSync(active, { recursive: true });
    writeFileSync(join(active, "private.sfmedia"), "ciphertext");

    const first = stageWhatsAppMediaErase(active);
    expect(() => stageWhatsAppMediaErase(active)).toThrow(
      "erase is already active",
    );
    expect(existsSync(active)).toBe(false);
    expect(whatsAppMediaErasePending(active)).toBe(true);

    rollbackWhatsAppMediaErase(first);
    expect(readFileSync(join(active, "private.sfmedia"), "utf8")).toBe(
      "ciphertext",
    );
    expect(whatsAppMediaErasePending(active)).toBe(false);
  });

  it("deletes the hidden tree only after the DB erase commits", () => {
    mkdirSync(active, { recursive: true });
    writeFileSync(join(active, "private.sfmedia"), "ciphertext");

    const stage = stageWhatsAppMediaErase(active);
    const stagedEpoch = whatsAppMediaEraseEpoch(active);
    commitWhatsAppMediaErase(stage);

    expect(existsSync(active)).toBe(false);
    expect(existsSync(`${active}.erasing`)).toBe(false);
    expect(whatsAppMediaEraseEpoch(active)).toBe(stagedEpoch);
  });

  it("keeps a pre-existing crash tombstone hidden until a safe retry commits", () => {
    mkdirSync(`${active}.erasing`, { recursive: true });
    writeFileSync(join(`${active}.erasing`, "private.sfmedia"), "ciphertext");

    const stage = stageWhatsAppMediaErase(active);
    expect(stage.fresh).toBe(false);
    rollbackWhatsAppMediaErase(stage);
    expect(existsSync(active)).toBe(false);
    expect(whatsAppMediaErasePending(active)).toBe(true);

    commitWhatsAppMediaErase(stage);
    expect(whatsAppMediaErasePending(active)).toBe(false);
  });

  it("unblocks an empty-scope rollback when a racing writer created the live directory", () => {
    const stage = stageWhatsAppMediaErase(active);
    expect(stage).toMatchObject({ fresh: true, hadActiveTree: false });
    expect(whatsAppMediaErasePending(active)).toBe(true);

    mkdirSync(active, { recursive: true });
    rollbackWhatsAppMediaErase(stage);

    expect(existsSync(active)).toBe(true);
    expect(whatsAppMediaErasePending(active)).toBe(false);
  });

  it("does not reconcile a tombstone while the same-process erase is still active", () => {
    mkdirSync(active, { recursive: true });
    writeFileSync(join(active, "private.sfmedia"), "ciphertext");
    const stage = stageWhatsAppMediaErase(active);

    expect(reconcileWhatsAppMediaEraseAfterRestart(active, 1)).toBe(
      "in-progress",
    );
    expect(existsSync(active)).toBe(false);
    expect(existsSync(`${active}.erasing`)).toBe(true);

    rollbackWhatsAppMediaErase(stage);
  });

  it("finishes a committed crash-left erase when canonical messages are gone", () => {
    mkdirSync(`${active}.erasing`, { recursive: true });
    writeFileSync(join(`${active}.erasing`, "private.sfmedia"), "ciphertext");

    expect(reconcileWhatsAppMediaEraseAfterRestart(active, 0)).toBe(
      "committed",
    );
    expect(existsSync(active)).toBe(false);
    expect(existsSync(`${active}.erasing`)).toBe(false);
  });

  it("restores a crash-left media tree when canonical messages survived", () => {
    mkdirSync(`${active}.erasing`, { recursive: true });
    writeFileSync(join(`${active}.erasing`, "private.sfmedia"), "ciphertext");

    expect(reconcileWhatsAppMediaEraseAfterRestart(active, 1)).toBe(
      "rolled-back",
    );
    expect(existsSync(`${active}.erasing`)).toBe(false);
    expect(readFileSync(join(active, "private.sfmedia"), "utf8")).toBe(
      "ciphertext",
    );
  });

  it("removes a crash-left empty blocking marker when canonical messages survived", () => {
    mkdirSync(`${active}.erasing`, { recursive: true });

    expect(reconcileWhatsAppMediaEraseAfterRestart(active, 1)).toBe(
      "rolled-back-empty",
    );
    expect(existsSync(active)).toBe(false);
    expect(existsSync(`${active}.erasing`)).toBe(false);
  });

  it("fails closed when restart observes both active and tombstone trees", () => {
    mkdirSync(active, { recursive: true });
    mkdirSync(`${active}.erasing`, { recursive: true });

    expect(() => reconcileWhatsAppMediaEraseAfterRestart(active, 1)).toThrow(
      "restart state is ambiguous",
    );
  });
});