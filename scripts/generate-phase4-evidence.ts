#!/usr/bin/env bun

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

interface CycloneDxComponent {
  type: "application" | "library";
  name: string;
  version: string;
  purl: string;
  bomRef: string;
  group?: string;
  hashes?: Array<{ alg: "SHA-256"; content: string }>;
  licenses?: Array<{ license: { id?: string; name?: string } }>;
  properties?: Array<{ name: string; value: string }>;
}

interface TriageFinding {
  id: string;
  source: string;
  componentPurl: string;
  state: "resolved" | "not_affected" | "in_triage" | "exploitable";
  justification?: string;
  response?: string[];
  detail: string;
}

interface VulnerabilityTriage {
  formatVersion: 1;
  policy: Record<string, unknown>;
  findings: TriageFinding[];
}

const AUTHORITY_FILES = [
  "documentation/privacy/phase4-data-inventory.json",
  "documentation/archive/phase4/ALGERIA_LAW_18_07_MAPPING.md",
  "documentation/archive/phase4/PHASE4_THREAT_MODEL.md",
  "documentation/archive/phase4/PHASE4_INDEPENDENT_REVIEW.md",
  "documentation/archive/phase4/PHASE4_EVIDENCE_MATRIX.md",
  "documentation/security/phase4-vulnerability-triage.json",
] as const;

function sha256Bytes(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function licenseEntries(value: unknown): CycloneDxComponent["licenses"] {
  const candidates = Array.isArray(value) ? value : value ? [value] : [];
  const licenses = candidates
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) =>
      /^[A-Za-z0-9-.+]+$/.test(entry)
        ? { license: { id: entry } }
        : { license: { name: entry } },
    );
  return licenses.length > 0 ? licenses : undefined;
}

function npmPurl(name: string, version: string): string {
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function cargoPurl(name: string, version: string): string {
  return `pkg:cargo/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function installedNodeComponents(repoDir: string): CycloneDxComponent[] {
  const root = join(repoDir, "node_modules");
  if (!existsSync(root)) {
    throw new Error("node_modules is required to generate the resolved Phase 4 SBOM");
  }

  const components = new Map<string, CycloneDxComponent>();
  const visited = new Set<string>();

  function isDirectoryOrLink(entry: { isDirectory(): boolean; isSymbolicLink(): boolean }): boolean {
    return entry.isDirectory() || entry.isSymbolicLink();
  }

  function scanNodeModules(nodeModulesDir: string): void {
    let realKey: string;
    try {
      realKey = realpathSync(nodeModulesDir);
      if (visited.has(realKey) || !statSync(nodeModulesDir).isDirectory()) return;
    } catch {
      return;
    }
    visited.add(realKey);

    for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
      if (entry.name === ".bin") continue;
      const entryPath = join(nodeModulesDir, entry.name);
      if (entry.name === ".bun") {
        for (const stored of readdirSync(entryPath, { withFileTypes: true })) {
          if (isDirectoryOrLink(stored)) {
            scanNodeModules(join(entryPath, stored.name, "node_modules"));
          }
        }
        continue;
      }
      if (entry.name.startsWith(".") || !isDirectoryOrLink(entry)) continue;
      if (entry.name.startsWith("@")) {
        for (const scoped of readdirSync(entryPath, { withFileTypes: true })) {
          if (isDirectoryOrLink(scoped)) scanPackage(join(entryPath, scoped.name));
        }
      } else {
        scanPackage(entryPath);
      }
    }
  }

  function scanPackage(packageDir: string): void {
    let realPackageDir: string;
    try {
      realPackageDir = realpathSync(packageDir);
    } catch {
      return;
    }
    const manifestPath = join(realPackageDir, "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = readJson<{
          name?: unknown;
          version?: unknown;
          license?: unknown;
          licenses?: unknown;
        }>(manifestPath);
        if (typeof manifest.name === "string" && typeof manifest.version === "string") {
          const purl = npmPurl(manifest.name, manifest.version);
          const group = manifest.name.startsWith("@")
            ? manifest.name.slice(1).split("/")[0]
            : undefined;
          const name = manifest.name.startsWith("@")
            ? manifest.name.split("/").slice(1).join("/")
            : manifest.name;
          components.set(purl, {
            type: "library",
            name,
            ...(group ? { group } : {}),
            version: manifest.version,
            purl,
            bomRef: purl,
            licenses: licenseEntries(manifest.license ?? manifest.licenses),
            properties: [{ name: "sahelflow:ecosystem", value: "npm" }],
          });
        }
      } catch {
        // An invalid installed package manifest is ignored here and will still
        // fail the frozen dependency install/build that owns package validity.
      }
    }
    scanNodeModules(join(realPackageDir, "node_modules"));
  }

  scanNodeModules(root);
  return [...components.values()].sort((left, right) => left.purl.localeCompare(right.purl));
}

function cargoComponents(repoDir: string): CycloneDxComponent[] {
  const lockPath = join(repoDir, "src-tauri", "Cargo.lock");
  if (!existsSync(lockPath)) throw new Error("src-tauri/Cargo.lock is required for the Phase 4 SBOM");
  const source = readFileSync(lockPath, "utf8");
  const components = new Map<string, CycloneDxComponent>();
  for (const block of source.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
    if (!name || !version) continue;
    const checksum = block.match(/^checksum\s*=\s*"([0-9a-f]{64})"/m)?.[1];
    const sourceValue = block.match(/^source\s*=\s*"([^"]+)"/m)?.[1];
    const purl = cargoPurl(name, version);
    components.set(purl, {
      type: "library",
      name,
      version,
      purl,
      bomRef: purl,
      ...(checksum ? { hashes: [{ alg: "SHA-256", content: checksum }] } : {}),
      properties: [
        { name: "sahelflow:ecosystem", value: "cargo" },
        ...(sourceValue ? [{ name: "sahelflow:cargo-source", value: sourceValue }] : []),
      ],
    });
  }
  return [...components.values()].sort((left, right) => left.purl.localeCompare(right.purl));
}

function applicationComponent(repoDir: string): CycloneDxComponent {
  const manifest = readJson<{ name: string; version: string }>(join(repoDir, "package.json"));
  const purl = npmPurl(manifest.name, manifest.version);
  return {
    type: "application",
    name: manifest.name,
    version: manifest.version,
    purl,
    bomRef: purl,
    properties: [{ name: "sahelflow:evidence-boundary", value: "source-and-resolved-dependencies" }],
  };
}

export function generatePhase4Evidence(repoDir: string, outDir: string): {
  sbomPath: string;
  vexPath: string;
  manifestPath: string;
} {
  const application = applicationComponent(repoDir);
  const components = [...installedNodeComponents(repoDir), ...cargoComponents(repoDir)].sort(
    (left, right) => left.purl.localeCompare(right.purl),
  );
  if (!components.some((component) => component.properties?.some((property) => property.value === "npm"))) {
    throw new Error("Phase 4 SBOM contains no resolved npm components");
  }
  if (!components.some((component) => component.properties?.some((property) => property.value === "cargo"))) {
    throw new Error("Phase 4 SBOM contains no resolved Cargo components");
  }

  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: { component: application },
    components,
  };
  const triagePath = join(repoDir, "documentation/security/phase4-vulnerability-triage.json");
  const triage = readJson<VulnerabilityTriage>(triagePath);
  if (triage.formatVersion !== 1 || !Array.isArray(triage.findings)) {
    throw new Error("Phase 4 vulnerability triage authority is malformed");
  }
  const vex = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: { component: application },
    vulnerabilities: [...triage.findings]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((finding) => ({
        id: finding.id,
        source: { name: finding.source },
        affects: [{ ref: finding.componentPurl }],
        analysis: {
          state: finding.state,
          ...(finding.justification ? { justification: finding.justification } : {}),
          ...(finding.response ? { response: finding.response } : {}),
          detail: finding.detail,
        },
      })),
  };

  const sbomPath = join(outDir, "sbom.cdx.json");
  const vexPath = join(outDir, "vex.cdx.json");
  writeJson(sbomPath, sbom);
  writeJson(vexPath, vex);

  const authorityDigests = Object.fromEntries(
    AUTHORITY_FILES.map((relativePath) => {
      const absolutePath = join(repoDir, relativePath);
      if (!existsSync(absolutePath)) throw new Error(`missing Phase 4 authority: ${relativePath}`);
      return [relativePath, sha256Bytes(readFileSync(absolutePath))];
    }),
  );
  const manifestPath = join(outDir, "manifest.json");
  writeJson(manifestPath, {
    formatVersion: 1,
    generator: "scripts/generate-phase4-evidence.ts",
    application: { name: application.name, version: application.version },
    componentCount: components.length,
    npmComponentCount: components.filter((component) =>
      component.properties?.some((property) => property.value === "npm"),
    ).length,
    cargoComponentCount: components.filter((component) =>
      component.properties?.some((property) => property.value === "cargo"),
    ).length,
    vulnerabilityStatementCount: triage.findings.length,
    files: {
      "sbom.cdx.json": sha256Bytes(readFileSync(sbomPath)),
      "vex.cdx.json": sha256Bytes(readFileSync(vexPath)),
      ...authorityDigests,
    },
  });
  return { sbomPath, vexPath, manifestPath };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.main) {
  const repoDir = resolve(process.env.SF_REPO_DIR ?? process.cwd());
  const outDir = resolve(repoDir, argument("--out") ?? ".sf-phase4-evidence");
  const result = generatePhase4Evidence(repoDir, outDir);
  console.log(`Phase 4 SBOM: ${result.sbomPath}`);
  console.log(`Phase 4 VEX: ${result.vexPath}`);
  console.log(`Phase 4 evidence manifest: ${result.manifestPath}`);
}
