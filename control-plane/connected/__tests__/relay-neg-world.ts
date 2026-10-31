// Two workspaces on one relay, for the hostile-reviewer tests (W3b SEC3, check a).
import { createHash } from "node:crypto";
import { expect } from "vitest";
import { RSA_JWK, createWorld, type Device } from "./harness";

export const OTHER_WS = "ws_00000002";
export const OTHER_INST = "fedcba9876543210fedcba9876543210";
const OTHER_DESKTOP_TOKEN = "e".repeat(48);

/** a (member_owner) and b (member_two) live in workspace 1; x lives in workspace 2. a and b may write notes. */
export async function setup() {
  const w = await createWorld();
  w.d1.sqlite.prepare(
    `INSERT INTO connected_workspace
     (workspace_id, license_id, installation_id, device_binding, product_major, license_type,
      entitlement_expires_at, shop_slots, member_limit, device_limit, features_json,
      entitlement_revocation_epoch, desktop_token_hash, desktop_signing_public_key,
      desktop_encryption_public_key)
     VALUES (?, 'license_00000002', ?, ?, 1, 'permanent', NULL, 1, 3, 3, ?, 0, ?, ?, ?)`,
  ).run(
    OTHER_WS,
    OTHER_INST,
    `sfdb1_${"b".repeat(64)}`,
    JSON.stringify(["sahelflow.connected"]),
    createHash("sha256").update(OTHER_DESKTOP_TOKEN).digest("hex"),
    Buffer.alloc(32, 9).toString("base64"),
    RSA_JWK,
  );
  const a = await w.pair("device_alice_01", "member_owner");
  const b = await w.pair("device_bob_0001", "member_two");
  const made = await w.call("/v1/desktop/pairings", {
    method: "POST",
    token: OTHER_DESKTOP_TOKEN,
    body: { workspaceId: OTHER_WS, memberId: "member_other", deviceId: "device_other_ws" },
  });
  expect(made.status).toBe(201);
  const pairing = (await made.json()) as Record<string, string>;
  const key = await w.generateSigningKey();
  const done = await w.exchange(
    { pairingId: pairing.pairingId ?? "", pairingToken: pairing.pairingToken ?? "" },
    key,
    { "CF-Connecting-IP": "203.0.113.9" },
  );
  expect(done.status).toBe(201);
  const token = ((await done.json()) as { deviceToken: string }).deviceToken;
  const x: Device = { deviceId: "device_other_ws", memberId: "member_other", token, key };
  w.allowCommands(a);
  w.allowCommands(b);
  // Ids that a refusal sent to `a` must never carry.
  const forbidden = [OTHER_WS, OTHER_INST, x.deviceId, x.memberId, b.deviceId, b.memberId];
  return { w, a, b, x, forbidden };
}

/** Asserts the status and that the body names none of the forbidden ids. Returns the body text. */
export async function expectRefusal(response: Response, status: number, forbidden: string[]): Promise<string> {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  for (const id of forbidden) expect(text).not.toContain(id);
  return text;
}
