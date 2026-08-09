import { spawnSync } from "node:child_process";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(
  new URL("../verify-updater-artifact.ts", import.meta.url),
);
const fixtureRoots: string[] = [];

function makeFixture(options?: {
  signatureKeyMatches?: boolean;
  corruptSignature?: boolean;
}): string {
  const root = mkdtempSync(resolve(tmpdir(), "sahelflow-updater-artifact-"));
  fixtureRoots.push(root);

  const keyNumber = Buffer.from("559b58a0933618c7", "hex");
  const wrongKeyNumber = Buffer.from("0011223344556677", "hex");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const rawPublicKey = publicKeyDer.subarray(-32);
  const publicPayload = Buffer.concat([
    Buffer.from("Ed", "ascii"),
    keyNumber,
    rawPublicKey,
  ]);
  const publicKeyBox = Buffer.from(
    [
      "untrusted comment: minisign public key: C7183693A0589B55",
      publicPayload.toString("base64"),
      "",
    ].join("\n"),
  ).toString("base64");

  const artifact = Buffer.from("fixture MSI bytes");
  const signatureBytes = sign(
    null,
    createHash("blake2b512").update(artifact).digest(),
    privateKey,
  );
  if (options?.corruptSignature) signatureBytes[0]! ^= 1;
  const signaturePayload = Buffer.concat([
    Buffer.from("ED", "ascii"),
    options?.signatureKeyMatches ?? true ? keyNumber : wrongKeyNumber,
    signatureBytes,
  ]);
  const trustedComment = "timestamp:1\tfile:fixture.msi\tprehashed";
  const globalSignature = sign(
    null,
    Buffer.concat([signatureBytes, Buffer.from(trustedComment)]),
    privateKey,
  );
  const signatureBox = [
    "untrusted comment: signature from minisign secret key",
    signaturePayload.toString("base64"),
    `trusted comment: ${trustedComment}`,
    globalSignature.toString("base64"),
    "",
  ].join("\n");

  const files = new Map<string, string | Uint8Array>([
    [
      "src-tauri/tauri.conf.json",
      JSON.stringify({ plugins: { updater: { pubkey: publicKeyBox } } }),
    ],
    [
      "sahelflow.version.json",
      JSON.stringify({
        updater: {
          publicKeyId: "C7183693A0589B55",
          signingKeyId: "tauri-internal-c7183693a0589b55",
        },
      }),
    ],
    ["fixture.msi", artifact],
    ["fixture.msi.sig", signatureBox],
  ]);

  for (const [relativePath, content] of files) {
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }

  return root;
}

function verify(root: string) {
  return spawnSync(
    "bun",
    [scriptPath, "fixture.msi", "fixture.msi.sig"],
    {
      encoding: "utf8",
      env: { ...process.env, SF_REPO_DIR: root },
    },
  );
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop()!, { recursive: true, force: true });
  }
});

describe("verify-updater-artifact", () => {
  it("accepts an updater signature bound to the compiled public key", () => {
    const result = verify(makeFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("key C7183693A0589B55");
    expect(result.stdout).toContain("sha256");
  });

  it("rejects a signature produced by another updater key", () => {
    const result = verify(makeFixture({ signatureKeyMatches: false }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match compiled public key");
  });

  it("rejects corrupted signature bytes even when the key ID still matches", () => {
    const result = verify(makeFixture({ corruptSignature: true }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "MSI signature does not verify against the compiled public key",
    );
  });
});
