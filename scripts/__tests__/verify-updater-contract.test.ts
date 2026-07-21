import { spawnSync } from "node:child_process";
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
  new URL("../verify-updater-contract.ts", import.meta.url),
);
const fixtureRoots: string[] = [];
const publicKeyId = "C7183693A0589B55";
const signingKeyId = "tauri-internal-c7183693a0589b55";
const publicKey = Buffer.from(
  `untrusted comment: minisign public key: ${publicKeyId}\nfixture-key-material\n`,
).toString("base64");

function writeFixture(options?: {
  authorityEnabled?: boolean;
  tauriActive?: boolean;
  createUpdaterArtifacts?: boolean;
  signingKeyId?: string | null;
  signedWorkflow?: boolean;
}): string {
  const root = mkdtempSync(resolve(tmpdir(), "sahelflow-updater-contract-"));
  fixtureRoots.push(root);

  const authorityEnabled = options?.authorityEnabled ?? false;
  const tauriActive = options?.tauriActive ?? authorityEnabled;
  const createUpdaterArtifacts =
    options?.createUpdaterArtifacts ?? authorityEnabled;
  const selectedSigningKeyId =
    options?.signingKeyId ?? (authorityEnabled ? signingKeyId : null);
  const endpoint = "https://updates.example.test/internal/latest.json";

  const files = new Map<string, string>([
    [
      "sahelflow.version.json",
      JSON.stringify(
        {
          channel: "internal",
          updater: {
            enabled: authorityEnabled,
            manifestFormatVersion: 1,
            channelStatus: authorityEnabled ? "approved" : "candidate",
            signingKeyStatus: authorityEnabled ? "approved" : "unaccepted",
            signingKeyId: selectedSigningKeyId,
            publicKeyId,
            approvalScope: "internal-lab",
            authenticodeRequired: false,
            endpoint,
            installMode: "passive",
          },
        },
        null,
        2,
      ),
    ],
    [
      "src-tauri/tauri.conf.json",
      JSON.stringify(
        {
          bundle: { createUpdaterArtifacts },
          plugins: {
            updater: {
              active: tauriActive,
              endpoints: [endpoint],
              pubkey: publicKey,
              windows: { installMode: "passive" },
            },
          },
        },
        null,
        2,
      ),
    ],
    [
      ".github/workflows/release.yml",
      options?.signedWorkflow
        ? [
            "on:",
            "  workflow_dispatch:",
            "    inputs:",
            "      source_ref:",
            "        required: true",
            "permissions:",
            "  contents: write",
            "jobs:",
            "  release:",
            "    environment: internal-updater",
            "    steps:",
            "      - uses: tauri-apps/tauri-action@v0.6.2",
            "        env:",
            "          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
            "          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
            "        with:",
            "          releaseDraft: true",
            "          uploadUpdaterJson: true",
            "          uploadUpdaterSignatures: true",
            "      - run: echo latest.json",
          ].join("\n")
        : [
            "permissions:",
            "  contents: read",
            "jobs:",
            "  evidence:",
            "    steps:",
            "      - run: bunx tauri build --no-sign",
            "      - run: echo UNSIGNED",
          ].join("\n"),
    ],
  ]);

  for (const [relativePath, content] of files) {
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${content}\n`, "utf8");
  }

  return root;
}

function verify(root: string) {
  return spawnSync("bun", [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, SF_REPO_DIR: root },
  });
}

afterEach(() => {
  while (fixtureRoots.length > 0) {
    rmSync(fixtureRoots.pop()!, { recursive: true, force: true });
  }
});

describe("verify-updater-contract", () => {
  it("accepts the disabled unsigned evidence baseline", () => {
    const result = verify(writeFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("remains disabled");
    expect(result.stdout).toContain("channel candidate");
    expect(result.stdout).toContain("key unaccepted");
  });

  it("rejects Tauri activation that disagrees with version authority", () => {
    const result = verify(
      writeFixture({ authorityEnabled: false, tauriActive: true }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Tauri updater.active");
  });

  it("rejects an enabled updater that retains the unsigned workflow", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signingKeyId: null,
        signedWorkflow: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("signingKeyId");
    expect(result.stderr).toContain("must not use --no-sign");
    expect(result.stderr).toContain("must not label artifacts UNSIGNED");
  });

  it("accepts a coherently approved signed draft configuration", () => {
    const result = verify(
      writeFixture({ authorityEnabled: true, signedWorkflow: true }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `internal/internal-lab enabled with key ${signingKeyId}`,
    );
  });
});
