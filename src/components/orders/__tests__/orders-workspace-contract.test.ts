import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    read(path),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function importsBinding(sourceFile: ts.SourceFile, bindingName: string): boolean {
  return sourceFile.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) {
      return false;
    }

    if (statement.importClause.name?.text === bindingName) {
      return true;
    }

    const bindings = statement.importClause.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      return false;
    }

    return bindings.elements.some(
      (element) =>
        element.name.text === bindingName ||
        element.propertyName?.text === bindingName,
    );
  });
}

function callsBinding(sourceFile: ts.SourceFile, bindingName: string): boolean {
  let found = false;

  const visit = (node: ts.Node) => {
    if (found) return;

    if (ts.isCallExpression(node)) {
      const target = node.expression;
      if (
        (ts.isIdentifier(target) && target.text === bindingName) ||
        (ts.isPropertyAccessExpression(target) && target.name.text === bindingName)
      ) {
        found = true;
        return;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

describe("Orders operational workspace contract", () => {
  it("keeps list risk reads permission-gated and uses the bounded Orders projector", () => {
    const workbench = read("src/lib/orders/order-list-workbench.ts");
    expect(workbench).toContain("if (access.risk && rows.length > 0)");
    expect(workbench).toContain("batchAssessOrdersForWorkbench");
    expect(workbench).not.toContain("batchAssessOrders(");
  });

  it("batches order, customer-history, blacklist and wilaya inputs before pure scoring", () => {
    const riskPath = "src/lib/orders/order-risk-workbench.ts";
    const riskText = read(riskPath);
    const riskSource = parse(riskPath);

    expect(riskText).toContain(
      'where: { id: { in: uniqueOrderIds }, deletedAt: null }',
    );
    expect(riskText).toContain('customerId: { in: customerIds }');
    expect(riskText).toContain(
      'where: { id: { in: customerIds }, deletedAt: null }',
    );
    expect(riskText).toContain('where: { wilaya: { in: wilayas } }');
    expect(riskText).toContain("getRiskConfig(context)");
    expect(riskText).toContain("getRiskRules(context)");
    expect(riskText).toContain("assessRisk(input, config, rules)");
    expect(importsBinding(riskSource, "buildAssessmentInputFromOrder")).toBe(false);
    expect(callsBinding(riskSource, "buildAssessmentInputFromOrder")).toBe(false);
  });

  it("skips only the first exact server-fallback hydration when no older cache can shadow it", () => {
    const hook = read("src/hooks/swr/use-orders.ts");
    expect(hook).toMatch(
      /import\s+useSWR,\s*\{\s*useSWRConfig\s*\}\s+from\s+"swr"/,
    );
    expect(hook).toMatch(
      /const\s+\{\s*cache\s*\}\s*=\s*useSWRConfig\(\)/,
    );
    expect(hook).toMatch(
      /const\s+hasCachedData\s*=\s*cache\.get\(key\)\?\.data\s*!==\s*undefined/,
    );
    expect(hook).toMatch(
      /revalidateOnMount:\s*fallbackData\s*\?\s*hasCachedData\s*:\s*undefined/,
    );
    expect(hook).toMatch(
      /opts\.fallback\s*&&\s*opts\.fallback\.page\s*===\s*currentPage/,
    );
    expect(hook).toMatch(
      /opts\.fallback\.sort\s*===\s*normalizedSort/,
    );
  });
});
