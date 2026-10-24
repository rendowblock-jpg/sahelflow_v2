import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts", "rotate-master-key.ts");
const source = readFileSync(scriptPath, "utf8");
const contextPath = resolve(process.cwd(), "src", "lib", "shops", "context.ts");
const authorityPath = resolve(process.cwd(), "src", "lib", "shops", "authority.ts");
const contextSource = readFileSync(contextPath, "utf8");
const authoritySource = readFileSync(authorityPath, "utf8");
const nativeRotationSource = readFileSync(
  resolve(process.cwd(), "src-tauri", "src", "installation_root_rotation.rs"),
  "utf8",
);
const installationRootSource = readFileSync(
  resolve(process.cwd(), "src-tauri", "src", "installation_root_key.rs"),
  "utf8",
);
const desktopBuildSource = readFileSync(
  resolve(process.cwd(), "src-tauri", "build-frontend.ts"),
  "utf8",
);
const stagedRuntimeSource = readFileSync(
  resolve(process.cwd(), "scripts", "verify-windows-packaged-runtime.ts"),
  "utf8",
);

// Pins that read source text must not be fooled by a call that was only
// commented out, and must check place and order (inside which function,
// before which statement), not just that a phrase exists somewhere.
function stripComments(text: string): string {
  return text.replace(
    /("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (_match, quoted: string | undefined) => quoted ?? "",
  );
}

function matchBraces(code: string, open: number): string {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === "{") depth += 1;
    if (code[index] === "}") {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, index);
    }
  }
  throw new Error("Unbalanced braces in pinned source");
}

function functionBody(code: string, name: string): string {
  const found = new RegExp(`function ${name}\\(`).exec(code);
  if (!found) throw new Error(`Pinned function not found: ${name}`);
  return matchBraces(code, code.indexOf("{", found.index));
}

// The statement that follows `condition`: a block, or one line up to its `;`.
function branchBody(code: string, condition: string): string {
  const at = code.indexOf(condition);
  if (at === -1) throw new Error(`Pinned branch not found: ${condition}`);
  const after = at + condition.length;
  const start = after + code.slice(after).search(/\S/);
  if (code[start] === "{") return matchBraces(code, start);
  return code.slice(start, code.indexOf(";", start) + 1);
}

// Every snippet must occur in `text`, each after the one before it.
function expectInOrder(text: string, snippets: readonly string[]): void {
  let from = 0;
  for (const snippet of snippets) {
    const at = text.indexOf(snippet, from);
    expect(at, `"${snippet}" is missing after offset ${from}`).toBeGreaterThan(-1);
    from = at + snippet.length;
  }
}

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

describe("installation-wide master-key rotation authority", () => {
  it("discovers registered shops and includes the provisioning template", () => {
    expect(source).toContain('"shop-registry.json"');
    expect(source).toContain('"shops"');
    expect(source).toContain('"shop-template.db"');
    expect(source).toContain("SF_ROTATION_STAGE_");

    // Every registered shop becomes a target through validateRegistryTarget,
    // which rejects a bad shop ID or file name and a missing database instead
    // of skipping the shop. The provisioning template is added after them.
    const code = stripComments(source);
    expectInOrder(functionBody(code, "loadRotationTargets"), [
      "existsSync(REGISTRY_PATH)",
      "parsed.formatVersion !== REGISTRY_FORMAT_VERSION",
      "parsed.shops.map((shop) => validateRegistryTarget(parsed, shop))",
      "existsSync(SHOP_TEMPLATE_PATH)",
      'id: "system-shop-template"',
    ]);
    expectInOrder(functionBody(code, "validateRegistryTarget"), [
      "invalid shop ID",
      "invalid database file identity",
      "if (!existsSync(databasePath))",
      "throw new Error(`Registered shop database is missing",
      "return {",
    ]);
  });

  it("uses one old/new key pair for every target before committing the keyfile", () => {
    const targetLoop = source.indexOf(
      "for (const target of targets)",
      source.indexOf("const allStats"),
    );
    const rotateTarget = source.indexOf(
      "rotateTarget(target, oldKey, newKey, (nextStage)",
      targetLoop,
    );
    const commitKeyfile = source.indexOf("commitKeyfile(newKey)", rotateTarget);

    expect(targetLoop).toBeGreaterThan(-1);
    expect(rotateTarget).toBeGreaterThan(targetLoop);
    expect(commitKeyfile).toBeGreaterThan(rotateTarget);
    expect(source.slice(rotateTarget, commitKeyfile)).not.toContain(
      "renameSync(SIDECAR_PATH",
    );

    // Every legacy value that opens under the old key is written back under
    // the NEW key, never the old one. A value that already opens under the new
    // key is left alone, so a resumed rotation can run again safely.
    const code = stripComments(source);
    const encryptCalls = [...code.matchAll(/\bencryptString\(([^)]*)\)/g)];
    expect(encryptCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of encryptCalls) expect(call[1]).toMatch(/,\s*newKey$/);
    expectInOrder(functionBody(code, "rotateStoredValue"), [
      "decryptString(payload, oldKey)",
      "encryptString(plaintext, newKey)",
      "decryptString(payload, newKey)",
      'state: "already-new"',
    ]);
    expectInOrder(functionBody(code, "rotateSecrets"), [
      "decryptString(payload, oldKey)",
      "encryptString(plaintext, newKey)",
      "tx.secret.update(",
    ]);
  });

  it("re-wraps Secrets for every shop and fails instead of skipping corruption", () => {
    expect(source).toContain(
      "await rotateSecrets(client, target.id, oldKey, newKey)",
    );
    expect(source).toContain("is undecryptable");
    expect(source).not.toContain(
      "Multi-shop rotation. The script operates on the DATABASE_URL shop only",
    );
    expect(source).not.toContain("run once per shop");
  });

  it("keeps the old keyfile authoritative until every database succeeds", () => {
    const code = stripComments(source);
    const commitBody = functionBody(code, "commitKeyfile");
    const loadBody = functionBody(code, "loadOrCreateNewKey");
    const mainBody = functionBody(code, "main");

    // The shared keyfile is written in one place only: commitKeyfile.
    const keyfileWrite =
      /\b(?:renameSync|copyFileSync|writeFileSync|appendFileSync|unlinkSync|rmSync|truncateSync|linkSync|symlinkSync)\s*\([^;]*\bKEYFILE_PATH\b/g;
    expect(count(code, keyfileWrite)).toBeGreaterThan(0);
    expect(count(commitBody, keyfileWrite)).toBe(count(code, keyfileWrite));
    expect(count(code, /"master\.key"/g)).toBe(1);

    // commitKeyfile runs once: after every database, the connected
    // installation authority and the identity authority were rotated, and
    // never in a dry run.
    expect(count(mainBody, /commitKeyfile\(/g)).toBe(1);
    expectInOrder(mainBody, [
      "for (const target of targets)",
      "rotateTarget(target, oldKey, newKey",
      "rotateConnectedInstallationAuthorityProtection(",
      "rotateIdentityAuthorityAuthentication(",
      "if (DRY_RUN)",
      "commitKeyfile(newKey)",
      "keyfileCommitted = true",
    ]);
    const afterIdentity = mainBody.slice(
      mainBody.indexOf("rotateIdentityAuthorityAuthentication("),
    );
    expect(branchBody(afterIdentity, "if (DRY_RUN)")).toContain("return;");

    // A crash leaves the sidecar: it is removed only by --force inside
    // loadOrCreateNewKey, and consumed only by the final rename in
    // commitKeyfile.
    const sidecarRemoval = /\b(?:unlinkSync|rmSync)\(\s*SIDECAR_PATH\b/g;
    expect(count(code, sidecarRemoval)).toBe(1);
    expect(count(loadBody, sidecarRemoval)).toBe(1);
    const sidecarRename = /\brenameSync\(\s*SIDECAR_PATH\b/g;
    expect(count(code, sidecarRename)).toBe(1);
    expect(count(commitBody, sidecarRename)).toBe(1);

    // A rerun resumes with the key the sidecar already holds.
    expectInOrder(loadBody, [
      "existsSync(SIDECAR_PATH)",
      "readKey(SIDECAR_PATH)",
      "return resumed;",
    ]);
    expect(source).toContain("loadOrCreateNewKey(oldKey)");
    expect(source).toContain(
      "Keep ${SIDECAR_PATH}; rerunning will resume with the same new key.",
    );
  });

  it("durably persists the sidecar before entering the mutation window", () => {
    const code = stripComments(source);
    const writeSidecar = functionBody(code, "writeDurableSidecar");

    // The key bytes reach the disk before the file gets its final name, and
    // the naming itself is durable: write-through on Windows, a directory
    // flush after the rename elsewhere.
    expectInOrder(writeSidecar, [
      "writeFileSync(sidecarHandle",
      "fsyncSync(sidecarHandle)",
      'process.platform === "win32"',
      "moveFileWriteThroughWindows(temporaryPath, SIDECAR_PATH)",
      "renameSync(temporaryPath, SIDECAR_PATH)",
      "fsyncDirectory(dataDir())",
    ]);

    // The Windows move must really carry MOVEFILE_WRITE_THROUGH (0x8). The
    // flag is passed as a number, so its name in the error text proves nothing.
    const moveBody = functionBody(code, "moveFileWriteThroughWindows");
    const moveEx =
      /MoveFileEx\(\s*\$\{powershellLiteral\(source\)\},\s*\$\{powershellLiteral\(target\)\},\s*(\d+)\s*\)/.exec(
        moveBody,
      );
    expect(moveEx, "MoveFileEx call with numeric flags").not.toBeNull();
    const moveFlags = Number(moveEx?.[1]);
    expect(moveFlags & 0x8).toBe(0x8);
    // DELAY_UNTIL_REBOOT would publish the sidecar only at the next boot.
    expect(moveFlags & 0x4).toBe(0);
    // A move that failed must stop the rotation, not be ignored.
    expect(moveBody).toMatch(/if \(result\.status !== 0\) \{\s*throw /);

    // Only the durable writer gives the sidecar its name, and only
    // loadOrCreateNewKey calls it, before it hands the new key out.
    const sidecarPublish =
      /\b(?:renameSync|copyFileSync|moveFileWriteThroughWindows)\(\s*\w+,\s*SIDECAR_PATH\s*\)/g;
    expect(count(code, sidecarPublish)).toBe(2);
    expect(count(writeSidecar, sidecarPublish)).toBe(2);
    expect(count(code, /writeFileSync\(\s*SIDECAR_PATH/g)).toBe(0);
    expect(count(code, /writeDurableSidecar\(/g)).toBe(2);
    expectInOrder(functionBody(code, "loadOrCreateNewKey"), [
      "writeDurableSidecar(newKey)",
      "return newKey;",
    ]);

    // The sidecar exists before the mutation window opens, and the old keyfile
    // is replaced only after that.
    const mainBody = functionBody(code, "main");
    const loadSidecar = mainBody.indexOf("loadOrCreateNewKey(oldKey)");
    const mutationWindow = mainBody.indexOf("mutationWindowEntered = true");
    expect(loadSidecar).toBeGreaterThan(-1);
    expect(count(mainBody, /mutationWindowEntered = true/g)).toBe(1);
    expect(mutationWindow).toBeGreaterThan(loadSidecar);
    expect(mainBody.indexOf("commitKeyfile(newKey)")).toBeGreaterThan(
      mutationWindow,
    );
  });

  it("proves the desktop runtime is stopped before scanning databases", () => {
    const lease = source.indexOf("lease = acquireRotationLease()");
    const stopped = source.indexOf("await assertApplicationStopped()", lease);
    const targets = source.indexOf("const targets = loadRotationTargets()", stopped);

    expect(source).toContain('"runtime-endpoint.json"');
    expect(source).toContain("processIsAlive(manifest.processId)");
    expect(source).toContain("loopbackPortIsOpen(manifest.appPort)");
    expect(lease).toBeGreaterThan(-1);
    expect(stopped).toBeGreaterThan(lease);
    expect(targets).toBeGreaterThan(stopped);
  });

  it("uses an explicit bounded maintenance transaction budget", () => {
    expect(source).toContain("ROTATION_TRANSACTION_MAX_WAIT_MS = 30_000");
    expect(source).toContain("ROTATION_TRANSACTION_TIMEOUT_MS = 5 * 60_000");
    expect(source).toContain("transactionOptions: {");
    expect(source).toContain("maxWait: ROTATION_TRANSACTION_MAX_WAIT_MS");
    expect(source).toContain("timeout: ROTATION_TRANSACTION_TIMEOUT_MS");
  });

  it("blocks packaged startup and production writes while the lease exists", () => {
    // Packaged startup: the lease/sidecar guard runs before any shop context
    // value is read or returned.
    const context = stripComments(contextSource);
    expect(context).toContain(
      'import { assertMasterKeyRotationInactive } from "@/lib/maintenance/master-key-rotation"',
    );
    expect(context).toContain(
      'const packaged = process.env.NODE_ENV === "production"',
    );
    const contextBody = functionBody(context, "processShopContext");
    expect(branchBody(contextBody, "if (packaged)")).toContain(
      "assertMasterKeyRotationInactive()",
    );
    expectInOrder(contextBody, [
      "if (packaged)",
      "const shopId",
      "return Object.freeze(",
    ]);

    // Production writes: the same guard runs before the registry is read.
    const authority = stripComments(authoritySource);
    expect(authority).toContain(
      'import { assertMasterKeyRotationInactive } from "@/lib/maintenance/master-key-rotation"',
    );
    expectInOrder(functionBody(authority, "assertProcessShopAuthority"), [
      "assertMasterKeyRotationInactive()",
      "readFileSync(registryPath",
    ]);
  });

  it("records lock ownership and safely recovers dead or malformed owners", () => {
    expect(source).toContain("ownerPid: process.pid");
    expect(source).toContain('token: randomUUID().replaceAll("-", "")');
    expect(source).toContain("processIsAlive(existing.ownerPid)");
    expect(source).toContain("--recover-stale-lock");
    expect(source).toContain("current.token !== lease.record.token");
    expect(source).toContain("removeStaleRotationLock(existing.token)");
  });

  it("retains the startup/write barrier after any mutation-window failure", () => {
    const mutationWindow = source.indexOf("mutationWindowEntered = true");
    const retainDecision = source.indexOf(
      "mutationWindowEntered && !keyfileCommitted",
      mutationWindow,
    );
    const finishLease = source.indexOf(
      "finishRotationLease(lease, !retainMaintenanceLease)",
      retainDecision,
    );

    expect(mutationWindow).toBeGreaterThan(-1);
    expect(retainDecision).toBeGreaterThan(mutationWindow);
    expect(finishLease).toBeGreaterThan(retainDecision);
    expect(source).toContain(
      "Maintenance lease retained at ${LOCK_PATH}",
    );
    expect(source).toContain(
      "it intentionally blocks SahelFlow until a successful resume",
    );
  });

  it("delegates protected installations to the installed native authority", () => {
    expect(source).toContain('spawnSync(executable, ["--rotate-installation-root"]');
    expect(source).toContain("Protected rotation delegation is restricted");
    expect(source).toContain('Buffer.from("SFRKRT01", "ascii")');
    expect(source).toContain("readSync(0, frame");
    expect(source).toContain("frame.fill(0)");
  });

  it("bundles and contains the native rotation worker", () => {
    expect(desktopBuildSource).toContain('"sahelflow-rotate-master-key.cjs"');
    expect(desktopBuildSource).toContain('"--external=@prisma/client"');
    expect(desktopBuildSource).not.toContain('"--packages=external"');
    expect(desktopBuildSource).toContain('"--format=cjs"');
    expect(desktopBuildSource).toContain('"--conditions=react-server"');
    expect(nativeRotationSource).toContain(
      "spawn_in_capturing_stderr_with_stdin_frame",
    );
    expect(nativeRotationSource).toContain("assert_runtime_stopped(app_data_dir)");
    expect(nativeRotationSource).toContain(
      "crate::node_entrypoint_environment_value(&worker)",
    );
    expect(nativeRotationSource).toContain(
      "crate::node_entrypoint_environment_value(&prisma_engine)",
    );
    expect(nativeRotationSource).toContain(
      "MAX_RUNTIME_MANIFEST_BYTES: u64 = 16 * 1024",
    );
    expect(nativeRotationSource).toContain("fs::symlink_metadata(&manifest_path)");
    expect(nativeRotationSource).toContain(
      "file.take(MAX_RUNTIME_MANIFEST_BYTES + 1)",
    );
    expect(nativeRotationSource).toContain("installation_root_key::clear_secret_bytes");
    expect(nativeRotationSource).not.toContain("SF_MASTER_KEY");
  });

  it("boots the exact staged CommonJS worker before MSI construction", () => {
    const bootstrapGuard = source.indexOf("if (BOOTSTRAP_CHECK)");
    const lease = source.indexOf("lease = acquireRotationLease()");

    expect(bootstrapGuard).toBeGreaterThan(-1);
    expect(lease).toBeGreaterThan(bootstrapGuard);
    expect(stagedRuntimeSource).toContain('"sahelflow-rotate-master-key.cjs"');
    expect(stagedRuntimeSource).toContain('"--bootstrap-check"');
    expect(stagedRuntimeSource).toContain("SF_ROTATION_BOOTSTRAP_READY");
    expect(stagedRuntimeSource).toContain("raw stderr suppressed");
  });

  it("journals database completion before protected candidate promotion", () => {
    const dataRotated = installationRootSource.indexOf(
      "state: RotationJournalState::DataRotated",
    );
    const promote = installationRootSource.indexOf(
      "promote_candidate_document(",
      dataRotated,
    );
    const receipt = installationRootSource.indexOf(
      "finish_rotation_receipt(",
      promote,
    );
    expect(dataRotated).toBeGreaterThan(-1);
    expect(promote).toBeGreaterThan(dataRotated);
    expect(receipt).toBeGreaterThan(promote);
  });
});
