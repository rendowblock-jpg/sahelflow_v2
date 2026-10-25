import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/**
 * axe-core accessibility check for the browser evidence sweeps.
 *
 * Strict on purpose: no rule and no element is excluded. If a rule cannot be
 * satisfied on a surface, report it and fix the surface; do not add a
 * `disableRules` or `exclude` here.
 */

// The same six tags the manual sweep used: WCAG 2.0/2.1/2.2 A and AA plus
// axe's best-practice rules.
export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
] as const;

export const AXE_RUN_OPTIONS = {
  runOnly: { type: "tag", values: [...AXE_TAGS] },
  // Only violations decide the result; skipping passes/incomplete detail keeps
  // the in-page work and the payload small.
  resultTypes: ["violations"],
};

export type AxeSelector = string | ReadonlyArray<string>;

export type AxeViolation = {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: Array<{ html: string; target: ReadonlyArray<AxeSelector> }>;
};

const MAX_NODES_SHOWN = 3;
const MAX_HTML_CHARS = 200;

let cachedSource: string | null = null;

// Read from the installed package (pinned in package.json) so CI never fetches
// a script from the network.
function axeSource(): string {
  if (cachedSource === null) {
    const resolve = createRequire(join(process.cwd(), "package.json")).resolve;
    cachedSource = readFileSync(resolve("axe-core/axe.min.js"), "utf8");
  }
  return cachedSource;
}

export function formatAxeViolations(
  violations: ReadonlyArray<AxeViolation>,
): string {
  if (violations.length === 0) return "";
  const lines: string[] = [
    `${violations.length} accessibility violation${violations.length === 1 ? "" : "s"}`,
  ];
  violations.forEach((violation, index) => {
    const count = violation.nodes.length;
    lines.push(
      `${index + 1}. ${violation.id} (${violation.impact ?? "unknown"}): ${violation.help}`,
      `   ${violation.helpUrl}`,
      `   ${count} element${count === 1 ? "" : "s"}${count > MAX_NODES_SHOWN ? `, first ${MAX_NODES_SHOWN} shown` : ""}`,
    );
    for (const node of violation.nodes.slice(0, MAX_NODES_SHOWN)) {
      const html = node.html.replace(/\s+/g, " ").trim();
      lines.push(
        `   html: ${html.length > MAX_HTML_CHARS ? `${html.slice(0, MAX_HTML_CHARS)}…` : html}`,
        `   target: ${node.target.flat().join(" >>> ")}`,
      );
    }
  });
  return lines.join("\n");
}

export async function runAxe(page: Page): Promise<AxeViolation[]> {
  await page.addScriptTag({ content: axeSource() });
  return page.evaluate(async (options) => {
    const axe = (
      window as unknown as {
        axe: {
          run(
            context: Document,
            options: unknown,
          ): Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    const results = await axe.run(document, options);
    return results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        target: node.target,
      })),
    }));
  }, AXE_RUN_OPTIONS);
}

export async function assertNoAxeViolations(
  page: Page,
  label: string,
): Promise<void> {
  const violations = await runAxe(page);
  if (violations.length > 0) {
    throw new Error(`${label}\n${formatAxeViolations(violations)}`);
  }
}
