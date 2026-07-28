import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts", "rotate-master-key.ts");
const source = readFileSync(scriptPath, "utf8");
const contextPath = resolve(process.cwd(), "src", "lib", "shops", "context.ts");
const authorityPath = resolve(process.cwd(), "src", "lib", "shops", "authority.ts");
const contextSource = readFileSync(contextPath, "utf8");
const authoritySource = readFileSync(authorityPath, "utf8");

describe("installation-wide master-key rotation authority", () => {
  it("discovers registered shops and includes the provisioning template", () => {
    expect(source).toContain('"shop-registry.json"');
    expect(source).toContain('"shops"');
    expect(source).toContain('"shop-template.db"');
    expect(source).toContain("parsed.shops.map(validateRegistryTarget)");
  });

  it("uses one old/new key pair for every target before committing the keyfile", () => {
    const targetLoop = source.indexOf(
      "for (const target of targets)",
      source.indexOf("const allStats"),
    );
    const rotateTarget = source.indexOf(
      "rotateTarget(target, oldKey, newKey)",
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

  it("proves the desktop runtime is stopped before scanning databases", () => {
    const lease = source.indexOf("const lease = acquireRotationLease()");
    const stopped = source.indexOf("await assertApplicationStopped()", lease);
    const targets = source.indexOf("const targets = loadRotationTargets()", stopped);

    expect(source).toContain('"runtime-endpoint.json"');
    expect(source).toContain("processIsAlive(manifest.processId)");
    expect(source).toContain("loopbackPortIsOpen(manifest.appPort)");
    expect(lease).toBeGreaterThan(-1);
    expect(stopped).toBeGreaterThan(lease);
    expect(targets).toBeGreaterThan(stopped);
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
});
