#!/usr/bin/env bun

import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import * as ts from "typescript";

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);
const RAW_METHODS = new Set([
  "$executeRaw",
  "$executeRawUnsafe",
  "$queryRaw",
  "$queryRawUnsafe",
]);

type RawAccessKind =
  | "named"
  | "namespace"
  | "default"
  | "dynamic"
  | "require"
  | "import-equals"
  | "re-export"
  | "canonical-raw-method";

export interface RawImportFinding {
  kind: RawAccessKind;
  line: number;
}

/**
 * Exact reviewed raw consumers outside maintenance/tests. Counts are strict so
 * a new dynamic/namespace access cannot hide behind an existing file allowance.
 */
const EXPLICIT_RAW_ALLOWLIST: Readonly<
  Record<string, Readonly<Partial<Record<RawAccessKind, number>>>>
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

function stringValue(node: ts.Expression | undefined): string | null {
  return node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function propertyNameText(name: ts.PropertyName | undefined): string | null {
  if (!name) return null;
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return null;
}

function unwrapExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (true) {
    const parent = current.parent;
    if (
      (ts.isAwaitExpression(parent) && parent.expression === current) ||
      (ts.isParenthesizedExpression(parent) && parent.expression === current) ||
      (ts.isAsExpression(parent) && parent.expression === current) ||
      (ts.isTypeAssertionExpression(parent) && parent.expression === current) ||
      (ts.isNonNullExpression(parent) && parent.expression === current) ||
      (ts.isSatisfiesExpression(parent) && parent.expression === current)
    ) {
      current = parent;
      continue;
    }
    return current;
  }
}

function unwrapReceiverExpression(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function moduleCall(node: ts.Expression): ts.CallExpression | null {
  let current: ts.Expression = node;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  if (!ts.isCallExpression(current) || current.arguments.length < 1) return null;
  const moduleName = stringValue(current.arguments[0]);
  if (!moduleName || !isDbModule(moduleName)) return null;
  if (current.expression.kind === ts.SyntaxKind.ImportKeyword) return current;
  if (
    ts.isIdentifier(current.expression) &&
    current.expression.text === "require"
  ) {
    return current;
  }
  return null;
}

function moduleCallKind(call: ts.CallExpression): "dynamic" | "require" {
  return call.expression.kind === ts.SyntaxKind.ImportKeyword
    ? "dynamic"
    : "require";
}

function importedName(element: ts.BindingElement): string | null {
  return (
    propertyNameText(element.propertyName) ??
    (ts.isIdentifier(element.name) ? element.name.text : null)
  );
}

function identifierName(name: ts.BindingName): string | null {
  return ts.isIdentifier(name) ? name.text : null;
}

function inspectModuleBinding(
  name: ts.BindingName,
  canonicalDbBindings: Set<string>,
): "raw" | "safe" | "ambiguous" {
  if (!ts.isObjectBindingPattern(name)) return "ambiguous";
  let raw = false;
  for (const element of name.elements) {
    if (element.dotDotDotToken) return "ambiguous";
    const imported = importedName(element);
    if (!imported) return "ambiguous";
    if (imported === "dbRaw") raw = true;
    if (imported === "db") {
      const local = identifierName(element.name);
      if (!local) return "ambiguous";
      canonicalDbBindings.add(local);
    }
  }
  return raw ? "raw" : "safe";
}

function inspectModuleExpression(
  expression: ts.Expression,
  canonicalDbBindings: Set<string>,
): "raw" | "safe" | "ambiguous" {
  const unwrapped = unwrapExpression(expression);
  const parent = unwrapped.parent;

  if (ts.isPropertyAccessExpression(parent) && parent.expression === unwrapped) {
    const access = parent.name.text;
    const declaration = unwrapExpression(parent).parent;
    if (access === "dbRaw") return "raw";
    if (access !== "db") return "safe";
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer === unwrapExpression(parent) &&
      ts.isIdentifier(declaration.name)
    ) {
      canonicalDbBindings.add(declaration.name.text);
      return "safe";
    }
    return "ambiguous";
  }

  if (ts.isElementAccessExpression(parent) && parent.expression === unwrapped) {
    const access = stringValue(parent.argumentExpression);
    const declaration = unwrapExpression(parent).parent;
    if (access === "dbRaw") return "raw";
    if (access !== "db") return access === null ? "ambiguous" : "safe";
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer === unwrapExpression(parent) &&
      ts.isIdentifier(declaration.name)
    ) {
      canonicalDbBindings.add(declaration.name.text);
      return "safe";
    }
    return "ambiguous";
  }

  if (ts.isVariableDeclaration(parent) && parent.initializer === unwrapped) {
    return inspectModuleBinding(parent.name, canonicalDbBindings);
  }

  const array = unwrapped.parent;
  if (ts.isArrayLiteralExpression(array)) {
    const index = array.elements.findIndex((candidate) => candidate === unwrapped);
    const promiseCall = array.parent;
    if (
      index >= 0 &&
      ts.isCallExpression(promiseCall) &&
      ts.isPropertyAccessExpression(promiseCall.expression) &&
      ts.isIdentifier(promiseCall.expression.expression) &&
      promiseCall.expression.expression.text === "Promise" &&
      promiseCall.expression.name.text === "all"
    ) {
      const declaration = unwrapExpression(promiseCall).parent;
      if (
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer === unwrapExpression(promiseCall) &&
        ts.isArrayBindingPattern(declaration.name)
      ) {
        const selected = declaration.name.elements[index];
        if (!selected || ts.isOmittedExpression(selected)) return "safe";
        return inspectModuleBinding(selected.name, canonicalDbBindings);
      }
      return "ambiguous";
    }
  }

  return "ambiguous";
}

function rawMethodName(node: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    return stringValue(node.argumentExpression);
  }
  return null;
}

function rawMethodReceiver(node: ts.Node): ts.Expression | null {
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    return node.expression;
  }
  return null;
}

function sourceFileFor(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

export function rawClientImports(
  source: string,
  fileName = "source.ts",
): RawImportFinding[] {
  const sourceFile = sourceFileFor(fileName, source);
  const findings: RawImportFinding[] = [];
  const canonicalDbBindings = new Set<string>();
  const add = (kind: RawAccessKind, node: ts.Node) =>
    findings.push({ kind, line: lineOf(sourceFile, node) });

  function collectImports(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isDbModule(node.moduleSpecifier.text)) {
        const clause = node.importClause;
        if (clause?.name) add("default", node);
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          add("namespace", node);
        } else if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            const imported = (element.propertyName ?? element.name).text;
            if (imported === "dbRaw") add("named", node);
            if (imported === "db") canonicalDbBindings.add(element.name.text);
          }
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const moduleName = stringValue(node.moduleReference.expression);
      if (moduleName && isDbModule(moduleName)) add("import-equals", node);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const moduleName = stringValue(node.moduleSpecifier);
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
    } else if (ts.isCallExpression(node)) {
      const call = moduleCall(node);
      if (call === node) {
        const state = inspectModuleExpression(call, canonicalDbBindings);
        if (state !== "safe") add(moduleCallKind(call), call);
      }
    }
    ts.forEachChild(node, collectImports);
  }

  collectImports(sourceFile);

  let changed = true;
  while (changed) {
    changed = false;
    function collectAliases(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isIdentifier(node.initializer) &&
        canonicalDbBindings.has(node.initializer.text) &&
        !canonicalDbBindings.has(node.name.text)
      ) {
        canonicalDbBindings.add(node.name.text);
        changed = true;
      }
      ts.forEachChild(node, collectAliases);
    }
    collectAliases(sourceFile);
  }

  function collectRawMethods(node: ts.Node): void {
    const method = rawMethodName(node);
    const receiver = rawMethodReceiver(node);
    const unwrappedReceiver = receiver
      ? unwrapReceiverExpression(receiver)
      : null;
    if (
      method &&
      RAW_METHODS.has(method) &&
      unwrappedReceiver &&
      ts.isIdentifier(unwrappedReceiver) &&
      canonicalDbBindings.has(unwrappedReceiver.text)
    ) {
      add("canonical-raw-method", node);
    }

    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(unwrapReceiverExpression(node.initializer)) &&
      canonicalDbBindings.has(
        (unwrapReceiverExpression(node.initializer) as ts.Identifier).text,
      ) &&
      node.name.elements.some((element) => {
        const imported = importedName(element);
        return imported !== null && RAW_METHODS.has(imported);
      })
    ) {
      add("canonical-raw-method", node);
    }

    ts.forEachChild(node, collectRawMethods);
  }

  collectRawMethods(sourceFile);
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
  const observed = new Map<RawAccessKind, number>();
  for (const finding of findings) {
    observed.set(finding.kind, (observed.get(finding.kind) ?? 0) + 1);
  }
  const kinds = new Set<RawAccessKind>([
    ...(Object.keys(allowance) as RawAccessKind[]),
    ...observed.keys(),
  ]);
  return [...kinds].every(
    (kind) => (allowance[kind] ?? 0) === (observed.get(kind) ?? 0),
  );
}

export function protectedRawAccessViolations(
  repositoryRoot = resolve(process.env.SF_REPO_DIR ?? process.cwd()),
): string[] {
  const sourceRoot = resolve(repositoryRoot, "src");
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
  return violations.sort();
}

export function runProtectedRawAccessVerification(): boolean {
  const violations = protectedRawAccessViolations();
  if (violations.length > 0) {
    console.error(
      "Protected raw authority violation: application/domain code can access dbRaw or invoke raw Prisma methods on canonical db outside an exact reviewed boundary.",
    );
    for (const path of violations) console.error(` - ${path}`);
    return false;
  }
  console.log(
    "Protected raw authority verified: raw-client imports and canonical-db raw Prisma methods are restricted to exact maintenance/test boundaries.",
  );
  return true;
}

const importMeta = import.meta as ImportMeta & { main?: boolean };
if (importMeta.main && !runProtectedRawAccessVerification()) {
  process.exitCode = 1;
}
