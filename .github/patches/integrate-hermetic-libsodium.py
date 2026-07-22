from pathlib import Path

root = Path(__file__).resolve().parents[2]


def replace_once(path: str, old: str, new: str) -> None:
    target = root / path
    text = target.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}")
    target.write_text(text.replace(old, new, 1), encoding="utf-8")


release_step = """      - name: Build bundled WhatsApp sidecar
        run: bun run build:sidecar

      - name: Prepare disposable test sandbox
"""
release_step_with_sodium = """      - name: Build bundled WhatsApp sidecar
        run: bun run build:sidecar

      - name: Prepare signed local libsodium distribution
        shell: pwsh
        run: ./scripts/prepare-libsodium-windows.ps1

      - name: Prepare disposable test sandbox
"""
replace_once(".github/workflows/release.yml", release_step, release_step_with_sodium)

replace_once(
    ".github/workflows/release.yml",
    """            src-tauri/resources/standalone/sahelflow-standalone-manifest.json
            ${{ env.SF_LATEST_JSON_PATH }}
""",
    """            src-tauri/resources/standalone/sahelflow-standalone-manifest.json
            .sf-build/libsodium-dist/sahelflow-libsodium-build-manifest.json
            ${{ env.SF_LATEST_JSON_PATH }}
""",
)

parity = root / ".github/workflows/windows-rust-release-parity.yml"
parity_text = parity.read_text(encoding="utf-8")
path_anchor = '      - "scripts/prepare-runtime.ts"\n'
if parity_text.count(path_anchor) != 2:
    raise SystemExit("release-parity workflow path filters drifted")
parity_text = parity_text.replace(
    path_anchor,
    path_anchor + '      - "scripts/prepare-libsodium-windows.ps1"\n',
)
parity.write_text(parity_text, encoding="utf-8")

replace_once(
    ".github/workflows/windows-rust-release-parity.yml",
    """      - name: Build bundled WhatsApp sidecar
        run: bun run build:sidecar

      - name: Verify canonical Rust formatting
""",
    """      - name: Build bundled WhatsApp sidecar
        run: bun run build:sidecar

      - name: Prepare signed local libsodium distribution
        shell: pwsh
        run: ./scripts/prepare-libsodium-windows.ps1

      - name: Verify canonical Rust formatting
""",
)

replace_once(
    ".github/workflows/ci.yml",
    """      - name: Build exact Windows standalone frontend resources
        run: bun run src-tauri/build-frontend.ts

      - name: Verify bundled Bun through actual contained launcher
""",
    """      - name: Build exact Windows standalone frontend resources
        run: bun run src-tauri/build-frontend.ts

      - name: Prepare signed local libsodium distribution
        shell: pwsh
        run: ./scripts/prepare-libsodium-windows.ps1

      - name: Verify bundled Bun through actual contained launcher
""",
)

replace_once(
    ".gitignore",
    """.sf-inventory/
.sf-evidence/
""",
    """.sf-inventory/
.sf-evidence/
.sf-build/
""",
)

test_path = root / "src/lib/__tests__/windows-release-build-contract.test.ts"
test_text = test_path.read_text(encoding="utf-8")
marker = "\n});\n"
if not test_text.endswith(marker):
    raise SystemExit("Windows release contract test ending drifted")
new_test = r'''

  it("prepares a signed local libsodium distribution before every Windows Rust build", () => {
    const prepare = read("scripts/prepare-libsodium-windows.ps1");
    const ci = read(".github/workflows/ci.yml");
    const parity = read(".github/workflows/windows-rust-release-parity.yml");
    const release = read(".github/workflows/release.yml");

    expect(prepare).toContain("libsodium-1.0.22-msvc.zip");
    expect(prepare).toContain("1.0.22-RELEASE");
    expect(prepare).toContain("SODIUM_DIST_DIR");
    expect(prepare).toContain("RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3");
    expect(prepare).not.toContain("http://download.libsodium.org");
    expect(ci).toContain("prepare-libsodium-windows.ps1");
    expect(parity).toContain("prepare-libsodium-windows.ps1");
    expect(release).toContain("prepare-libsodium-windows.ps1");
    expect(release.indexOf("Prepare signed local libsodium distribution")).toBeLessThan(
      release.indexOf("Verify Rust runtime and actual contained Bun launcher"),
    );
    expect(release).toContain("sahelflow-libsodium-build-manifest.json");
  });
'''
test_path.write_text(test_text[: -len(marker)] + new_test + marker, encoding="utf-8")

# This one-shot script intentionally exists only long enough to generate the reviewed files.
