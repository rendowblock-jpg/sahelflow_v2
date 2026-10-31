/**
 * The desktop is the gate for a paired phone: the relay activates a device the
 * moment the phone exchanges the code, so the seller's "It matches, approve" is
 * recorded here, in one small JSON file next to the data (no database table),
 * and the projection worker publishes ONLY for approved ids. A missing or
 * damaged file reads as "nobody approved": a phone then sees nothing (fail closed).
 */
import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dataRoot } from "@/lib/storage/data-root";

const MAX_DEVICES = 32;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export interface DeviceApprovalState {
  version: 1;
  /** Records of another workspace (restored copy, re-enrolment) are not honoured. */
  workspaceId: string;
  /** deviceId -> approved at (ms). */
  approved: Record<string, number>;
  /** deviceId -> pairing created at (ms), so the list can show "added". */
  created: Record<string, number>;
}

export function emptyDeviceApprovalState(workspaceId: string): DeviceApprovalState {
  return { version: 1, workspaceId, approved: {}, created: {} };
}

function cleanRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [id, time] of Object.entries(value as Record<string, unknown>)) {
    if (ID.test(id) && typeof time === "number" && Number.isFinite(time) && Object.keys(out).length < MAX_DEVICES) {
      out[id] = time;
    }
  }
  return out;
}

export function parseDeviceApprovalState(raw: unknown, workspaceId: string): DeviceApprovalState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyDeviceApprovalState(workspaceId);
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || value.workspaceId !== workspaceId) return emptyDeviceApprovalState(workspaceId);
  return { version: 1, workspaceId, approved: cleanRecord(value.approved), created: cleanRecord(value.created) };
}

export function withDeviceCreated(state: DeviceApprovalState, deviceId: string, now: number): DeviceApprovalState {
  if (!ID.test(deviceId)) return state;
  const created = { ...state.created, [deviceId]: now };
  const ids = Object.keys(created);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX_DEVICES))) delete created[id];
  return { ...state, created };
}

/** Approving twice keeps the first time (idempotent). */
export function withDeviceApproved(state: DeviceApprovalState, deviceId: string, now: number): DeviceApprovalState {
  if (!ID.test(deviceId) || state.approved[deviceId] !== undefined) return state;
  return { ...state, approved: { ...state.approved, [deviceId]: now } };
}

/** Wipes every local trace of a device (revoke). Removing an unknown id changes nothing. */
export function withoutDevice(state: DeviceApprovalState, deviceId: string): DeviceApprovalState {
  if (state.approved[deviceId] === undefined && state.created[deviceId] === undefined) return state;
  const approved = { ...state.approved };
  const created = { ...state.created };
  delete approved[deviceId];
  delete created[deviceId];
  return { ...state, approved, created };
}

export function approvedDeviceIds(state: DeviceApprovalState): ReadonlySet<string> {
  return new Set(Object.keys(state.approved));
}

export function deviceApprovalsPath(): string {
  return join(dataRoot(), "connected", "device-approvals-v1.json");
}

export async function readDeviceApprovals(workspaceId: string): Promise<DeviceApprovalState> {
  try {
    return parseDeviceApprovalState(JSON.parse(await readFile(deviceApprovalsPath(), "utf8")), workspaceId);
  } catch {
    return emptyDeviceApprovalState(workspaceId);
  }
}

async function writeDeviceApprovals(state: DeviceApprovalState): Promise<void> {
  const path = deviceApprovalsPath();
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(join(path, ".."), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Read, change, write one at a time, so two requests cannot lose each other's change. */
export function updateDeviceApprovals(
  workspaceId: string,
  change: (state: DeviceApprovalState) => DeviceApprovalState,
): Promise<DeviceApprovalState> {
  const run = queue.then(async () => {
    const before = await readDeviceApprovals(workspaceId);
    const after = change(before);
    if (after !== before) await writeDeviceApprovals(after);
    return after;
  });
  queue = run.catch(() => undefined);
  return run;
}
