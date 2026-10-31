// Decides WHEN a push may leave. Pure: no timers, no clock of its own. The
// caller feeds events with enqueue() and asks what is due with poll(now).
import { PUSH_KINDS, assertCount, assertPushKind, assertTime, type PushKind } from "./payload";

export const DEBOUNCE_MS = 90_000;
export const MAX_WAIT_MS = 300_000;
export const KIND_INTERVAL_MS = 120_000;
export const DEVICE_HOURLY_CAP = 20;
export const GLOBAL_HOURLY_CAP = 60;
const HOUR_MS = 3_600_000;
const DAY_MINUTES = 1440;

export type QuietWindow = {
  /** Local minute of the day, 0 to 1439. The window may wrap midnight. */
  startMinute: number;
  endMinute: number;
  /** Local time = UTC + this many minutes (Algeria: 60). */
  utcOffsetMinutes: number;
};

export type DispatcherOptions = { quiet?: QuietWindow | null };
export type DispatchDevice = { deviceId: string; kinds: readonly PushKind[] };
export type DispatchItem = { deviceId: string; kind: PushKind; count: number; digest: boolean };

export type Dispatcher = {
  /** The latest count of a kind replaces the earlier one. A count of 0 clears the kind. */
  enqueue(event: { kind: PushKind; count: number; now: number }): void;
  /** Pushes that may leave now. Anything held back stays pending. */
  poll(input: { now: number; devices: readonly DispatchDevice[] }): DispatchItem[];
  pendingKinds(): PushKind[];
};

type Pending = { count: number; firstAt: number; lastAt: number; served: Set<string> };
type DeviceState = { sentAt: number[]; lastByKind: Map<PushKind, number> };

function checkMinute(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= DAY_MINUTES) {
    throw new RangeError(name + " must be a whole minute from 0 to 1439");
  }
}

export function createDispatcher(options: DispatcherOptions = {}): Dispatcher {
  const quiet = options.quiet ?? null;
  if (quiet) {
    checkMinute(quiet.startMinute, "startMinute");
    checkMinute(quiet.endMinute, "endMinute");
    if (!Number.isInteger(quiet.utcOffsetMinutes)) throw new RangeError("utcOffsetMinutes must be a whole number");
  }

  const pending = new Map<PushKind, Pending>();
  const devices = new Map<string, DeviceState>();
  let tokens = GLOBAL_HOURLY_CAP;
  let tokensAt: number | null = null;

  function isQuiet(at: number): boolean {
    if (!quiet || quiet.startMinute === quiet.endMinute) return false;
    const minutes = Math.floor(at / 60_000) + quiet.utcOffsetMinutes;
    const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    return quiet.startMinute < quiet.endMinute
      ? m >= quiet.startMinute && m < quiet.endMinute
      : m >= quiet.startMinute || m < quiet.endMinute;
  }

  function availableTokens(now: number): number {
    if (tokensAt === null) return GLOBAL_HOURLY_CAP;
    const refill = Math.max(0, now - tokensAt) / (HOUR_MS / GLOBAL_HOURLY_CAP);
    return Math.min(GLOBAL_HOURLY_CAP, tokens + refill);
  }

  function takeToken(now: number): boolean {
    const available = availableTokens(now);
    if (available < 1) return false;
    tokens = available - 1;
    tokensAt = now;
    return true;
  }

  function stateOf(deviceId: string): DeviceState {
    let state = devices.get(deviceId);
    if (!state) {
      state = { sentAt: [], lastByKind: new Map() };
      devices.set(deviceId, state);
    }
    return state;
  }

  function mayReceive(deviceId: string, kind: PushKind, now: number): boolean {
    const state = stateOf(deviceId);
    state.sentAt = state.sentAt.filter((t) => now - t < HOUR_MS);
    const last = state.lastByKind.get(kind);
    if (last !== undefined && now - last < KIND_INTERVAL_MS) return false;
    return state.sentAt.length < DEVICE_HOURLY_CAP;
  }

  return {
    enqueue({ kind, count, now }) {
      assertPushKind(kind);
      assertCount(count);
      assertTime(now);
      if (count === 0) {
        pending.delete(kind);
        return;
      }
      const existing = pending.get(kind);
      pending.set(kind, {
        count,
        firstAt: existing ? existing.firstAt : now,
        lastAt: now,
        served: new Set(),
      });
    },

    poll({ now, devices: audience }) {
      assertTime(now);
      const out: DispatchItem[] = [];
      for (const kind of PUSH_KINDS) {
        const entry = pending.get(kind);
        if (!entry) continue;
        const dueAt = Math.min(entry.lastAt + DEBOUNCE_MS, entry.firstAt + MAX_WAIT_MS);
        if (now < dueAt || isQuiet(now)) continue;
        const eligible = audience.filter((d) => d.kinds.includes(kind));
        if (eligible.length === 0) {
          pending.delete(kind);
          continue;
        }
        // A push that waited out the quiet hours is the morning digest.
        const digest = isQuiet(dueAt);
        for (const device of eligible) {
          if (entry.served.has(device.deviceId)) continue;
          if (!mayReceive(device.deviceId, kind, now)) continue;
          if (!takeToken(now)) break;
          const state = stateOf(device.deviceId);
          state.sentAt.push(now);
          state.lastByKind.set(kind, now);
          entry.served.add(device.deviceId);
          out.push({ deviceId: device.deviceId, kind, count: entry.count, digest });
        }
        if (eligible.every((d) => entry.served.has(d.deviceId))) pending.delete(kind);
      }
      return out;
    },

    pendingKinds() {
      return PUSH_KINDS.filter((kind) => pending.has(kind));
    },
  };
}
