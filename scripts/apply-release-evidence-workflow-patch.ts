#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";

const path = ".github/workflows/release.yml";
let source = readFileSync(path, "utf8");

function replaceOnce(label: string, before: string, after: string): void {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source block was not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected source block is not unique`);
  }
  source = source.slice(0, first) + after + source.slice(first + before.length);
}

replaceOnce(
  "clean source attestation",
  `      - name: Setup Bun\n`,
  `      - name: Attest clean exact source checkout\n        shell: pwsh\n        env:\n          SOURCE_SHA: \${{ inputs.source_ref }}\n        run: |\n          $status = @(git status --porcelain --untracked-files=all)\n          if ($LASTEXITCODE -ne 0) { throw 'failed to inspect exact source checkout' }\n          if ($status.Count -gt 0) {\n            $status | ForEach-Object { Write-Host $_ }\n            throw 'exact source checkout is not clean before validation or build'\n          }\n\n          $commit = (git rev-parse HEAD).Trim()\n          $tree = (git rev-parse "HEAD^{tree}").Trim()\n          if ($commit -cne $env:SOURCE_SHA) {\n            throw "source attestation commit mismatch: expected $env:SOURCE_SHA, found $commit"\n          }\n          if ($tree -cnotmatch '^[0-9a-f]{40}$') {\n            throw "source attestation tree is invalid: $tree"\n          }\n          "SF_SOURCE_COMMIT=$commit" >> $env:GITHUB_ENV\n          "SF_SOURCE_TREE=$tree" >> $env:GITHUB_ENV\n\n      - name: Setup Bun\n`,
);

replaceOnce(
  "source-bound release identity",
  `          $tag = "sahelflow-v$($authority.version)"\n`,
  `          $tag = "sahelflow-v$($authority.version)-$env:SF_SOURCE_COMMIT"\n`,
);

replaceOnce(
  "source-bound Tauri draft tag",
  `          tagName: sahelflow-v__VERSION__\n`,
  `          tagName: sahelflow-v__VERSION__-\${{ inputs.source_ref }}\n`,
);

replaceOnce(
  "clean evidence worktree handoff",
  `      - name: Generate signed candidate evidence manifest\n        env:\n          SF_RELEASE_TAG: \${{ env.SF_RELEASE_TAG }}\n        run: bun run sf-evidence -- --require-clean --signed-updater\n`,
  `      - name: Verify build preserved tracked source\n        shell: pwsh\n        run: |\n          $commit = (git rev-parse HEAD).Trim()\n          $tree = (git rev-parse "HEAD^{tree}").Trim()\n          if ($commit -cne $env:SF_SOURCE_COMMIT) {\n            throw "source commit changed during build: expected $env:SF_SOURCE_COMMIT, found $commit"\n          }\n          if ($tree -cne $env:SF_SOURCE_TREE) {\n            throw "source tree changed during build: expected $env:SF_SOURCE_TREE, found $tree"\n          }\n          $trackedStatus = @(git status --porcelain --untracked-files=no)\n          if ($LASTEXITCODE -ne 0) { throw 'failed to inspect tracked source after build' }\n          if ($trackedStatus.Count -gt 0) {\n            $trackedStatus | ForEach-Object { Write-Host $_ }\n            throw 'build modified tracked source; evidence generation is blocked'\n          }\n\n      - name: Generate signed candidate evidence manifest from clean worktree\n        env:\n          SF_RELEASE_TAG: \${{ env.SF_RELEASE_TAG }}\n        run: bun run scripts/generate-release-evidence-worktree.ts\n`,
);

if (source.includes("gh release delete") || source.includes("git clean -fd")) {
  throw new Error("destructive release or source cleanup commands are forbidden");
}
if (source.includes("run: bun run sf-evidence -- --require-clean --signed-updater")) {
  throw new Error("post-build evidence still runs in the build worktree");
}

writeFileSync(path, source, "utf8");
console.log("Applied exact clean-worktree release evidence patch");
