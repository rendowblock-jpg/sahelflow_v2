#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";

const repositoryRoot = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const sourceRoot = resolve(repositoryRoot, "src");
const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

type RawImportKind =
  | "named"
  | "namespace"
  | "default"
  | "dynamic"
  | "require"
  | "import-equals"
  | "re-export";

interface RawImportFinding {
  kind: RawImportKind;
  line: number;
}

/**
 * Exact, reviewed raw consumers outside maintenance/tests. Counts are strict so
 * a new dynamic/namespace access cannot hide behind an existing file allowance.
 */
const EXPLICIT_RAW_ALLOWLIST: Readonly<
  Record<string, Readonly<Partial<Record<RawImportKind, number>>>>
> = {
  "src/app/api/internal/runtime-ready/route.ts": { dynamic: 2 },
};

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function isTestFile(path: string): boolean {
  return (
    path.includes("/__tests__/") ||
    /\.(?:test|spec)\.[cm]?tsx?$/.test(path)
  );
}

function isBroadRawAuthority(path: string): boolean {
  return (
    path === "src/lib/db.ts" ||
    path.startsWith("src/lib/maintenance/") ||
    isTestFile(path)
  );
}

function isDbModule(value: string): boolean {
  return value === "@/lib/db" || value.endsWith("/db");
}

function stringModule(node: ts.Expression | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

export function rawClientImports(
  source: string,
  fileName = "source.ts",
): RawImportFinding[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const findings: RawImportFinding[] = [];
  const add = (kind: RawImportKind, node: ts.Node) =>
    findings.push({ kind, line: lineOf(sourceFile, node) });

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isDbModule(node.moduleSpecifier.text)) {
        const clause = node.importClause;
        if (clause?.name) add("default", node);
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          add("namespace", node);
        } else if (bindings && ts.isNamedImports(bindings)) {
          if (
            bindings.elements.some(
              (element) => (element.propertyName ?? element.name).text === "dbRaw",
            )
          ) {
            add("named", node);
          }
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const moduleName = stringModule(node.moduleReference.expression);
      if (moduleName && isDbModule(moduleName)) add("import-equals", node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const moduleName = stringModule(node.moduleSpecifier);
      if (moduleName && isDbModule(moduleName)) {
        const clause = node.exportClause;
        if (
          !clause ||
          ts.isNamespaceExport(clause) ||
          (ts.isNamedExports(clause) &&
            clause.elements.some(
              (element) => (element.propertyName ?? element.name).text === "dbRaw",
            ))
        ) {
          add("re-export", node);
        }
      }
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const moduleName = stringModule(node.arguments[0]);
      if (moduleName && isDbModule(moduleName)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          add("dynamic", node);
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "require"
        ) {
          add("require", node);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.isFile() && sourceExtensions.has(extension(path))) {
      files.push(path);
    }
  }
  return files;
}

function allowanceMatches(
  path: string,
  findings: readonly RawImportFinding[],
): boolean {
  const allowance = EXPLICIT_RAW_ALLOWLIST[path];
  if (!allowance) return false;
  const observed = new Map<RawImportKind, number>();
  for (const finding of findings) {
    observed.set(finding.kind, (observed.get(finding.kind) ?? 0) + 1);
  }
  const kinds = new Set<RawImportKind>([
    ...(Object.keys(allowance) as RawImportKind[]),
    ...observed.keys(),
  ]);
  return [...kinds].every(
    (kind) => (allowance[kind] ?? 0) === (observed.get(kind) ?? 0),
  );
}

const violations: string[] = [];
for (const absolutePath of sourceFiles(sourceRoot)) {
  const path = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  const findings = rawClientImports(readFileSync(absolutePath, "utf8"), path);
  if (findings.length === 0 || isBroadRawAuthority(path)) continue;
  if (allowanceMatches(path, findings)) continue;
  violations.push(
    `${path}: ${findings.map(({ kind, line }) => `${kind}@${line}`).join(", ")}`,
  );
}

if (violations.length > 0) {
  console.error(
    "Protected raw-client authority violation: application/domain code can access dbRaw outside an exact reviewed boundary.",
  );
  for (const path of violations.sort()) console.error(` - ${path}`);
  process.exit(1);
}

console.log(
  "Protected raw-client authority verified: named, namespace, dynamic, require and re-export access is restricted to exact canonical boundaries.",
);
