// The relay carries the desktop's key proof from createPairing to exchange.
import { afterEach, describe, expect, it, vi } from "vitest";
import { RSA_JWK, WORKSPACE_ID, createWorld } from "./harness";

const SIG = `${"A".repeat(86)}==`;
const PROOF = `${SIG}.sahelflow.pairing.rsa-key.v1`;

afterEach(() => vi.restoreAllMocks());

async function exchangeFor(w: Awaited<ReturnType<typeof createWorld>>, created: { body: Record<string, string> }) {
  const key = await w.generateSigningKey();
  const response = await w.exchange({ pairingId: created.body.pairingId ?? "", pairingToken: created.body.pairingToken ?? "" }, key);
  return { response, body: (await response.json()) as Record<string, unknown> };
}

describe("desktopKeyProof at the relay", () => {
  it("stores the proof on the pairing and returns it from exchange next to both desktop keys", async () => {
    const w = await createWorld();
    const created = await w.createPairing("device_proof_a", "member_owner", { desktopKeyProof: PROOF });
    expect(created.response.status).toBe(201);
    expect(w.rows<{ desktop_key_proof: string | null }>("SELECT desktop_key_proof FROM connected_pairing").map((r) => r.desktop_key_proof)).toEqual([PROOF]);
    const { response, body } = await exchangeFor(w, created);
    expect(response.status).toBe(201);
    const workspace = w.rows<{ desktop_signing_public_key: string; desktop_encryption_public_key: string }>(
      "SELECT desktop_signing_public_key, desktop_encryption_public_key FROM connected_workspace",
    )[0];
    expect(body.desktopKeyProof).toBe(PROOF);
    expect(body.desktopSigningPublicKey).toBe(workspace?.desktop_signing_public_key);
    // The JWK string is handed over exactly as stored, not re-serialised.
    expect(body.desktopEncryptionPublicKey).toBe(RSA_JWK);
    expect(body.desktopEncryptionPublicKey).toBe(workspace?.desktop_encryption_public_key);
  });

  it.each([["absent (an old desktop)", {}], ["explicit null", { desktopKeyProof: null }]])(
    "%s keeps working and exchange answers null",
    async (_name, extra) => {
      const w = await createWorld();
      const created = await w.createPairing("device_proof_b", "member_owner", extra);
      expect(created.response.status).toBe(201);
      expect(w.rows<{ desktop_key_proof: string | null }>("SELECT desktop_key_proof FROM connected_pairing").map((r) => r.desktop_key_proof)).toEqual([null]);
      const { response, body } = await exchangeFor(w, created);
      expect(response.status).toBe(201);
      expect(body.desktopKeyProof).toBeNull();
    },
  );

  it.each([
    ["empty string", ""],
    ["a number", 7],
    ["an object", { signature: SIG }],
    ["markup", `<b>${PROOF}`],
    ["a newline", `${PROOF}\n`],
    ["513 characters", `${"A".repeat(432)}.${"c".repeat(80)}`],
  ])("refuses %s with the typed 400 and creates no pairing", async (_name, proof) => {
    const w = await createWorld();
    const created = await w.createPairing("device_proof_c", "member_owner", { desktopKeyProof: proof });
    expect(created.response.status).toBe(400);
    expect(created.body).toEqual({ error: "invalid_key_proof" });
    expect(w.count("SELECT COUNT(*) AS n FROM connected_pairing")).toBe(0);
  });

  it("accepts exactly 512 characters", async () => {
    const w = await createWorld();
    const created = await w.createPairing("device_proof_d", "member_owner", { desktopKeyProof: `${"A".repeat(431)}.${"c".repeat(80)}` });
    expect(created.response.status).toBe(201);
  });

  it("stores nothing for an unauthorised caller", async () => {
    const w = await createWorld();
    const response = await w.call("/v1/desktop/pairings", {
      method: "POST",
      token: "x".repeat(48),
      body: { workspaceId: WORKSPACE_ID, memberId: "member_owner", deviceId: "device_proof_e", desktopKeyProof: PROOF },
    });
    expect(response.status).toBe(401);
    expect(w.count("SELECT COUNT(*) AS n FROM connected_pairing")).toBe(0);
  });

  it("never writes the proof to a log or echoes it in an error", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((name) => vi.spyOn(console, name).mockImplementation(() => undefined));
    const w = await createWorld();
    const created = await w.createPairing("device_proof_f", "member_owner", { desktopKeyProof: PROOF });
    await exchangeFor(w, created);
    const bad = await w.createPairing("device_proof_g", "member_owner", { desktopKeyProof: `${PROOF}!` });
    expect(JSON.stringify(bad.body)).not.toContain("AAAA");
    await w.call(`/v1/desktop/devices?workspaceId=${WORKSPACE_ID}`, { token: w.desktopToken });
    expect(JSON.stringify(spies.flatMap((spy) => spy.mock.calls))).not.toContain("AAAAAAAA");
  });
});

describe("GET /v1/desktop/devices", () => {
  it("returns created_at and revoked_at", async () => {
    const w = await createWorld();
    await w.pair("device_proof_h", "member_owner");
    const response = await w.call(`/v1/desktop/devices?workspaceId=${WORKSPACE_ID}`, { token: w.desktopToken });
    const body = (await response.json()) as { devices: Array<Record<string, unknown>> };
    expect(body.devices).toHaveLength(1);
    expect(typeof body.devices[0]?.created_at).toBe("string");
    expect(body.devices[0]).toHaveProperty("revoked_at", null);
  });
});
