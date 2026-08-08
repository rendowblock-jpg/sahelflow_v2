#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

interface RouteAudit {
  route: string;
  file: string;
  boundaries: { loading: boolean; error: boolean; notFound: boolean };
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
  files: string[];
  experience: { routeAudits: RouteAudit[] };
}

type LocaleMap = Record<string, string>;

const root = process.cwd();
const inventoryPath = resolve(root, ".sf-inventory/repository-inventory.json");
const evidenceDir = resolve(root, ".sf-inventory/phase6-7-completion");
const contractPath = resolve(evidenceDir, "completion-contract.json");
const summaryPath = resolve(evidenceDir, "SUMMARY.md");

if (!existsSync(inventoryPath)) {
  throw new Error("Phase 6/7 verification requires bun run sf-inventory first");
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
const warnings: string[] = [];

function source(path: string): string {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    errors.push(`${path}: required source is missing`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function locale(path: string): LocaleMap {
  const absolute = resolve(root, path);
  if (!existsSync(absolute)) {
    errors.push(`${path}: locale bundle is missing`);
    return {};
  }
  return JSON.parse(readFileSync(absolute, "utf8")) as LocaleMap;
}

if (inventory.dirty) errors.push("repository inventory was generated from a dirty tree");
if (routes.length < 32) errors.push(`expected at least 32 user-facing routes, found ${routes.length}`);

for (const route of routes) {
  if (!route.boundaries.loading) errors.push(`${route.route}: missing inherited loading boundary`);
  if (!route.boundaries.error) errors.push(`${route.route}: missing inherited error boundary`);
  if (route.signals.physicalGeometryClasses > route.signals.logicalGeometryClasses + 8) {
    warnings.push(`${route.route}: physical geometry materially exceeds logical geometry; manual RTL review required`);
  }
  if (route.signals.directionalIcons > route.signals.directionGuards) {
    warnings.push(`${route.route}: directional icon count exceeds explicit direction guards`);
  }
}

for (const path of requiredRoutes) {
  const route = byRoute.get(path);
  if (!route) {
    errors.push(`${path}: required route is missing from inventory`);
    continue;
  }
  if (path !== "/" && route.signals.translationCalls === 0) {
    errors.push(`${path}: canonical translation use was not observed in its route dependency graph`);
  }
}

const en = locale("src/lib/i18n/locales/en.json");
const fr = locale("src/lib/i18n/locales/fr.json");
const ar = locale("src/lib/i18n/locales/ar.json");
const allLocaleKeys = new Set([...Object.keys(en), ...Object.keys(fr), ...Object.keys(ar)]);
for (const key of [...allLocaleKeys].sort()) {
  for (const [name, bundle] of [["en", en], ["fr", fr], ["ar", ar]] as const) {
    if (!(key in bundle)) errors.push(`locale parity: ${name} is missing '${key}'`);
    else if (typeof bundle[key] !== "string" || bundle[key]!.trim().length === 0) {
      errors.push(`locale parity: ${name} has an empty value for '${key}'`);
    }
  }
}

// These are invariant product/provider names, abbreviations, units and technical
// tokens. They are intentionally not translated and remain a bounded explicit
// list so new prose cannot silently bypass the hard-coded-copy gate.
const SAFE_LITERAL_COPY = new Set([
  "SahelFlow",
  "SF",
  "DZD",
  "DA",
  "PIN",
  "API",
  "CSV",
  "XLSX",
  "JSON",
  "SKU",
  "ID",
  "ms",
  "KB)",
  "WhatsApp",
  "Gemini",
  "Google",
  "Google Sheets",
  ": Google Sheets",
  "Shopify",
  "WooCommerce",
  "YouCan",
  "Yalidine",
  "ZR Express",
  "Maystro",
  "Maystro Delivery",
  "NOEST",
  "NOEST Express",
  "Cloudflare",
  "Windows",
  "WebView2",
  "Excel (.xlsx)",
  "Ctrl",
  "ESC",
  "English",
  "Français",
  "العربية",
]);

// Placeholder values below are example data shapes or exact command/credential
// tokens; the surrounding field labels carry the localized user-facing copy.
// Keep this list deliberately narrow rather than treating all placeholders as safe.
const SAFE_PLACEHOLDER_EXAMPLES = new Set([
  "Ahmed Benali",
  "Ma Boutique",
  "Alger",
  "API token",
  "AIza...",
  "Produit Test",
  "T-shirt Cotton Bio",
  "RESET",
  "Alger, Algérie",
]);

const USER_FACING_LITERAL_ATTRIBUTES = new Set([
  "aria-label",
  "placeholder",
  "title",
  "alt",
]);

function normalizeLiteral(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function safePlaceholder(text: string) {
  if (SAFE_PLACEHOLDER_EXAMPLES.has(text)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text)) return true;
  if (/^0(?:\[[0-9-]+\]|[0-9X])[\sX0-9-]*$/iu.test(text)) return true;
  if (/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/u.test(text)) return true;
  return false;
}

function safeLiteral(value: string, parentTag?: string, attributeName?: string) {
  const text = normalizeLiteral(value);
  if (!text) return true;
  if (parentTag && ["code", "kbd", "pre"].includes(parentTag)) return true;
  if (SAFE_LITERAL_COPY.has(text)) return true;
  if (attributeName === "placeholder" && safePlaceholder(text)) return true;
  if (/^v(?:\d+(?:\.\d+)*)?$/i.test(text)) return true;
  if (/^(?:https?:\/\/|mailto:|tel:|\/)/i.test(text)) return true;
  if (/^[\p{P}\p{S}\p{M}\s]+$/u.test(text)) return true;
  if (/^[\d\s.,:+%#@()\[\]{}\-–—·•…×÷=<>|/\\]+$/u.test(text)) return true;
  return false;
}

function jsxTagName(node: ts.Node): string | undefined {
  const parent = node.parent;
  if (ts.isJsxElement(parent)) return parent.openingElement.tagName.getText();
  if (ts.isJsxFragment(parent)) return undefined;
  if (ts.isJsxElement(parent?.parent)) return parent.parent.openingElement.tagName.getText();
  return undefined;
}

function isStaticallyHidden(node: ts.Node): boolean {
  let current: ts.Node | undefined = node;
  while (current) {
    const opening = ts.isJsxElement(current)
      ? current.openingElement
      : ts.isJsxSelfClosingElement(current)
        ? current
        : undefined;
    if (opening) {
      for (const property of opening.attributes.properties) {
        if (!ts.isJsxAttribute(property)) continue;
        const name = property.name.getText();
        if (name === "hidden" && !property.initializer) return true;
        if (name !== "aria-hidden" && name !== "hidden") continue;
        const initializer = property.initializer;
        if (initializer && ts.isStringLiteral(initializer) && initializer.text === "true") {
          return true;
        }
        if (
          initializer &&
          ts.isJsxExpression(initializer) &&
          initializer.expression?.kind === ts.SyntaxKind.TrueKeyword
        ) {
          return true;
        }
      }
    }
    current = current.parent;
  }
  return false;
}

const hardcodedCopyFindings: string[] = [];
for (const path of inventory.files.filter(
  (file) =>
    /^(?:src\/app|src\/components)\/.+\.tsx$/.test(file) &&
    !file.includes("/__tests__/") &&
    !/\.(?:test|spec)\.tsx$/.test(file),
)) {
  const content = source(path);
  const ast = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const report = (node: ts.Node, kind: string, literal: string, attributeName?: string) => {
    if (isStaticallyHidden(node)) return;
    const text = normalizeLiteral(literal);
    if (safeLiteral(text, jsxTagName(node), attributeName)) return;
    const { line, character } = ast.getLineAndCharacterOfPosition(node.getStart(ast));
    hardcodedCopyFindings.push(
      `${path}:${line + 1}:${character + 1} ${kind}: ${JSON.stringify(text.slice(0, 120))}`,
    );
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      report(node, "JSX text", node.getText(ast));
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(ast);
      if (USER_FACING_LITERAL_ATTRIBUTES.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          if (!(name === "alt" && node.initializer.text === "")) {
            report(node, `${name} literal`, node.initializer.text, name);
          }
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          (ts.isStringLiteral(node.initializer.expression) ||
            ts.isNoSubstitutionTemplateLiteral(node.initializer.expression))
        ) {
          report(node, `${name} literal`, node.initializer.expression.text, name);
        }
      }
    } else if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))
    ) {
      report(node, "JSX expression text", node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
for (const finding of hardcodedCopyFindings) {
  errors.push(`hard-coded user copy: ${finding}`);
}

const clientI18n = source("src/hooks/use-i18n.ts");
const serverI18n = source("src/lib/i18n-server.ts");
const runtimeI18n = source("src/lib/i18n/runtime-translations.ts");
for (const [name, content] of [["client", clientI18n], ["server", serverI18n]] as const) {
  if (!content.includes("getRuntimeTranslation")) {
    errors.push(`localization: ${name} translator does not use the shared runtime fallback authority`);
  }
}
for (const owner of [
  "getAutomationRuntimeTranslation",
  "getCommerceRuntimeTranslation",
  "getPhase5RuntimeTranslation",
  "getWhatsAppRecoveryTranslation",
]) {
  if (!runtimeI18n.includes(owner)) errors.push(`localization: shared runtime resolver does not include ${owner}`);
}

const sheet = source("src/components/ui/sheet.tsx");
if (sheet.includes('<span className="sr-only">Close</span>')) {
  errors.push("sheet: hard-coded English close label remains");
}
if (!sheet.includes('t("common.close")')) errors.push("sheet: localized close label contract is missing");

const entityContext = source("src/components/entities/entity-context.tsx");
if (entityContext.includes('aria-label="Timeline"')) errors.push("entity timeline: hard-coded English accessible label remains");
if (!entityContext.includes('t("common.timeline")')) errors.push("entity timeline: localized accessible label is missing");

const dropdown = source("src/components/ui/dropdown-menu.tsx");
if (!dropdown.includes('ChevronRightIcon className="ms-auto size-4 rtl:rotate-180"')) {
  errors.push("dropdown submenu: directional chevron is not explicitly RTL governed");
}

const dashboardLayout = source("src/components/layout/dashboard-layout.tsx");
if (!dashboardLayout.includes("usePathname") || !dashboardLayout.includes('getElementById("main-content")') || !dashboardLayout.includes("main.focus")) {
  errors.push("shell: client route changes do not restore focus to the active work surface");
}

const globals = source("src/app/globals.css");
if (!globals.includes("@media (prefers-reduced-motion: reduce)")) {
  errors.push("motion: global reduced-motion contract is missing");
}
if (!globals.includes('html[dir="rtl"] body') || !globals.includes("--font-arabic")) {
  errors.push("Arabic typography: root RTL Arabic font contract is missing");
}
if (!globals.includes("unicode-bidi: isolate")) {
  errors.push("bidi: shared isolation contract is missing");
}

const targetContracts = [
  ["checkbox", source("src/components/ui/checkbox.tsx"), "size-6"],
  ["switch", source("src/components/ui/switch.tsx"), "min-h-6"],
  ["slider", source("src/components/ui/slider.tsx"), "size-6"],
  ["info hint", source("src/components/shared/info-hint.tsx"), "min-h-6"],
] as const;
for (const [name, content, marker] of targetContracts) {
  if (!content.includes(marker)) errors.push(`target size: ${name} does not expose the 24px shared target floor`);
}

const stateSurface = source("src/components/shared/state-surface.tsx");
if (!stateSurface.includes("aria-live={live}") || !stateSurface.includes("role={role}")) {
  errors.push("state surface: shared async status announcement hooks are missing");
}
const chartFrame = source("src/components/charts/chart-primitives.tsx");
if (!chartFrame.includes("accessibleSummary") || !chartFrame.includes("aria-describedby={summaryId}")) {
  errors.push("charts: non-visual analytical summary contract is missing");
}
const dataTable = source("src/components/data-table/data-table.tsx");
if (!dataTable.includes('<table className="w-full"') || dataTable.includes("tabIndex={onRowClick")) {
  errors.push("data table: semantic HTML table / non-focusable row contract regressed");
}

const speculation = source("src/components/shared/speculation-rules.tsx");
if (speculation.includes("prerender:")) {
  errors.push("performance: whole-document speculative prerender remains enabled");
}
if (!speculation.includes("prefetch:")) {
  errors.push("performance: bounded intent prefetch contract is missing");
}

const runtimeReady = source("src/components/runtime/runtime-ui-ready-beacon.tsx");
if (!runtimeReady.includes('dataset.sfHydrated = "true"')) {
  errors.push("runtime: hydrated UI evidence marker is missing");
}

mkdirSync(evidenceDir, { recursive: true });
const result = {
  formatVersion: 1,
  generatedAt: new Date().toISOString(),
  commit: inventory.commit,
  routeCount: routes.length,
  requiredRoutes: [...requiredRoutes],
  localeKeyCounts: { en: Object.keys(en).length, fr: Object.keys(fr).length, ar: Object.keys(ar).length },
  hardcodedCopyFindings,
  blockingFindings: errors,
  manualReviewWarnings: warnings,
};
writeFileSync(contractPath, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(
  summaryPath,
  `# Phase 6/7 static completion contract\n\nCommit: \`${inventory.commit}\`\n\n- Routes inventoried: ${routes.length}\n- EN keys: ${Object.keys(en).length}\n- FR keys: ${Object.keys(fr).length}\n- AR keys: ${Object.keys(ar).length}\n- Hard-coded user-copy findings: ${hardcodedCopyFindings.length}\n- Blocking findings: ${errors.length}\n- Manual-review warnings: ${warnings.length}\n\n## Blocking findings\n\n${errors.length ? errors.map((error) => `- ${error}`).join("\n") : "None."}\n\n## Manual-review warnings\n\n${warnings.length ? warnings.map((warning) => `- ${warning}`).join("\n") : "None."}\n`,
);

if (errors.length > 0) {
  console.error("Phase 6/7 completion contract failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Phase 6/7 static contract passed for ${routes.length} routes at ${inventory.commit}`);
