import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ root: "" }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/storage/data-root", () => ({ dataRoot: () => h.root }));

import {
  approvedDeviceIds,
  deviceApprovalsPath,
  emptyDeviceApprovalState,
  parseDeviceApprovalState,
  readDeviceApprovals,
  updateDeviceApprovals,
  withDeviceApproved,
  withDeviceCreated,
  withoutDevice,
} from "./device-approvals";

const WS = "ws_test_0001";
const A = "phone_aaaaaaaa";
const B = "phone_bbbbbbbb";

beforeEach(async () => { h.root = await mkdtemp(join(tmpdir(), "sf-approvals-")); });
afterEach(async () => { await rm(h.root, { recursive: true, force: true }); });

describe("pure state", () => {
  it("approve is idempotent and keeps the first time", () => {
    const once = withDeviceApproved(emptyDeviceApprovalState(WS), A, 100);
    const twice = withDeviceApproved(once, A, 999);
    expect(twice).toBe(once);
    expect(twice.approved[A]).toBe(100);
  });
  it("remove wipes approval and creation, and an unknown id changes nothing", () => {
    const state = withDeviceApproved(withDeviceCreated(emptyDeviceApprovalState(WS), A, 1), A, 2);
    const removed = withoutDevice(state, A);
    expect(removed.approved).toEqual({});
    expect(removed.created).toEqual({});
    expect(withoutDevice(removed, A)).toBe(removed);
  });
  it("refuses bad ids and keeps at most 32 devices", () => {
    expect(withDeviceApproved(emptyDeviceApprovalState(WS), "x", 1).approved).toEqual({});
    let state = emptyDeviceApprovalState(WS);
    for (let index = 0; index < 40; index += 1) state = withDeviceCreated(state, `phone_${String(index).padStart(8, "0")}`, index);
    expect(Object.keys(state.created)).toHaveLength(32);
    expect(state.created["phone_00000039"]).toBe(39);
  });
  it.each([
    ["null", null], ["array", []], ["wrong version", { version: 2, workspaceId: WS, approved: { [A]: 1 } }],
    ["another workspace", { version: 1, workspaceId: "ws_other_0001", approved: { [A]: 1 }, created: {} }],
  ])("%s reads as nobody approved", (_name, raw) => {
    expect(approvedDeviceIds(parseDeviceApprovalState(raw, WS)).size).toBe(0);
  });
  it("drops junk entries but keeps good ones", () => {
    const state = parseDeviceApprovalState({ version: 1, workspaceId: WS, approved: { [A]: 5, bad: 1, [B]: "now" }, created: { [B]: Number.NaN } }, WS);
    expect([...approvedDeviceIds(state)]).toEqual([A]);
    expect(state.created).toEqual({});
  });
});

describe("file", () => {
  it("a missing file and a damaged file both read as nobody approved", async () => {
    expect((await readDeviceApprovals(WS)).approved).toEqual({});
    await mkdir(join(deviceApprovalsPath(), ".."), { recursive: true });
    await writeFile(deviceApprovalsPath(), "{not json", "utf8");
    expect((await readDeviceApprovals(WS)).approved).toEqual({});
  });
  it("writes atomically (no temp file left) and a revoke removes the record", async () => {
    await updateDeviceApprovals(WS, (state) => withDeviceApproved(state, A, 10));
    expect([...approvedDeviceIds(await readDeviceApprovals(WS))]).toEqual([A]);
    expect((await readdir(join(deviceApprovalsPath(), ".."))).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    await updateDeviceApprovals(WS, (state) => withoutDevice(state, A));
    expect(JSON.parse(await readFile(deviceApprovalsPath(), "utf8")).approved).toEqual({});
  });
  it("does not write when nothing changed", async () => {
    await updateDeviceApprovals(WS, (state) => state);
    await expect(readFile(deviceApprovalsPath(), "utf8")).rejects.toThrow();
  });
  it("two simultaneous updates both survive", async () => {
    await Promise.all([
      updateDeviceApprovals(WS, (state) => withDeviceApproved(state, A, 1)),
      updateDeviceApprovals(WS, (state) => withDeviceApproved(state, B, 2)),
    ]);
    expect([...approvedDeviceIds(await readDeviceApprovals(WS))].sort()).toEqual([A, B]);
  });
});
