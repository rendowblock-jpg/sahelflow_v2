process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * F-0031 / census S2: the outbox worker replaced `message.count()` by a one-row
 * probe. This table proves the restart reconciliation reaches the SAME outcome
 * and leaves the SAME files for 0, 1 and many messages, for every tombstone
 * shape that makes the count matter.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanDb, rawDb } from "@/app/api/__tests__/helpers";
import { reconcileWhatsAppMediaEraseAfterRestart } from "../media-erase-lifecycle";
import { messageCountForMediaEraseDecision } from "../outbox-worker";

let tmp = "";

beforeEach(async () => {
  await cleanDb();
  tmp = mkdtempSync(join(tmpdir(), "sahelflow-erase-decision-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});
afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

async function seedMessages(count: number): Promise<void> {
  if (count === 0) return;
  const conversation = await rawDb.conversation.create({
    data: {
      channel: "whatsapp",
      contactName: "Erase decision",
      sourceId: `erase-decision-${count}`,
      lastMessageAt: new Date(0),
    },
  });
  for (let index = 0; index < count; index += 1) {
    await rawDb.message.create({
      data: {
        conversationId: conversation.id,
        body: `message ${index}`,
        direction: "inbound",
        timestamp: new Date(index),
      },
    });
  }
}

/** A crash-left tombstone: with or without hidden media entries. */
function tombstoneTree(name: string, withEntry: boolean): string {
  const active = join(tmp, name, "whatsapp-media", "a".repeat(64));
  mkdirSync(`${active}.erasing`, { recursive: true });
  if (withEntry) {
    writeFileSync(join(`${active}.erasing`, "private.sfmedia"), "ciphertext");
  }
  return active;
}

function snapshot(active: string): string[] {
  return [active, `${active}.erasing`].flatMap((dir) =>
    existsSync(dir) ? [dir.endsWith(".erasing") ? "tombstone" : "active", ...readdirSync(dir)] : [],
  );
}

const TABLE = [
  // [messages, tombstone has media, expected outcome]
  [0, true, "committed"],
  [1, true, "rolled-back"],
  [5, true, "rolled-back"],
  [0, false, "committed"],
  [1, false, "rolled-back-empty"],
  [5, false, "rolled-back-empty"],
] as const;

describe("media-erase restart decision: COUNT versus one-row probe", () => {
  it.each(TABLE)(
    "%i message(s), tombstone with media=%s -> %s, identical files",
    async (messages, withEntry, expected) => {
      await seedMessages(messages);
      const viaCount = tombstoneTree("count", withEntry);
      const viaProbe = tombstoneTree("probe", withEntry);

      const countOutcome = reconcileWhatsAppMediaEraseAfterRestart(
        viaCount,
        await rawDb.message.count(),
      );
      const probe = await messageCountForMediaEraseDecision(rawDb);
      const probeOutcome = reconcileWhatsAppMediaEraseAfterRestart(viaProbe, probe);

      expect(probe).toBe(messages === 0 ? 0 : 1);
      expect(countOutcome).toBe(expected);
      expect(probeOutcome).toBe(countOutcome);
      expect(snapshot(viaProbe)).toEqual(snapshot(viaCount));
    },
  );

  it("without a tombstone both paths answer 'none' and touch nothing", async () => {
    for (const messages of [0, 1, 5]) {
      await cleanDb();
      await seedMessages(messages);
      const active = join(tmp, `none-${messages}`, "whatsapp-media", "a".repeat(64));
      mkdirSync(active, { recursive: true });

      expect(
        reconcileWhatsAppMediaEraseAfterRestart(active, await rawDb.message.count()),
      ).toBe("none");
      expect(
        reconcileWhatsAppMediaEraseAfterRestart(
          active,
          await messageCountForMediaEraseDecision(rawDb),
        ),
      ).toBe("none");
      expect(existsSync(active)).toBe(true);
    }
  });
});
