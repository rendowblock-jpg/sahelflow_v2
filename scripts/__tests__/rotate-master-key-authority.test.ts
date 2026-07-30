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

describe("installation-wide master-key rotation authority", () => {
  it("discovers registered shops and includes the provisioning template", () => {
    expect(source).toContain('"shop-registry.json"');
    expect(source).toContain('"shops"');
    expect(source).toContain('"shop-template.db"');
    expect(source).toContain("encryptCustomerData(oldPlaintext, newKey)");
    expect(source).toContain("SF_ROTATION_STAGE_");
    expect(source).toContain("parsed.shops.map(validateRegistryTarget)");
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
    expect(source).toContain(
      "A crash leaves the old keyfile plus reusable sidecar",
    );
    expect(source).toContain("loadOrCreateNewKey(oldKey)");
    expect(source).toContain(
      "Keep ${SIDECAR_PATH}; rerunning will resume with the same new key.",
    );
  });

  it("durably persists the sidecar before entering the mutation window", () => {
    const sidecarWrite = source.indexOf("function writeDurableSidecar");
    const fileFlush = source.indexOf("fsyncSync(sidecarHandle)", sidecarWrite);
    const posixDirectoryFlush = source.indexOf("fsyncDirectory(dataDir())", fileFlush);
    const windowsWriteThrough = source.indexOf(
      "MOVEFILE_WRITE_THROUGH",
      fileFlush,
    );
    const loadSidecar = source.indexOf("loadOrCreateNewKey(oldKey)");
    const mutationWindow = source.indexOf(
      "mutationWindowEntered = true",
      loadSidecar,
    );

    expect(sidecarWrite).toBeGreaterThan(-1);
    expect(fileFlush).toBeGreaterThan(sidecarWrite);
    expect(posixDirectoryFlush).toBeGreaterThan(fileFlush);
    expect(windowsWriteThrough).toBeGreaterThan(fileFlush);
    expect(mutationWindow).toBeGreaterThan(loadSidecar);
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
    expect(contextSource).toContain(
      "if (packaged) assertMasterKeyRotationInactive()",
    );
    expect(authoritySource).toContain("assertMasterKeyRotationInactive()");
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
