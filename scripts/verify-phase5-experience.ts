#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface RouteAudit {
  route: string;
  file: string;
  primaryPhase: string;
  ownerOutcome: string;
  boundaries: { loading: boolean; error: boolean; notFound: boolean };
  boundaryFiles: { loading: string[]; error: string[]; notFound: string[] };
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
  commit: string;
  dirty: boolean;
  experience: { routeAudits: RouteAudit[] };
}

const root = process.cwd();
const inventoryPath = resolve(root, ".sf-inventory/repository-inventory.json");
const evidenceDir = resolve(root, ".sf-inventory/phase5-experience");
const matrixPath = resolve(evidenceDir, "route-completion.json");
const summaryPath = resolve(evidenceDir, "SUMMARY.md");

if (!existsSync(inventoryPath)) {
  throw new Error("Phase 5 experience verification requires bun run sf-inventory first");
}

const inventory = JSON.parse(readFileSync(inventoryPath, "utf8")) as Inventory;
const routes = inventory.experience.routeAudits;
const byRoute = new Map(routes.map((route) => [route.route, route]));

const requiredRoutes = [
  "/",
  "/login",
  "/setup",
  "/join",
  "/dashboard",
  "/orders",
  "/orders/confirmation-queue",
  "/customers",
  "/products",
  "/deliveries",
  "/returns",
  "/accounting",
  "/accounting/cod-reconciliation",
  "/analytics",
  "/risk",
  "/imports",
  "/inbox",
  "/automations",
  "/agents",
  "/storefronts",
  "/settings",
  "/profile",
] as const;

const errors: string[] = [];

if (inventory.dirty) errors.push("inventory was generated from a dirty tree");
if (routes.length < 32) {
  errors.push(`expected at least 32 user-facing routes, found ${routes.length}`);
}

for (const route of routes) {
  if (!route.boundaries.loading) {
    errors.push(`${route.route}: missing inherited loading boundary`);
  }
  if (!route.boundaries.error) {
    errors.push(`${route.route}: missing inherited error boundary`);
  }
}

for (const path of requiredRoutes) {
  const route = byRoute.get(path);
  if (!route) {
    errors.push(`${path}: required Phase 5 route is missing from inventory`);
    continue;
  }
  if (path !== "/" && route.signals.translationCalls === 0) {
    errors.push(`${path}: no canonical translation call observed in route dependency graph`);
  }
}

function source(path: string): string {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    errors.push(`${path}: required Phase 5 source is missing`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

const entityContext = source("src/components/entities/entity-context.tsx");
for (const primitive of ["EntityLink", "EntityPreview", "EntityInspector", "EntityTimeline"]) {
  if (!entityContext.includes(`function ${primitive}`)) {
    errors.push(`entity context: ${primitive} primitive is missing`);
  }
}

const customerTable = source("src/components/customers/customers-data-table.tsx");
const productTable = source("src/components/products/products-data-table.tsx");
const deliveryDetail = source("src/app/(dashboard)/deliveries/[id]/page.tsx");
if (!customerTable.includes("EntityInspector") || !customerTable.includes("EntityLink")) {
  errors.push("customers: shared entity link/inspector contract is not adopted");
}
if (!productTable.includes("EntityInspector") || !productTable.includes("EntityLink")) {
  errors.push("products: shared entity link/inspector contract is not adopted");
}
if (!deliveryDetail.includes("EntityTimeline") || !deliveryDetail.includes("EntityLink")) {
  errors.push("deliveries: shared entity link/timeline contract is not adopted");
}

const chartFrame = source("src/components/charts/chart-primitives.tsx");
if (!chartFrame.includes("accessibleSummary") || !chartFrame.includes("aria-describedby={summaryId}")) {
  errors.push("charts: governed textual summary contract is missing");
}

const stateSurface = source("src/components/shared/state-surface.tsx");
if (!stateSurface.includes("data-state-tone") || !stateSurface.includes("aria-live")) {
  errors.push("state surface: shared persistent semantic state contract is incomplete");
}

const dataTable = source("src/components/data-table/data-table.tsx");
if (dataTable.includes("tabIndex={onRowClick") || dataTable.includes('event.key === "Enter"')) {
  errors.push("data table: semantic rows must not be custom keyboard controls");
}

const workbenchSources = [
  "src/lib/orders/order-list-workbench.ts",
  "src/lib/orders/confirmation-workbench.ts",
  "src/lib/customers/customer-workbench.ts",
  "src/lib/products/product-workbench.ts",
  "src/lib/deliveries/delivery-workbench.ts",
  "src/lib/returns/return-workbench.ts",
];
for (const path of workbenchSources) {
  const content = source(path);
  if (!content.includes("pageSize") || !content.includes("hasNextPage")) {
    errors.push(`${path}: server-authoritative pagination contract is incomplete`);
  }
}

for (const path of [
  "src/app/login/page.tsx",
  "src/app/setup/page.tsx",
  "src/app/join/page.tsx",
]) {
  const content = source(path);
  for (const legacy of ["bg-gradient-to", "animate-scale-in", "shadow-popover"]) {
    if (content.includes(legacy)) {
      errors.push(`${path}: legacy decorative entry-surface token remains (${legacy})`);
    }
  }
}

const exportSources = [
  "src/app/api/export/customers/route.ts",
  "src/app/api/export/products/route.ts",
  "src/app/api/export/deliveries/route.ts",
  "src/app/api/export/returns/route.ts",
  "src/app/api/export/expenses/route.ts",
];
for (const path of exportSources) {
  if (source(path).includes("take: 10000")) {
    errors.push(`${path}: hidden 10,000-row export cap remains`);
  }
}

const routeMatrix = routes.map((route) => ({
  route: route.route,
  file: route.file,
  owner: route.ownerOutcome,
  phase: route.primaryPhase,
  completion: {
    loading: route.boundaries.loading,
    error: route.boundaries.error,
    translated: route.route === "/" || route.signals.translationCalls > 0,
    stateVocabularyObserved: route.signals.operationalStateTerms > 0,
    chartGoverned: !route.signals.chartSurface || chartFrame.includes("accessibleSummary"),
  },
  rtlReview: {
    physicalGeometrySignals: route.signals.physicalGeometryClasses,
    logicalGeometrySignals: route.signals.logicalGeometryClasses,
    directionalIcons: route.signals.directionalIcons,
    directionGuards: route.signals.directionGuards,
    bidiIsolates: route.signals.bidiIsolates,
  },
  risks: route.risks,
  riskScore: route.riskScore,
}));

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  matrixPath,
  `${JSON.stringify({
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: inventory.commit,
    requiredRoutes: [...requiredRoutes],
    routes: routeMatrix,
    blockingFindings: errors,
  }, null, 2)}\n`,
);

const rows = routeMatrix
  .map((entry) =>
    `| ${entry.route} | ${entry.completion.loading ? "yes" : "NO"} | ${entry.completion.error ? "yes" : "NO"} | ${entry.completion.translated ? "yes" : "NO"} | ${entry.completion.chartGoverned ? "yes" : "NO"} | ${entry.riskScore} |`,
  )
  .join("\n");
writeFileSync(
  summaryPath,
  `# Phase 5 route completion matrix\n\nCommit: \`${inventory.commit}\`\n\n| Route | Loading | Error | i18n | Chart context | Static risk |\n|---|---:|---:|---:|---:|---:|\n${rows}\n\n## Blocking findings\n\n${errors.length ? errors.map((error) => `- ${error}`).join("\n") : "None."}\n`,
);

if (errors.length > 0) {
  console.error("Phase 5 experience gate failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Phase 5 experience gate passed for ${routes.length} routes at ${inventory.commit}`);
