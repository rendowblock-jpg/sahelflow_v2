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

type OwnerSession = "Session 2" | "Session 3" | "Session 4";

interface RouteExperienceAudit {
  route: string;
  file: string;
  sourceFiles: string[];
  ownerSession: OwnerSession;
  ownerOutcome: string;
  boundaries: {
    loading: boolean;
    error: boolean;
    notFound: boolean;
  };
  signals: {
    translationCalls: number;
    physicalGeometryClasses: number;
    logicalGeometryClasses: number;
    directionalIcons: number;
    directionGuards: number;
    bidiIsolates: number;
    operationalStateTerms: number;
    chartSurface: boolean;
  };
  risks: string[];
  riskScore: number;
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
  experience: {
    contract: string;
    routeAudits: RouteExperienceAudit[];
    highestRiskRoutes: RouteExperienceAudit[];
    ownerCounts: Record<OwnerSession, number>;
  };
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

function countMatches(content: string, pattern: RegExp): number {
  return [...content.matchAll(pattern)].length;
}

function ownerForRoute(route: string): Pick<RouteExperienceAudit, "ownerSession" | "ownerOutcome"> {
  const session2Prefixes = [
    "/dashboard",
    "/orders",
    "/customers",
    "/risk",
    "/products",
    "/deliveries",
  ];
  if (session2Prefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) {
    return { ownerSession: "Session 2", ownerOutcome: "Golden COD core UI" };
  }

  const session3Prefixes = [
    "/accounting",
    "/agents",
    "/analytics",
    "/automations",
    "/imports",
    "/inbox",
    "/login",
    "/onboarding",
    "/profile",
    "/returns",
    "/settings",
    "/setup",
    "/storefront",
    "/storefronts",
  ];
  if (route === "/" || session3Prefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`))) {
    return { ownerSession: "Session 3", ownerOutcome: "Complete local product and provider foundations" };
  }

  return { ownerSession: "Session 4", ownerOutcome: "Whole-product AAA integration" };
}

function hasRouteBoundary(fileSet: Set<string>, pageFile: string, name: string): boolean {
  const directory = dirname(pageFile).replace(/\\/g, "/");
  return ["tsx", "ts", "jsx", "js"].some((extension) =>
    fileSet.has(`${directory}/${name}.${extension}`),
  );
}

function resolveLocalSourceImport(
  fileSet: Set<string>,
  fromFile: string,
  specifier: string,
): string | null {
  let base: string;
  if (specifier.startsWith("@/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith(".")) {
    base = relative(
      repoRoot,
      resolve(repoRoot, dirname(fromFile), specifier),
    ).replace(/\\/g, "/");
  } else {
    return null;
  }

  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
    `${base}/index.jsx`,
    `${base}/index.js`,
  ];
  return candidates.find(
    (candidate) => fileSet.has(candidate) && /\.(?:ts|tsx|js|jsx)$/.test(candidate),
  ) ?? null;
}

function collectRouteSourceFiles(fileSet: Set<string>, entryFile: string): string[] {
  const visited = new Set<string>();
  const queue = [entryFile];
  const staticImport = /(?:import|export)\s+(?:type\s+)?(?:[^;"']+?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (visited.has(file)) continue;
    visited.add(file);
    if (visited.size > 500) {
      throw new Error(`route dependency traversal exceeded 500 files for ${entryFile}`);
    }

    const content = readUtf8(resolve(repoRoot, file));
    for (const pattern of [staticImport, dynamicImport]) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) {
        const dependency = resolveLocalSourceImport(fileSet, file, match[1]!);
        if (dependency && !visited.has(dependency)) queue.push(dependency);
      }
    }
  }

  return [...visited]
    .filter((file) => /\.(?:tsx|jsx)$/.test(file))
    .sort();
}

function auditRouteExperience(
  fileSet: Set<string>,
  route: { route: string; file: string },
): RouteExperienceAudit {
  const sourceFiles = collectRouteSourceFiles(fileSet, route.file);
  const content = sourceFiles
    .map((file) => readUtf8(resolve(repoRoot, file)))
    .join("\n");
  const owner = ownerForRoute(route.route);
  const boundaries = {
    loading: hasRouteBoundary(fileSet, route.file, "loading"),
    error: hasRouteBoundary(fileSet, route.file, "error"),
    notFound: hasRouteBoundary(fileSet, route.file, "not-found"),
  };
  const signals = {
    translationCalls: countMatches(content, /\bt\s*\(/g),
    physicalGeometryClasses: countMatches(
      content,
      /\b(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)-[^\s"'`}]*/g,
    ),
    logicalGeometryClasses: countMatches(
      content,
      /\b(?:ms|me|ps|pe|start|end|border-s|border-e|text-start|text-end)-[^\s"'`}]*/g,
    ),
    directionalIcons: countMatches(
      content,
      /\b(?:ArrowLeft|ArrowRight|ChevronLeft|ChevronRight|PanelLeft|PanelRight|MoveLeft|MoveRight)\b/g,
    ),
    directionGuards: countMatches(content, /\b(?:rtl:|isRtl|icon-rtl-flip|getDirection|dir=)/g),
    bidiIsolates: countMatches(content, /\b(?:bdi|bidi-isolate|technical-value|force-ltr|dir=["']ltr)/g),
    operationalStateTerms: countMatches(
      content,
      /\b(?:loading|empty|permission|offline|stale|conflict|error|recovery)\b/gi,
    ),
    chartSurface: /@\/components\/charts\/|from\s+["']recharts["']|\bChartContainer\b/.test(content),
  };
  const risks: string[] = [];
  if (!boundaries.loading) risks.push("missing-loading-boundary");
  if (!boundaries.error) risks.push("missing-error-boundary");
  if (signals.physicalGeometryClasses > 0) risks.push("physical-geometry-needs-logical-review");
  if (signals.directionalIcons > signals.directionGuards) risks.push("directional-icons-need-rtl-review");
  if (signals.chartSurface) risks.push("chart-arabic-geometry-review");
  if (signals.translationCalls === 0) risks.push("route-copy-translation-not-observed");

  const riskScore =
    (boundaries.loading ? 0 : 4) +
    (boundaries.error ? 0 : 4) +
    Math.min(signals.physicalGeometryClasses, 8) +
    Math.max(0, signals.directionalIcons - signals.directionGuards) * 2 +
    (signals.chartSurface ? 3 : 0) +
    (signals.translationCalls === 0 ? 1 : 0);

  return { ...route, sourceFiles, ...owner, boundaries, signals, risks, riskScore };
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
const fileSet = new Set(files);
const routeAudits = routes.map((route) => auditRouteExperience(fileSet, route));
const highestRiskRoutes = [...routeAudits]
  .sort((left, right) => right.riskScore - left.riskScore || left.route.localeCompare(right.route))
  .slice(0, 12);
const ownerCounts: Record<OwnerSession, number> = {
  "Session 2": 0,
  "Session 3": 0,
  "Session 4": 0,
};
for (const routeAudit of routeAudits) {
  ownerCounts[routeAudit.ownerSession] += 1;
}
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
    experienceRoutes: routeAudits.length,
    chartRoutes: routeAudits.filter((route) => route.signals.chartSurface).length,
    physicalGeometryRoutes: routeAudits.filter(
      (route) => route.signals.physicalGeometryClasses > 0,
    ).length,
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
  experience: {
    contract: "session1-global-experience-v1",
    routeAudits,
    highestRiskRoutes,
    ownerCounts,
  },
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
  "## Experience and Arabic route evidence",
  "",
  `- Session 2 owned routes: ${inventory.experience.ownerCounts["Session 2"]}`,
  `- Session 3 owned routes: ${inventory.experience.ownerCounts["Session 3"]}`,
  `- Session 4 owned routes: ${inventory.experience.ownerCounts["Session 4"]}`,
  "- Every route entry in repository-inventory.json follows its local import graph and records the rendered source files, boundary coverage, logical/physical geometry signals, bidi isolation, directional icons, chart exposure, owner session and deterministic risk score.",
  "",
  "### Highest static-risk routes",
  "",
  ...inventory.experience.highestRiskRoutes.map(
    (route) =>
      `- ${route.route} — ${route.ownerSession}; score ${route.riskScore}; ${route.risks.join(", ") || "no static risks"}`,
  ),
  "",
];
writeFileSync(outputSummary, summaryLines.join("\n"), "utf8");

console.log(`SahelFlow inventory generated for ${commit}.`);
console.log(`JSON: ${outputJson}`);
console.log(`Summary: ${outputSummary}`);
for (const [name, count] of Object.entries(inventory.counts)) {
  console.log(`${name}: ${count}`);
}
