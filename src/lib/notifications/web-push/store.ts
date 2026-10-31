// The list of phones to push to. The bytes on disk are sealed by an injected
// sealer (G4 wires the real one); this file only decides what is stored and
// guarantees that a damaged file is an error, never an empty list.
import { z } from "zod";

import { subscriptionRecordSchema } from "./contract";
import { PUSH_KINDS, type PushKind } from "./payload";
import { endpointHash } from "./util";

export const STORE_VERSION = 1;
export const SUBSCRIPTION_CAP = 32;

export type FileIo = {
  /** null = the file does not exist yet. */
  read(): Promise<Uint8Array | null>;
  write(bytes: Uint8Array): Promise<void>;
};

export type Sealer = {
  seal(plain: Uint8Array): Uint8Array;
  /** Must throw if the bytes were changed or cut. */
  open(sealed: Uint8Array): Uint8Array;
};

export type SubscriptionRecord = {
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: number;
  lastOkAt: number | null;
  failCount: number;
  kinds: PushKind[];
};

export type StoreErrorCode = "corrupt" | "unsupported_version" | "cap_reached" | "invalid_record";

// Fixed messages: the text of a sealer or parser error could hold stored data.
export class SubscriptionStoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = "SubscriptionStoreError";
    this.code = code;
  }
}

const corrupt = (): SubscriptionStoreError =>
  new SubscriptionStoreError("corrupt", "The push subscription file is damaged and was left untouched.");

// Reading is looser than writing: a stored address is checked again when it is used.
const storedFileSchema = z.strictObject({
  version: z.literal(STORE_VERSION),
  records: z.array(
    z.strictObject({
      deviceId: z.string().min(1).max(200),
      endpoint: z.string().min(1).max(2048),
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(100),
      createdAt: z.number().int().nonnegative(),
      lastOkAt: z.number().int().nonnegative().nullable(),
      failCount: z.number().int().nonnegative(),
      kinds: z.array(z.enum(PUSH_KINDS)),
    }),
  ),
});

export class SubscriptionStore {
  private readonly io: FileIo;
  private readonly sealer: Sealer;
  private tail: Promise<void> = Promise.resolve();

  constructor(deps: { io: FileIo; sealer: Sealer }) {
    this.io = deps.io;
    this.sealer = deps.sealer;
  }

  // One change at a time, so two overlapping calls cannot overwrite each other.
  private serialize<T>(job: () => Promise<T>): Promise<T> {
    const run = this.tail.then(job);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async load(): Promise<SubscriptionRecord[]> {
    const sealed = await this.io.read();
    if (sealed === null) return [];
    if (sealed.length === 0) throw corrupt();
    let value: unknown;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(this.sealer.open(sealed));
      value = JSON.parse(text);
    } catch {
      throw corrupt();
    }
    const version = typeof value === "object" && value !== null ? (value as { version?: unknown }).version : undefined;
    if (typeof version === "number" && version !== STORE_VERSION) {
      throw new SubscriptionStoreError("unsupported_version", "The push subscription file has an unknown version.");
    }
    const parsed = storedFileSchema.safeParse(value);
    if (!parsed.success) throw corrupt();
    const records = parsed.data.records;
    if (records.length > SUBSCRIPTION_CAP || new Set(records.map((r) => r.deviceId)).size !== records.length) {
      throw corrupt();
    }
    return records;
  }

  private async save(records: SubscriptionRecord[]): Promise<void> {
    const plain = Buffer.from(JSON.stringify({ version: STORE_VERSION, records }), "utf8");
    await this.io.write(this.sealer.seal(plain));
  }

  list(): Promise<SubscriptionRecord[]> {
    return this.serialize(() => this.load());
  }

  get(deviceId: string): Promise<SubscriptionRecord | null> {
    return this.serialize(async () => (await this.load()).find((r) => r.deviceId === deviceId) ?? null);
  }

  /** One subscription per device: a new one replaces the old one. */
  async upsert(record: SubscriptionRecord): Promise<void> {
    const parsed = subscriptionRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new SubscriptionStoreError("invalid_record", "The push subscription does not match the contract.");
    }
    const clean: SubscriptionRecord = parsed.data;
    return this.serialize(async () => {
      const records = await this.load();
      const index = records.findIndex((r) => r.deviceId === clean.deviceId);
      if (index >= 0) {
        records[index] = clean;
      } else {
        if (records.length >= SUBSCRIPTION_CAP) {
          throw new SubscriptionStoreError("cap_reached", "Too many devices have a push subscription.");
        }
        records.push(clean);
      }
      await this.save(records);
    });
  }

  removeByDevice(deviceId: string): Promise<boolean> {
    return this.serialize(async () => {
      const records = await this.load();
      const kept = records.filter((r) => r.deviceId !== deviceId);
      if (kept.length === records.length) return false;
      await this.save(kept);
      return true;
    });
  }

  /** Returns how many records were removed. */
  async removeByEndpointHash(hash: string): Promise<number> {
    if (!/^[0-9a-f]{12}$/.test(hash)) return 0;
    return this.serialize(async () => {
      const records = await this.load();
      const kept = records.filter((r) => endpointHash(r.endpoint) !== hash);
      if (kept.length === records.length) return 0;
      await this.save(kept);
      return records.length - kept.length;
    });
  }

  recordSuccess(deviceId: string, now: number): Promise<boolean> {
    return this.serialize(async () => {
      const records = await this.load();
      const record = records.find((r) => r.deviceId === deviceId);
      if (!record) return false;
      record.lastOkAt = now;
      record.failCount = 0;
      await this.save(records);
      return true;
    });
  }

  /** Returns the new failure count, or null for an unknown device. */
  recordFailure(deviceId: string): Promise<number | null> {
    return this.serialize(async () => {
      const records = await this.load();
      const record = records.find((r) => r.deviceId === deviceId);
      if (!record) return null;
      record.failCount += 1;
      await this.save(records);
      return record.failCount;
    });
  }
}
