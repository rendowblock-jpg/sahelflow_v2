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
  autoPublishWorkflow?: boolean;
  channel?: "internal" | "beta" | "stable";
  continueOnGateError?: boolean;
  concretePublicationGuards?: boolean;
  publicationFailureGuard?: boolean;
  tagBindingGuard?: boolean;
  publishedTagLookupFailureGuard?: boolean;
  publishedTagPeelFailureGuard?: boolean;
  publishedTagMismatchFailureGuard?: boolean;
  malformedTagPeeling?: boolean;
  monotonicVersionGuard?: boolean;
  draftSafeLookup?: boolean;
  draftLookupApiFailureGuard?: boolean;
  draftLookupCompletionGuard?: boolean;
  draftLookupEnumerationFailureGuard?: boolean;
  draftLookupExactTagGuard?: boolean;
  draftLookupUniqueGuard?: boolean;
  draftLookupStateGuard?: boolean;
  draftTargetBindingGuard?: boolean;
  protectedEnvironment?: boolean;
  serializedPublication?: boolean;
}): string {
  const root = mkdtempSync(resolve(tmpdir(), "sahelflow-updater-contract-"));
  fixtureRoots.push(root);

  const authorityEnabled = options?.authorityEnabled ?? false;
  const tauriActive = options?.tauriActive ?? authorityEnabled;
  const createUpdaterArtifacts =
    options?.createUpdaterArtifacts ?? authorityEnabled;
  const selectedSigningKeyId =
    options?.signingKeyId ?? (authorityEnabled ? signingKeyId : null);
  const channel = options?.channel ?? "internal";
  const endpoint = "https://updates.example.test/internal/latest.json";
  const signedWorkflow = [
    "on:",
    "  workflow_dispatch:",
    "    inputs:",
    "      source_ref:",
    "        required: true",
    "permissions:",
    "  contents: write",
    ...(options?.serializedPublication ?? true
      ? [
          "concurrency:",
          "  group: sahelflow-internal-updater",
          "  cancel-in-progress: false",
        ]
      : []),
    "jobs:",
    "  windows-internal-updater:",
    ...(options?.protectedEnvironment ?? true
      ? ["    environment: internal-updater"]
      : []),
    "    steps:",
    "      - uses: tauri-apps/tauri-action@v0.6.2",
    "        env:",
    "          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
    "          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
    "        with:",
    "          releaseDraft: true",
    "          includeUpdaterJson: true",
    "      - run: echo artifact.msi.sig latest.json",
  ];
  signedWorkflow.push(
    "      - name: Verify staged packaged runtime reaches authenticated readiness",
    "        run: echo verified",
    "      - name: Verify local MSI and updater signature",
    ...(options?.continueOnGateError ? ["        continue-on-error: true"] : []),
    "        run: echo verified",
    "      - name: Install and prove signed runtime launch/reopen",
    "        run: echo verified",
    "      - name: Prove signed authenticated hydrated WebView UI twice",
    "        run: echo verified",
    "      - name: Verify deterministic build source rewrites",
    "        run: echo verified",
    "      - name: Generate signed candidate evidence manifest from clean worktree",
    "        run: echo verified",
    "      - name: Download and verify draft latest.json",
    "        run: echo verified",
    "      - name: Retain signed candidate and evidence",
    "        run: echo retained",
    "      - name: Verify exact draft publication target",
    "        run: |",
    ...(options?.draftSafeLookup ?? true
      ? [
          "          $releaseMatches = @()",
          "          $releaseEnumerationComplete = $false",
          "          for ($page = 1; $page -le 10; $page++) {",
          '            $releasePage = @(gh api "repos/repo/releases?per_page=100&page=$page" | ConvertFrom-Json)',
          ...(options?.draftLookupApiFailureGuard ?? true
            ? ["            if ($LASTEXITCODE -ne 0) { throw 'blocked' }"]
            : [
                "            if ($LASTEXITCODE -ne 0) { Write-Warning 'ignored' }",
              ]),
          ...(options?.draftLookupExactTagGuard ?? true
            ? [
                '            $releaseMatches += @($releasePage | Where-Object { $_.tag_name -ceq $env:SF_RELEASE_TAG })',
              ]
            : [
                '            $discardedMatches = @($releasePage | Where-Object { $_.tag_name -ceq $env:SF_RELEASE_TAG })',
                "            $releaseMatches += @($releasePage)",
              ]),
          ...(options?.draftLookupCompletionGuard ?? true
            ? [
                "            if ($releasePage.Count -lt 100) { $releaseEnumerationComplete = $true; break }",
              ]
            : ["            if ($releasePage.Count -lt 100) { break }"]),
          "          }",
          ...(options?.draftLookupEnumerationFailureGuard ?? true
            ? [
                "          if (-not $releaseEnumerationComplete) { throw 'blocked' }",
              ]
            : [
                "          if (-not $releaseEnumerationComplete) { Write-Warning 'ignored' }",
              ]),
          ...(options?.draftLookupUniqueGuard ?? true
            ? [
                "          if ($releaseMatches.Count -ne 1) { throw 'blocked' }",
              ]
            : [
                "          if ($releaseMatches.Count -ne 1) { Write-Warning 'ignored' }",
              ]),
          "          $release = $releaseMatches[0]",
          ...(options?.draftLookupStateGuard ?? true
            ? [
                "          if (-not $release.draft) { throw 'blocked' }",
                "          if ($release.prerelease) { throw 'blocked' }",
              ]
            : [
                "          if (-not $release.draft) { Write-Warning 'ignored' }",
                "          if ($release.prerelease) { Write-Warning 'ignored' }",
              ]),
          ...(options?.draftTargetBindingGuard ?? true
            ? [
                "          if ([string]$release.target_commitish -cne $env:SF_SOURCE_COMMIT) { throw 'blocked' }",
              ]
            : [
                "          if ([string]$release.target_commitish -cne $env:SF_SOURCE_COMMIT) { Write-Warning 'ignored' }",
              ]),
        ]
      : [
          '          $release = gh api "repos/repo/releases/tags/$env:SF_RELEASE_TAG"',
        ]),
  );
  if (options?.autoPublishWorkflow ?? true) {
    signedWorkflow.push(
      "      - name: Publish exact verified Internal release",
      "        run: |",
    );
    if (options?.concretePublicationGuards ?? true) {
      signedWorkflow.push(
        "          if ($env:SF_RELEASE_VERSION -cnotmatch '-internal\\.[0-9]+$') { throw 'blocked' }",
        '          $expectedTag = "sahelflow-v${env:SF_RELEASE_VERSION}-${env:SF_SOURCE_COMMIT}"',
      );
    } else {
      signedWorkflow.push(
        "          echo release version is not eligible for automatic Internal publication",
      );
    }
    if (options?.monotonicVersionGuard ?? true) {
      signedWorkflow.push(
        '          $latestRelease = gh api "repos/repo/releases/latest"',
        "          if ($currentBase -lt $latestBase -or ($currentBase -eq $latestBase -and $currentSequence -le $latestSequence)) { throw 'Internal publication must be strictly newer' }",
      );
    }
    signedWorkflow.push(
      "          gh release edit tag --draft=false --latest",
      ...(options?.publicationFailureGuard ?? true
        ? ["          if ($LASTEXITCODE -ne 0) { throw 'blocked' }"]
        : [
            "          if ($LASTEXITCODE -ne 0) { Write-Warning 'ignored' }",
          ]),
    );
    if (options?.tagBindingGuard ?? true) {
      signedWorkflow.push(
        '          $tagObject = gh api "repos/repo/git/ref/tags/$env:SF_RELEASE_TAG"',
        ...(options?.publishedTagLookupFailureGuard ?? true
          ? [
              "          if ($LASTEXITCODE -ne 0 -or $null -eq $tagObject) { throw 'blocked' }",
            ]
          : [
              "          if ($LASTEXITCODE -ne 0 -or $null -eq $tagObject) { Write-Warning 'ignored' }",
            ]),
        ...(options?.malformedTagPeeling
          ? [
              "          while ($tagObject.type -ceq 'tag') { $tagObject = $tagObject.object }",
            ]
          : [
              "          while ($tagObject.type -ceq 'tag') {",
              '            $tagObject = gh api "repos/repo/git/tags/$($tagObject.sha)"',
              ...(options?.publishedTagPeelFailureGuard ?? true
                ? [
                    "            if ($LASTEXITCODE -ne 0 -or $null -eq $tagObject) { throw 'blocked' }",
                  ]
                : [
                    "            if ($LASTEXITCODE -ne 0 -or $null -eq $tagObject) { Write-Warning 'ignored' }",
                  ]),
              "          }",
            ]),
        ...(options?.publishedTagMismatchFailureGuard ?? true
          ? [
              "          if ($tagObject.type -cne 'commit' -or $tagObject.sha -cne $env:SF_SOURCE_COMMIT) { throw 'blocked' }",
            ]
          : [
              "          if ($tagObject.type -cne 'commit' -or $tagObject.sha -cne $env:SF_SOURCE_COMMIT) { Write-Warning 'ignored' }",
            ]),
      );
    }
    signedWorkflow.push(
      "          echo Beta and Stable promotion remain manual Founder decisions",
    );
  }
  if (!(options?.protectedEnvironment ?? true)) {
    signedWorkflow.push(
      "  decoy-protected-job:",
      "    environment: internal-updater",
      "    steps:",
      "      - run: echo decoy",
    );
  }

  const files = new Map<string, string>([
    [
      "sahelflow.version.json",
      JSON.stringify(
        {
          channel,
          updater: {
            enabled: authorityEnabled,
            manifestFormatVersion: 1,
            channelStatus: authorityEnabled ? "approved" : "candidate",
            signingKeyStatus: authorityEnabled ? "approved" : "unaccepted",
            signingKeyId: selectedSigningKeyId,
            publicKeyId,
            approvalScope: channel === "internal" ? "internal-lab" : channel,
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
        ? signedWorkflow.join("\n")
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

  it("rejects an enabled updater without protected automatic publication", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        autoPublishWorkflow: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "include a protected final publication step",
    );
  });

  it("rejects automatic publication outside internal authority", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        channel: "beta",
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "restricted to the internal/internal-lab authority",
    );
  });

  it("rejects explanatory text in place of executable Internal guards", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        concretePublicationGuards: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("execute the concrete Internal version");
  });

  it("rejects publication that does not bind the actual tag ref", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        tagBindingGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("peel the actual release tag");
  });

  it("rejects publication that ignores a failed release edit", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        publicationFailureGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("peel the actual release tag");
  });

  it("rejects publication that ignores a failed tag lookup", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        publishedTagLookupFailureGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("peel the actual release tag");
  });

  it("rejects publication that ignores a failed annotated-tag peel", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        publishedTagPeelFailureGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("peel the actual release tag");
  });

  it("rejects publication that does not terminate on a tag mismatch", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        publishedTagMismatchFailureGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("peel the actual release tag");
  });

  it("rejects publication without a monotonic Internal version guard", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        monotonicVersionGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("non-increasing Internal version");
  });

  it("rejects draft lookup through the published release-by-tag endpoint", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftSafeLookup: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("enumerate authenticated releases");
  });

  it("rejects draft enumeration that ignores API failures", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftLookupApiFailureGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("enumerate authenticated releases");
  });

  it("rejects draft enumeration without a proven final page", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftLookupCompletionGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("enumerate authenticated releases");
  });

  it("rejects draft enumeration that only logs an incomplete scan", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftLookupEnumerationFailureGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("enumerate authenticated releases");
  });

  it("rejects draft enumeration without exact case-sensitive tag matching", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftLookupExactTagGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("enumerate authenticated releases");
  });

  it("rejects draft enumeration without release-state guards", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftLookupStateGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("enumerate authenticated releases");
  });

  it("rejects a draft whose exact source target is not fail closed", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftTargetBindingGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("bind its target to the exact source");
  });

  it("rejects draft enumeration that only logs ambiguous matches", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        draftLookupUniqueGuard: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("enumerate authenticated releases");
  });

  it("rejects automatic publication without serialized signed candidates", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        serializedPublication: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("serialize candidates");
  });

  it("rejects a protected-environment decoy outside the publishing job", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        protectedEnvironment: false,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "inside the protected internal-updater environment",
    );
  });

  it("rejects a tag loop that never calls the annotated-tag API", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        malformedTagPeeling: true,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("peel the actual release tag");
  });

  it("rejects a signed gate configured to continue after failure", () => {
    const result = verify(
      writeFixture({
        authorityEnabled: true,
        signedWorkflow: true,
        continueOnGateError: true,
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must not continue after errors");
  });

  it("accepts a coherently approved signed and auto-published Internal configuration", () => {
    const result = verify(
      writeFixture({ authorityEnabled: true, signedWorkflow: true }),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `internal/internal-lab enabled with key ${signingKeyId}`,
    );
  });
});
