from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8", newline="\n")


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one exact source block, found {count}")
    write(path, text.replace(old, new, 1))


def insert_before_last(path: str, marker: str, content: str) -> None:
    text = read(path)
    index = text.rfind(marker)
    if index < 0:
        raise RuntimeError(f"{path}: final marker not found")
    write(path, text[:index] + content + text[index:])


# Version authority: internal.2 is the corrected manual-install baseline.
package = json.loads(read("package.json"))
if package.get("version") != "1.0.0-internal.1":
    raise RuntimeError("package.json: unexpected starting version")
package["version"] = "1.0.0-internal.2"
write("package.json", json.dumps(package, indent=2, ensure_ascii=False) + "\n")

authority = json.loads(read("sahelflow.version.json"))
if authority.get("version") != "1.0.0-internal.1" or authority.get("windowsMsiVersion") != "1.0.0.1":
    raise RuntimeError("sahelflow.version.json: unexpected starting version")
authority["version"] = "1.0.0-internal.2"
authority["windowsMsiVersion"] = "1.0.0.2"
write("sahelflow.version.json", json.dumps(authority, indent=2) + "\n")

tauri = json.loads(read("src-tauri/tauri.conf.json"))
if tauri.get("version") != "1.0.0-internal.1":
    raise RuntimeError("src-tauri/tauri.conf.json: unexpected starting version")
tauri["version"] = "1.0.0-internal.2"
tauri["bundle"]["windows"]["wix"]["version"] = "1.0.0.2"
write("src-tauri/tauri.conf.json", json.dumps(tauri, indent=2) + "\n")

replace_once(
    "src-tauri/Cargo.toml",
    'version = "1.0.0-internal.1"',
    'version = "1.0.0-internal.2"',
)

cargo_lock = read("src-tauri/Cargo.lock")
updated_lock, replacements = re.subn(
    r'(\[\[package\]\]\nname = "sahelflow"\nversion = ")1\.0\.0-internal\.1("\n)',
    r'\g<1>1.0.0-internal.2\g<2>',
    cargo_lock,
    count=1,
)
if replacements != 1:
    raise RuntimeError("src-tauri/Cargo.lock: SahelFlow package version was not updated")
write("src-tauri/Cargo.lock", updated_lock)

# Generate and package an exact standalone tree authority.
replace_once(
    "src-tauri/build-frontend.ts",
    'import { prepareDesktopBuildContext } from "../scripts/desktop-build-context";\n',
    'import { prepareDesktopBuildContext } from "../scripts/desktop-build-context";\n'
    'import { writeStandaloneManifest } from "../scripts/standalone-manifest";\n',
)
replace_once(
    "src-tauri/build-frontend.ts",
    'const PINNED_BUN_VERSION = "1.3.14";\n',
    'const PINNED_BUN_VERSION = "1.3.14";\n'
    'const APP_VERSION = (\n'
    '  JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {\n'
    '    version?: unknown;\n'
    '  }\n'
    ').version;\n'
    'if (typeof APP_VERSION !== "string") {\n'
    '  throw new Error("package.json version is missing during desktop build");\n'
    '}\n',
)
replace_once(
    "src-tauri/build-frontend.ts",
    'if (existsSync(publicDir)) {\n'
    '  const standalonePublicDir = resolve(standaloneDir, "public");\n'
    '  cpSync(publicDir, standalonePublicDir, { recursive: true });\n'
    '  ok("Copied public → standalone");\n'
    '}\n\n'
    '// ── 3. Copy standalone → src-tauri/resources/standalone ─────────────────────\n',
    'if (existsSync(publicDir)) {\n'
    '  const standalonePublicDir = resolve(standaloneDir, "public");\n'
    '  cpSync(publicDir, standalonePublicDir, { recursive: true });\n'
    '  ok("Copied public → standalone");\n'
    '}\n\n'
    'const standaloneManifest = writeStandaloneManifest(standaloneDir, APP_VERSION);\n'
    'ok(\n'
    '  `Standalone manifest: ${standaloneManifest.fileCount} files; ${standaloneManifest.treeSha256}`,\n'
    ');\n\n'
    '// ── 3. Copy standalone → src-tauri/resources/standalone ─────────────────────\n',
)

# Containment supports an explicit working directory so Next resolves its staged tree.
replace_once(
    "src-tauri/src/child_containment.rs",
    '''        pub fn spawn(\n            program: &Path,\n            args: &[OsString],\n            environment: &[(OsString, OsString)],\n        ) -> Result<Self, SpawnError> {\n            let application = wide_null(program.as_os_str()).map_err(SpawnError::before_process)?;\n''',
    '''        pub fn spawn(\n            program: &Path,\n            args: &[OsString],\n            environment: &[(OsString, OsString)],\n        ) -> Result<Self, SpawnError> {\n            Self::spawn_in(program, args, environment, None)\n        }\n\n        pub fn spawn_in(\n            program: &Path,\n            args: &[OsString],\n            environment: &[(OsString, OsString)],\n            current_directory: Option<&Path>,\n        ) -> Result<Self, SpawnError> {\n            let application = wide_null(program.as_os_str()).map_err(SpawnError::before_process)?;\n''',
)
replace_once(
    "src-tauri/src/child_containment.rs",
    '''            let mut environment_block =\n                environment_block(environment).map_err(SpawnError::before_process)?;\n            let job = create_kill_on_close_job().map_err(SpawnError::before_process)?;\n''',
    '''            let mut environment_block =\n                environment_block(environment).map_err(SpawnError::before_process)?;\n            let current_directory = current_directory\n                .map(|path| wide_null(path.as_os_str()))\n                .transpose()\n                .map_err(SpawnError::before_process)?;\n            let job = create_kill_on_close_job().map_err(SpawnError::before_process)?;\n''',
)
replace_once(
    "src-tauri/src/child_containment.rs",
    '''                    environment_block.as_mut_ptr().cast(),\n                    std::ptr::null(),\n                    &startup.StartupInfo,\n''',
    '''                    environment_block.as_mut_ptr().cast(),\n                    current_directory\n                        .as_ref()\n                        .map_or(std::ptr::null(), |path| path.as_ptr()),\n                    &startup.StartupInfo,\n''',
)
replace_once(
    "src-tauri/src/child_containment.rs",
    '''        pub fn spawn(\n            program: &Path,\n            args: &[OsString],\n            environment: &[(OsString, OsString)],\n        ) -> Result<Self, SpawnError> {\n            let mut command = Command::new(program);\n            command\n                .args(args)\n                .env_clear()\n                .envs(environment.iter().cloned());\n''',
    '''        pub fn spawn(\n            program: &Path,\n            args: &[OsString],\n            environment: &[(OsString, OsString)],\n        ) -> Result<Self, SpawnError> {\n            Self::spawn_in(program, args, environment, None)\n        }\n\n        pub fn spawn_in(\n            program: &Path,\n            args: &[OsString],\n            environment: &[(OsString, OsString)],\n            current_directory: Option<&Path>,\n        ) -> Result<Self, SpawnError> {\n            let mut command = Command::new(program);\n            command\n                .args(args)\n                .env_clear()\n                .envs(environment.iter().cloned());\n            if let Some(directory) = current_directory {\n                command.current_dir(directory);\n            }\n''',
)

# Desktop staging and launch path.
replace_once(
    "src-tauri/src/lib.rs",
    'mod packaged_auth;\n',
    'mod packaged_auth;\nmod packaged_runtime;\n',
)
replace_once(
    "src-tauri/src/lib.rs",
    '''    let app_data_dir = app.path().app_data_dir()?;\n    let resource_dir = app.path().resource_dir()?;\n    let server_js = resource_dir.join("standalone").join("server.js");\n\n    if !server_js.exists() {\n        return Err(IoError::new(\n            ErrorKind::NotFound,\n            format!(\n                "Next.js standalone server is missing at {}. Reinstall SahelFlow or rebuild the candidate.",\n                server_js.display()\n            ),\n        )\n        .into());\n    }\n''',
    '''    let app_data_dir = app.path().app_data_dir()?;\n    let app_local_data_dir = app.path().app_local_data_dir()?;\n    let resource_dir = app.path().resource_dir()?;\n    let packaged_standalone = resource_dir.join("standalone");\n    let server_js = packaged_runtime::stage_standalone(\n        &packaged_standalone,\n        &app_local_data_dir,\n        env!("CARGO_PKG_VERSION"),\n    )\n    .map_err(|error| {\n        IoError::new(\n            ErrorKind::InvalidData,\n            format!("failed to stage the verified standalone runtime: {error}"),\n        )\n    })?;\n    let server_working_dir = server_js.parent().ok_or_else(|| {\n        IoError::new(\n            ErrorKind::InvalidData,\n            "staged standalone server has no working directory",\n        )\n    })?;\n''',
)
replace_once(
    "src-tauri/src/lib.rs",
    '''    let server_child = child_containment::ContainedChild::spawn(\n        Path::new(&runtime_path),\n        &[server_js.as_os_str().to_os_string()],\n        &process_environment(&env),\n    )\n''',
    '''    let server_child = child_containment::ContainedChild::spawn_in(\n        Path::new(&runtime_path),\n        &[server_js.as_os_str().to_os_string()],\n        &process_environment(&env),\n        Some(server_working_dir),\n    )\n''',
)

# Release evidence copies and verifies the generated standalone tree.
replace_once(
    "scripts/generate-release-evidence-worktree.ts",
    '''import {\n  cpSync,\n  existsSync,\n  mkdirSync,\n} from "node:fs";\n''',
    '''import {\n  cpSync,\n  existsSync,\n  mkdirSync,\n  rmSync,\n} from "node:fs";\n''',
)
replace_once(
    "scripts/generate-release-evidence-worktree.ts",
    '''mkdirSync(dirname(runtimeDestination), { recursive: true });\ncpSync(runtimeSource, runtimeDestination, { recursive: true });\n\nconst copiedEvidenceStatus = run(\n''',
    '''mkdirSync(dirname(runtimeDestination), { recursive: true });\ncpSync(runtimeSource, runtimeDestination, { recursive: true });\n\nconst standaloneSource = resolve(root, "src-tauri", "resources", "standalone");\nconst standaloneDestination = resolve(\n  evidenceRoot,\n  "src-tauri",\n  "resources",\n  "standalone",\n);\nif (!existsSync(standaloneSource)) {\n  throw new Error(`standalone evidence directory is missing: ${standaloneSource}`);\n}\nrmSync(standaloneDestination, { recursive: true, force: true });\nmkdirSync(dirname(standaloneDestination), { recursive: true });\ncpSync(standaloneSource, standaloneDestination, { recursive: true });\n\nconst copiedEvidenceStatus = run(\n''',
)

replace_once(
    "scripts/generate-evidence-manifest.ts",
    'import { spawnSync } from "node:child_process";\n',
    'import { spawnSync } from "node:child_process";\n'
    'import { verifyStandaloneManifest } from "./standalone-manifest";\n',
)
replace_once(
    "scripts/generate-evidence-manifest.ts",
    '''const authenticodeRequired = version.updater?.authenticodeRequired === true;\n\nconst manifest = {\n''',
    '''const authenticodeRequired = version.updater?.authenticodeRequired === true;\nconst standaloneDirectory = resolve(\n  root,\n  "src-tauri",\n  "resources",\n  "standalone",\n);\nconst standalone = verifyStandaloneManifest(standaloneDirectory, version.version);\n\nconst manifest = {\n''',
)
replace_once(
    "scripts/generate-evidence-manifest.ts",
    '''  runtime: runtimeFiles.map((path) => ({\n    file: relative(root, path).replaceAll("\\\\", "/"),\n    size: statSync(path).size,\n    sha256: sha256(path),\n  })),\n  artifacts: bundleFiles.map((path) => ({\n''',
    '''  runtime: runtimeFiles.map((path) => ({\n    file: relative(root, path).replaceAll("\\\\", "/"),\n    size: statSync(path).size,\n    sha256: sha256(path),\n  })),\n  standaloneRuntime: standalone,\n  artifacts: bundleFiles.map((path) => ({\n''',
)

# Windows CI and signed release must prove the exact staged packaged server.
replace_once(
    ".github/workflows/ci.yml",
    '''      - name: Build exact Windows standalone frontend resources\n        run: bun run src-tauri/build-frontend.ts\n''',
    '''      - name: Build exact Windows standalone frontend resources\n        run: bun run src-tauri/build-frontend.ts\n\n      - name: Verify staged packaged runtime reaches authenticated readiness\n        run: bun run scripts/verify-windows-packaged-runtime.ts\n\n      - name: Upload staged packaged runtime diagnostics\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: windows-packaged-runtime-diagnostics-${{ github.run_id }}\n          path: .sf-windows-runtime-smoke.log\n          if-no-files-found: error\n          retention-days: 2\n''',
)
replace_once(
    ".github/workflows/release.yml",
    '''          args: --bundles msi\n\n      - name: Verify local MSI and updater signature\n''',
    '''          args: --bundles msi\n\n      - name: Verify staged packaged runtime reaches authenticated readiness\n        run: bun run scripts/verify-windows-packaged-runtime.ts\n\n      - name: Upload staged packaged runtime diagnostics\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: signed-windows-packaged-runtime-diagnostics-${{ github.run_id }}\n          path: .sf-windows-runtime-smoke.log\n          if-no-files-found: error\n          retention-days: 2\n\n      - name: Verify local MSI and updater signature\n''',
)
replace_once(
    ".github/workflows/release.yml",
    '''            src-tauri/resources/runtime/runtime-manifest.json\n            ${{ env.SF_LATEST_JSON_PATH }}\n''',
    '''            src-tauri/resources/runtime/runtime-manifest.json\n            src-tauri/resources/standalone/sahelflow-standalone-manifest.json\n            ${{ env.SF_LATEST_JSON_PATH }}\n''',
)

replace_once(
    ".gitignore",
    '.sf-vitest-first-failure.txt\n',
    '.sf-vitest-first-failure.txt\n.sf-windows-runtime-smoke.log\n',
)

# Static contract prevents release and staging drift.
insert_before_last(
    "src/lib/__tests__/windows-release-build-contract.test.ts",
    "});",
    '''\n  it("stages and verifies the packaged standalone runtime before Bun launch", () => {\n    const frontendBuild = read("src-tauri/build-frontend.ts");\n    const desktop = read("src-tauri/src/lib.rs");\n    const staging = read("src-tauri/src/packaged_runtime.rs");\n    const containment = read("src-tauri/src/child_containment.rs");\n    const ci = read(".github/workflows/ci.yml");\n    const release = read(".github/workflows/release.yml");\n    const evidence = read("scripts/generate-evidence-manifest.ts");\n\n    expect(frontendBuild).toContain("writeStandaloneManifest(standaloneDir, APP_VERSION)");\n    expect(desktop).toContain("packaged_runtime::stage_standalone");\n    expect(desktop).toContain("ContainedChild::spawn_in");\n    expect(staging).toContain('const MANIFEST_FILE: &str = "sahelflow-standalone-manifest.json"');\n    expect(staging).toContain("cached standalone runtime failed verification");\n    expect(containment).toContain("current_directory: Option<&Path>");\n    expect(ci).toContain("verify-windows-packaged-runtime.ts");\n    expect(release).toContain("verify-windows-packaged-runtime.ts");\n    expect(release).toContain("sahelflow-standalone-manifest.json");\n    expect(evidence).toContain("verifyStandaloneManifest");\n  });\n''',
)

print("Readable runtime staging integration applied successfully")
