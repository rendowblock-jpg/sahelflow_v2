/**
 * Advisory record of which photos the cloud holds, kept in the Setting table
 * (key/value, no migration). Publishing never trusts it: every publish asks the
 * cloud ("check") first. The Studio uses it to show a photo's state without a
 * network call.
 */
export const MEDIA_SERVICE_KEY = "storefront.media.service";
/** A service answer older than this is no longer "waiting": the PC may be offline or hosting switched off. */
export const SERVICE_FRESH_MS = 24 * 60 * 60 * 1000;

export type MediaServiceState = "on" | "off";
export type MediaServiceRow = Readonly<{ state: MediaServiceState; at: string }>;

type SettingRow = { key: string; value: string };
/** The few Prisma Setting calls the ledger needs (a test passes a fake). */
export type MediaLedgerDb = {
  setting: {
    findUnique(args: { where: { key: string } }): Promise<{ value: string } | null>;
    findMany(args: { where: { key: { in: string[] } } }): Promise<SettingRow[]>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }): Promise<unknown>;
  };
};

export function mediaPhotoKey(storefrontId: string, hash: string): string {
  return `storefront.media.${storefrontId}.${hash}`;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function serviceIsFresh(row: MediaServiceRow | null, now: Date): boolean {
  if (!row || row.state !== "on") return false;
  const age = now.getTime() - Date.parse(row.at);
  return Number.isFinite(age) && age >= 0 && age < SERVICE_FRESH_MS;
}

export function createMediaLedger(db: MediaLedgerDb, now: () => Date = () => new Date()) {
  async function write(key: string, value: Record<string, string>): Promise<void> {
    const text = JSON.stringify(value);
    await db.setting.upsert({ where: { key }, create: { key, value: text }, update: { value: text } });
  }
  return {
    /** Written by every check: "on" when the cloud answered, "off" when hosting is not switched on. */
    recordService(state: MediaServiceState): Promise<void> {
      return write(MEDIA_SERVICE_KEY, { state, at: now().toISOString() });
    },
    /** Written only after the cloud answered 200/201 for every size of this photo. */
    recordHosted(storefrontId: string, hash: string): Promise<void> {
      return write(mediaPhotoKey(storefrontId, hash), { state: "hosted", at: now().toISOString() });
    },
    async readService(): Promise<MediaServiceRow | null> {
      const row = await db.setting.findUnique({ where: { key: MEDIA_SERVICE_KEY } });
      const parsed = row ? parseJson(row.value) : null;
      if (!parsed || (parsed.state !== "on" && parsed.state !== "off") || typeof parsed.at !== "string") return null;
      return { state: parsed.state, at: parsed.at };
    },
    /** Hashes of THIS storefront recorded as hosted (another storefront's rows never count). */
    async readHosted(storefrontId: string, hashes: readonly string[]): Promise<Set<string>> {
      if (hashes.length === 0) return new Set();
      const byKey = new Map(hashes.map((hash) => [mediaPhotoKey(storefrontId, hash), hash] as const));
      const rows = await db.setting.findMany({ where: { key: { in: [...byKey.keys()] } } });
      const hosted = new Set<string>();
      for (const row of rows) {
        const hash = byKey.get(row.key);
        if (hash && parseJson(row.value)?.state === "hosted") hosted.add(hash);
      }
      return hosted;
    },
  };
}

export type MediaLedger = ReturnType<typeof createMediaLedger>;
