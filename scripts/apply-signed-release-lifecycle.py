from pathlib import Path

release_path = Path(".github/workflows/release.yml")
source = release_path.read_text(encoding="utf-8")

insertion_marker = """      - name: Verify deterministic build source rewrites
        run: bun run scripts/verify-release-source.ts
"""
lifecycle = """      - name: Install and prove signed launch/reopen
        shell: pwsh
        run: |
          $destination = Join-Path $env:RUNNER_TEMP 'sahelflow-installed-e2e'
          New-Item -ItemType Directory -Path $destination -Force | Out-Null
          try {
            ./scripts/verify-installed-windows-msi.ps1 -MsiPath $env:SF_MSI_PATH
          } catch {
            $_ | Format-List * -Force | Out-String |
              Set-Content -LiteralPath (Join-Path $destination 'signed-lifecycle-error.txt') -Encoding UTF8
            throw
          }

      - name: Upload signed installed lifecycle diagnostics
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: signed-installed-lifecycle-diagnostics-${{ github.run_id }}
          path: ${{ runner.temp }}/sahelflow-installed-e2e/**
          if-no-files-found: ignore
          retention-days: 7

"""

if "Install and prove signed launch/reopen" not in source:
    count = source.count(insertion_marker)
    if count != 1:
        raise SystemExit(f"expected one release source-rewrite marker, found {count}")
    source = source.replace(insertion_marker, lifecycle + insertion_marker, 1)

retention_line = (
    "            .sf-build/libsodium-dist/"
    "sahelflow-libsodium-build-manifest.json\n"
)
retained_lifecycle = "            ${{ runner.temp }}/sahelflow-installed-e2e/**\n"
parts = source.split("      - name: Retain signed candidate and evidence", 1)
if len(parts) != 2:
    raise SystemExit("signed candidate retention step is missing")
if retained_lifecycle not in parts[1]:
    count = source.count(retention_line)
    if count != 1:
        raise SystemExit(f"expected one signed evidence retention marker, found {count}")
    source = source.replace(retention_line, retention_line + retained_lifecycle, 1)

required = [
    "Install and prove signed launch/reopen",
    "./scripts/verify-installed-windows-msi.ps1 -MsiPath $env:SF_MSI_PATH",
    "signed-installed-lifecycle-diagnostics-${{ github.run_id }}",
    "${{ runner.temp }}/sahelflow-installed-e2e/**",
]
missing = [item for item in required if item not in source]
if missing:
    raise SystemExit("signed lifecycle gate missing: " + ", ".join(missing))

release_path.write_text(source, encoding="utf-8")
