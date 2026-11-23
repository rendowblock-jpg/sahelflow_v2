import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
} from "../../../src/lib/license/entitlement-canonical";
import { signBootstrapProof } from "../../../src/lib/connected-platform/bootstrap-proof";
import { createTestD1, loadRelaySchema } from "./d1-sqlite";
import { createWorld, INSTALLATION_ID, RELAY, RSA_JWK, SHOP_ID, WORKSPACE_ID } from "./harness";
import worker, { handleConnectedScheduled, pruneFinishedCommands, type ConnectedWorkerEnvironment } from "../worker";

async function genEd25519() {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    privateKey: pair.privateKey,
    publicKeyBase64: Buffer.from(raw).toString("base64"),
  };
}

async function makeSignedEntitlement(issuer: { privateKey: CryptoKey }, workspaceId = "ws_boot_0001") {
  const claims = {
    formatVersion: LICENSE_ENTITLEMENT_FORMAT,
    domain: LICENSE_ENTITLEMENT_DOMAIN,
    keyId: "perm_key_01",
    issuer: "founder-offline" as const,
    type: "permanent" as const,
    licenseId: "lic_boot_0001",
    workspaceId,
    installationId: INSTALLATION_ID,
    deviceBinding: `sfdb1_${"b".repeat(64)}`,
    productMajor: 1,
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: null,
    supportEndsAt: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
    transferState: "active" as const,
    transferEpoch: 0,
    recoveryEpoch: 0,
    shopSlots: 2,
    memberLimit: 5,
    deviceLimit: 5,
    backupBytes: 1024 * 1024,
    mediaBytes: 1024 * 1024,
    features: ["sahelflow.connected"],
    revocationEpoch: 1,
  };
  const sig = await crypto.subtle.sign(
    { name: "Ed25519" },
    issuer.privateKey,
    canonicalEntitlementBytes(claims) as BufferSource,
  );
  return {
    claims,
    signature: Buffer.from(new Uint8Array(sig)).toString("base64"),
  };
}

describe("Item 3 relay go-live security gates", () => {
  it("Gate 1: /healthz checks migration 0003 (connected_pairing.desktop_key_proof)", async () => {
    const w = await createWorld();
    const ok = await w.call("/healthz");
    expect(ok.status).toBe(200);

    // Simulate a database missing migration 0003 (connected_pairing without desktop_key_proof)
    w.d1.sqlite.exec(`
      DROP TABLE connected_pairing;
      CREATE TABLE connected_pairing (
        pairing_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT
      );
    `);
    const degraded = await w.call("/healthz");
    expect(degraded.status).toBe(503);
  });

  it("Gate 2 (W4SEC-02): PC-generated pairingTokenHash keeps plaintext secret off the relay", async () => {
    const w = await createWorld();
    const pcSecret = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(pcSecret).digest("hex");

    // Malformed hash is rejected before touching D1.
    const bad = await w.createPairing("device_w4sec_bad", "member_owner", { pairingTokenHash: "not-a-sha256" });
    expect(bad.response.status).toBe(400);

    const created = await w.createPairing("device_w4sec_01", "member_owner", { pairingTokenHash: hash });
    expect(created.response.status).toBe(201);
    expect(created.body.pairingId).toBeTruthy();
    // Relay MUST NOT mint or return a plaintext pairingToken when the PC supplies pairingTokenHash.
    expect("pairingToken" in created.body).toBe(false);

    const phoneKey = await genEd25519();
    // Wrong token fails.
    const wrong = await w.exchange(
      { pairingId: created.body.pairingId!, pairingToken: randomBytes(32).toString("base64url") },
      phoneKey,
    );
    expect(wrong.status).toBe(403);

    // Exact PC-generated secret succeeds.
    const good = await w.exchange(
      { pairingId: created.body.pairingId!, pairingToken: pcSecret },
      phoneKey,
    );
    expect(good.status).toBe(201);
  });

  it("Gate 3: POST /v1/bootstrap requires Ed25519 key possession proof and enforces fail-closed IP rate limit", async () => {
    const d1 = createTestD1();
    loadRelaySchema(d1.sqlite);
    const issuer = await genEd25519();
    const desktop = await genEd25519();
    const attacker = await genEd25519();

    const env: ConnectedWorkerEnvironment = {
      DB: d1.db,
      PRODUCT_MAJOR: "1",
      SF_LICENSE_TRIAL_PUBLIC_KEYS: "{}",
      SF_LICENSE_PERMANENT_PUBLIC_KEYS: JSON.stringify({ perm_key_01: issuer.publicKeyBase64 }),
    };

    const entitlement = await makeSignedEntitlement(issuer);
    const baseBody = {
      entitlement,
      desktopSigningPublicKey: desktop.publicKeyBase64,
      desktopEncryptionPublicKey: RSA_JWK,
      recoveryTransfer: false,
    };
    const postBoot = (body: unknown, ip = "198.51.100.42") =>
      worker.fetch(
        new Request(`${RELAY}/v1/bootstrap`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
          body: JSON.stringify(body),
        }),
        env,
      );

    // 1) Missing proof -> 403
    const missing = await postBoot(baseBody, "198.51.100.1");
    expect(missing.status).toBe(403);
    expect(await missing.json()).toMatchObject({ error: "desktop_key_proof_invalid" });

    // 2) Proof signed by attacker key (does not possess desktop private key) -> 403
    const forgedProof = await signBootstrapProof(
      {
        workspaceId: entitlement.claims.workspaceId,
        installationId: entitlement.claims.installationId,
        deviceBinding: entitlement.claims.deviceBinding,
        desktopSigningPublicKey: desktop.publicKeyBase64,
        desktopEncryptionPublicKey: RSA_JWK,
        issuedAt: Date.now(),
      },
      attacker.privateKey,
    );
    const forged = await postBoot({ ...baseBody, desktopBootstrapProof: forgedProof }, "198.51.100.2");
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ error: "desktop_key_proof_invalid" });

    // 3) Stale proof (> 5 min old) -> 403
    const staleProof = await signBootstrapProof(
      {
        workspaceId: entitlement.claims.workspaceId,
        installationId: entitlement.claims.installationId,
        deviceBinding: entitlement.claims.deviceBinding,
        desktopSigningPublicKey: desktop.publicKeyBase64,
        desktopEncryptionPublicKey: RSA_JWK,
        issuedAt: Date.now() - 10 * 60 * 1000,
      },
      desktop.privateKey,
    );
    const stale = await postBoot({ ...baseBody, desktopBootstrapProof: staleProof }, "198.51.100.3");
    expect(stale.status).toBe(403);

    // 4) Valid proof signed by real desktop private key -> 201
    const validProof = await signBootstrapProof(
      {
        workspaceId: entitlement.claims.workspaceId,
        installationId: entitlement.claims.installationId,
        deviceBinding: entitlement.claims.deviceBinding,
        desktopSigningPublicKey: desktop.publicKeyBase64,
        desktopEncryptionPublicKey: RSA_JWK,
        issuedAt: Date.now(),
      },
      desktop.privateKey,
    );
    const ok = await postBoot({ ...baseBody, desktopBootstrapProof: validProof }, "198.51.100.4");
    expect(ok.status).toBe(201);
    const okJson = (await ok.json()) as { workspaceId: string; desktopToken: string };
    expect(okJson.workspaceId).toBe(entitlement.claims.workspaceId);
    expect(okJson.desktopToken.length).toBeGreaterThanOrEqual(32);

    // 5) Rate limit: 10 allowed per minute per IP, 11th returns 429 with Retry-After
    for (let i = 0; i < 10; i++) {
      const r = await postBoot(baseBody, "198.51.100.99");
      expect(r.status).toBe(403);
    }
    const limited = await postBoot(baseBody, "198.51.100.99");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);

    // 6) Fail-closed when rate-limit table is missing -> 503
    d1.sqlite.exec("DROP TABLE connected_rate_limit");
    const broken = await postBoot({ ...baseBody, desktopBootstrapProof: validProof }, "198.51.100.5");
    expect(broken.status).toBe(503);
  });

  it("Gate 4: finished-command retention prunes old terminal rows while preserving fresh terminal and queued rows", async () => {
    const w = await createWorld();
    const dev = await w.pair();
    const nowMs = Date.UTC(2026, 10, 15, 12, 0, 0);
    const oldTs = "2026-11-01 12:00:00"; // 14 days old (> 7 day retention)
    const freshTs = "2026-11-14 12:00:00"; // 1 day old (< 7 day retention)

    const insert = w.d1.sqlite.prepare(
      `INSERT INTO connected_command
        (workspace_id, command_id, idempotency_key, envelope_digest, shop_id, member_id, device_id,
         envelope_json, state, expires_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(WORKSPACE_ID, "cmd_old_done_1", "ik1", "d1", SHOP_ID, dev.memberId, dev.deviceId, "{}", "committed", "2026-11-02T00:00:00Z", oldTs);
    insert.run(WORKSPACE_ID, "cmd_old_exp_2", "ik2", "d2", SHOP_ID, dev.memberId, dev.deviceId, "{}", "expired", "2026-11-02T00:00:00Z", oldTs);
    insert.run(WORKSPACE_ID, "cmd_fresh_done", "ik3", "d3", SHOP_ID, dev.memberId, dev.deviceId, "{}", "committed", "2026-11-16T00:00:00Z", freshTs);
    insert.run(WORKSPACE_ID, "cmd_queued_old", "ik4", "d4", SHOP_ID, dev.memberId, dev.deviceId, "{}", "queued", "2026-11-20T00:00:00Z", null);

    const pruned = await pruneFinishedCommands(w.env, nowMs);
    expect(pruned).toBe(2);

    const remaining = w.d1.sqlite
      .prepare("SELECT command_id FROM connected_command ORDER BY command_id")
      .all() as Array<{ command_id: string }>;
    expect(remaining.map((r) => r.command_id)).toEqual(["cmd_fresh_done", "cmd_queued_old"]);

    // Scheduled handler runs cleanly as a no-op when nothing else is past retention.
    await expect(handleConnectedScheduled({}, w.env)).resolves.toBeUndefined();
  });

  it("Gate 5: pairing creation fails closed (503) when connected_rate_limit is unavailable", async () => {
    const w = await createWorld();
    w.d1.sqlite.exec("DROP TABLE connected_rate_limit");
    const res = await w.createPairing("device_fail_closed_01", "member_owner");
    expect(res.response.status).toBe(503);
  });
});
