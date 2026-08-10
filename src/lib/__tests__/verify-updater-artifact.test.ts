import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const verifier = resolve(repoRoot, "scripts", "verify-updater-artifact.ts");
const fixtures: string[] = [];
const PUBLIC_KEY_ID = "C7183693A0589B55";
const SIGNING_KEY_ID = "tauri-internal-c7183693a0589b55";
const ARTIFACT = Buffer.from("SahelFlow MSI fixture\n", "utf8");
const TRUSTED_COMMENT =
  "timestamp:1700000000\tfile:candidate.msi\tprehashed";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const rawPublicKey = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32);

function write(path: string, content: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function keyNumber(id = PUBLIC_KEY_ID): Buffer {
  return Buffer.from(id, "hex").reverse();
}

function minisignPublicKeyBox(): string {
  const payload = Buffer.concat([
    Buffer.from("Ed", "ascii"),
    keyNumber(),
    rawPublicKey,
  ]);
  const text = [
    `untrusted comment: minisign public key: ${PUBLIC_KEY_ID}`,
    payload.toString("base64"),
    "",
  ].join("\n");
  return Buffer.from(text, "utf8").toString("base64");
}

function signaturePayload(id = PUBLIC_KEY_ID): {
  payload: Buffer;
  signature: Buffer;
} {
  const signature = sign(
    null,
    createHash("blake2b512").update(ARTIFACT).digest(),
    privateKey,
  );
  return {
    payload: Buffer.concat([
      Buffer.from("ED", "ascii"),
      keyNumber(id),
      signature,
    ]),
    signature,
  };
}

function plainSignatureBox(id = PUBLIC_KEY_ID): string {
  const { payload, signature } = signaturePayload(id);
  const globalSignature = sign(
    null,
    Buffer.concat([signature, Buffer.from(TRUSTED_COMMENT)]),
    privateKey,
  );
  return [
    "untrusted comment: signature from minisign secret key",
    payload.toString("base64"),
    `trusted comment: ${TRUSTED_COMMENT}`,
    globalSignature.toString("base64"),
    "",
  ].join("\n");
}

function fixture(signature: string): {
  root: string;
  artifact: string;
  signature: string;
} {
  const root = mkdtempSync(resolve(tmpdir(), "sahelflow-updater-signature-"));
  fixtures.push(root);
  const artifact = resolve(root, "candidate.msi");
  const signaturePath = resolve(root, "candidate.msi.sig");

  write(
    resolve(root, "src-tauri", "tauri.conf.json"),
    `${JSON.stringify({ plugins: { updater: { pubkey: minisignPublicKeyBox() } } }, null, 2)}\n`,
  );
  write(
    resolve(root, "sahelflow.version.json"),
    `${JSON.stringify({ updater: { publicKeyId: PUBLIC_KEY_ID, signingKeyId: SIGNING_KEY_ID } }, null, 2)}\n`,
  );
  write(artifact, ARTIFACT);
  write(signaturePath, signature);

  return { root, artifact, signature: signaturePath };
}

function run(state: ReturnType<typeof fixture>) {
  return spawnSync(
    "bun",
    ["run", verifier, "--", state.artifact, state.signature],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, SF_REPO_DIR: state.root },
    },
  );
}

function output(result: ReturnType<typeof spawnSync>): string {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

afterEach(() => {
  while (fixtures.length > 0) {
    rmSync(fixtures.pop()!, { recursive: true, force: true });
  }
});

describe("updater artifact signature envelope", () => {
  it("accepts a plain minisign signature box", () => {
    const result = run(fixture(plainSignatureBox()));

    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain(
      `Updater artifact key binding verified: key ${PUBLIC_KEY_ID}`,
    );
  });

  it("accepts Tauri's outer-base64 minisign signature envelope", () => {
    const envelope = Buffer.from(plainSignatureBox(), "utf8").toString("base64");
    const result = run(fixture(envelope));

    expect(Buffer.from(envelope, "base64").length).toBeGreaterThan(74);
    expect(result.status, output(result)).toBe(0);
    expect(result.stdout).toContain(
      `Updater artifact key binding verified: key ${PUBLIC_KEY_ID}`,
    );
  });

  it("rejects an envelope signed by a different key ID", () => {
    const otherKeyId = "0011223344556677";
    const envelope = Buffer.from(
      plainSignatureBox(otherKeyId),
      "utf8",
    ).toString("base64");
    const result = run(fixture(envelope));

    expect(result.status).not.toBe(0);
    expect(output(result)).toContain("does not match compiled public key");
  });

  it("rejects an outer base64 value that is not a minisign box", () => {
    const malformed = Buffer.alloc(325, 0x41).toString("base64");
    const result = run(fixture(malformed));

    expect(result.status).not.toBe(0);
    expect(output(result)).toContain(
      "signature file must contain a complete minisign text box",
    );
  });
});
