#!/usr/bin/env bun

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[];
}

interface Inventory {
  generatedAt: string;
  commit: string;
  dirty: boolean;
  repositoryRoot: string;
  counts: Record<string, number>;
  files: string[];
  markdown: string[];
  readmes: string[];
  routes: Array<{ route: string; file: string }>;
  apiRoutes: Array<{ route: string; file: string }>;
  commands: Record<string, string>;
  pages: string[];
  components: string[];
  designTokenFiles: string[];
  designTokens: string[];
  prisma: {
    schema: string | null;
    models: string[];
    enums: string[];
    migrations: string[];
  };
  tests: string[];
  providersAndIntegrations: string[];
  sidecarsAndDesktopResources: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  workspaces: string[];
}

const repoRoot = resolve(process.env.SF_REPO_DIR || process.cwd());
const outputDir = resolve(repoRoot, ".sf-inventory");
const outputJson = resolve(outputDir, "repository-inventory.json");
const outputSummary = resolve(outputDir, "SUMMARY.md");

function runGit(args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || "unknown error"}`);
  }
  return result.stdout.trim();
}

function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

function isTextCandidate(file: string): boolean {
  return /\.(?:css|scss|sass|less|ts|tsx|js|jsx|json|md|toml|yml|yaml)$/i.test(file);
}

function routeFromAppFile(file: string): string {
  const withoutRoot = file
    .replace(/^src\/app\/?/, "")
    .replace(/\/(?:page|route)\.(?:ts|tsx|js|jsx)$/, "")
    .replace(/^(?:page|route)\.(?:ts|tsx|js|jsx)$/, "");
  const segments = withoutRoot
    .split("/")
    .filter(Boolean)
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")));
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

const files = runGit(["ls-files", "-z"])
  .split("\0")
  .map((file) => file.trim())
  .filter(Boolean)
  .sort();

const commit = runGit(["rev-parse", "HEAD"]);
const dirtyStatus = runGit(["status", "--porcelain", "--untracked-files=all"]);
const allowDirty = process.argv.includes("--allow-dirty");
if (dirtyStatus && !allowDirty) {
  throw new Error("sf-inventory requires a clean tree; pass --allow-dirty for non-evidence diagnostics");
}
const packagePath = resolve(repoRoot, "package.json");
const pkg = JSON.parse(readUtf8(packagePath)) as PackageJson;

const markdown = files.filter((file) => file.endsWith(".md"));
const readmes = markdown.filter((file) => /(^|\/)README\.md$/i.test(file));
const routeFiles = files.filter((file) => /^src\/app\/.+\/(?:page|route)\.(?:ts|tsx|js|jsx)$/.test(file) || /^src\/app\/(?:page|route)\.(?:ts|tsx|js|jsx)$/.test(file));
const routes = routeFiles
  .filter((file) => /\/page\.(?:ts|tsx|js|jsx)$/.test(file) || /^src\/app\/page\.(?:ts|tsx|js|jsx)$/.test(file))
  .map((file) => ({ route: routeFromAppFile(file), file }));
const apiRoutes = routeFiles
  .filter((file) => /\/route\.(?:ts|tsx|js|jsx)$/.test(file) || /^src\/app\/route\.(?:ts|tsx|js|jsx)$/.test(file))
  .map((file) => ({ route: routeFromAppFile(file), file }));
const pages = routes.map((entry) => entry.file);
const components = files.filter(
  (file) => /(^|\/)components\//.test(file) && /\.(?:ts|tsx|js|jsx)$/.test(file),
);
const designTokenFiles = files.filter(
  (file) =>
    /\.(?:css|scss|sass|less)$/.test(file) ||
    /(^|\/)(?:tailwind|postcss)\.config\.(?:ts|js|mjs|cjs)$/.test(file),
);

const designTokenSet = new Set<string>();
for (const file of designTokenFiles) {
  if (!isTextCandidate(file)) continue;
  const fullPath = resolve(repoRoot, file);
  try {
    if (statSync(fullPath).size > 2_000_000) continue;
    const content = readUtf8(fullPath);
    for (const match of content.matchAll(/--[A-Za-z0-9_-]+/g)) {
      designTokenSet.add(match[0]);
    }
  } catch {
    // Inventory generation should remain best-effort for non-critical token files.
  }
}

const prismaSchemaFile = files.find((file) => file === "prisma/schema.prisma") ?? null;
let prismaModels: string[] = [];
let prismaEnums: string[] = [];
if (prismaSchemaFile) {
  const schema = readUtf8(resolve(repoRoot, prismaSchemaFile));
  prismaModels = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]!).sort();
  prismaEnums = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((match) => match[1]!).sort();
}
const migrations = files.filter((file) => /^prisma\/migrations\//.test(file));
const tests = files.filter(
  (file) =>
    /(^|\/)__tests__\//.test(file) ||
    /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(file) ||
    /^tests\//.test(file),
);
const providersAndIntegrations = files.filter(
  (file) =>
    /(^|\/)(?:integrations?|providers?)\//i.test(file) ||
    /(?:provider|adapter)\.(?:ts|tsx|js|jsx)$/i.test(file),
);
const sidecarsAndDesktopResources = files.filter(
  (file) =>
    /^sidecars\//.test(file) ||
    /^src-tauri\/(?:src|resources|binaries|capabilities)\//.test(file) ||
    file === "src-tauri/tauri.conf.json" ||
    file === "src-tauri/Cargo.toml" ||
    file === "src-tauri/build.rs",
);

const inventory: Inventory = {
  generatedAt: new Date().toISOString(),
  commit,
  dirty: Boolean(dirtyStatus),
  repositoryRoot: relative(repoRoot, repoRoot) || ".",
  counts: {
    files: files.length,
    markdown: markdown.length,
    readmes: readmes.length,
    routes: routes.length,
    apiRoutes: apiRoutes.length,
    commands: Object.keys(pkg.scripts ?? {}).length,
    pages: pages.length,
    components: components.length,
    designTokenFiles: designTokenFiles.length,
    designTokens: designTokenSet.size,
    prismaModels: prismaModels.length,
    prismaEnums: prismaEnums.length,
    migrationFiles: migrations.length,
    tests: tests.length,
    providersAndIntegrations: providersAndIntegrations.length,
    sidecarsAndDesktopResources: sidecarsAndDesktopResources.length,
  },
  files,
  markdown,
  readmes,
  routes,
  apiRoutes,
  commands: pkg.scripts ?? {},
  pages,
  components,
  designTokenFiles,
  designTokens: [...designTokenSet].sort(),
  prisma: {
    schema: prismaSchemaFile,
    models: prismaModels,
    enums: prismaEnums,
    migrations,
  },
  tests,
  providersAndIntegrations,
  sidecarsAndDesktopResources,
  dependencies: pkg.dependencies ?? {},
  devDependencies: pkg.devDependencies ?? {},
  workspaces: pkg.workspaces ?? [],
};

mkdirSync(dirname(outputJson), { recursive: true });
writeFileSync(outputJson, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

const summaryLines = [
  "# SahelFlow repository inventory",
  "",
  `- Commit: \`${commit}\``,
  `- Generated: ${inventory.generatedAt}`,
  ...Object.entries(inventory.counts).map(([name, count]) => `- ${name}: ${count}`),
  "",
  "The JSON file in this directory is machine-generated evidence only; it does not replace repository authority documents.",
  "",
];
writeFileSync(outputSummary, summaryLines.join("\n"), "utf8");

console.log(`SahelFlow inventory generated for ${commit}.`);
console.log(`JSON: ${outputJson}`);
console.log(`Summary: ${outputSummary}`);
for (const [name, count] of Object.entries(inventory.counts)) {
  console.log(`${name}: ${count}`);
}
