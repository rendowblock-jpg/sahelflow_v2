#!/usr/bin/env bun

import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface Step {
  name: string;
  command: string;
  args: string[];
  skipInFast?: boolean;
  skipWhenTestsSkipped?: boolean;
}

interface VitestAssertionResult {
  ancestorTitles?: string[];
  title?: string;
  status?: string;
  failureMessages?: string[];
}

interface VitestFileResult {
  name?: string;
  assertionResults?: VitestAssertionResult[];
}

interface VitestJsonResult {
  testResults?: VitestFileResult[];
}

const cliArgs = process.argv.slice(2);
const fast = cliArgs.includes("--fast");
const skipTests = fast || cliArgs.includes("--skip-tests");
const repoDir = process.env.SF_REPO_DIR || process.cwd();
const failFastTests = process.env.SF_TEST_FAIL_FAST === "1";
const vitestResultsPath = resolve(repoDir, ".sf-vitest-results.json");

const steps: Step[] = [
  {
    name: "Prisma client generation",
    command: "bun",
    args: ["run", "db:generate"],
    skipInFast: true,
  },
  {
    name: "Database migration deployment",
    command: "bunx",
    args: ["prisma", "migrate", "deploy"],
    skipInFast: true,
    skipWhenTestsSkipped: true,
  },
  { name: "TypeScript", command: "bun", args: ["run", "typecheck"] },
  { name: "ESLint", command: "bun", args: ["run", "lint"] },
  {
    name: "Vitest",
    command: "bunx",
    args: failFastTests
      ? [
          "vitest",
          "run",
          "--bail=1",
          "--reporter=json",
          `--outputFile=${vitestResultsPath}`,
        ]
      : ["vitest", "run"],
    skipInFast: true,
    skipWhenTestsSkipped: true,
  },
];

function printOutput(output: string): void {
  const trimmed = output.trim();
  if (!trimmed) return;

  for (const line of trimmed.split("\n").slice(-120)) {
    console.error(`    ${line}`);
  }
}

function printFirstVitestFailure(): boolean {
  if (!existsSync(vitestResultsPath)) return false;

  try {
    const report = JSON.parse(readFileSync(vitestResultsPath, "utf8")) as VitestJsonResult;
    for (const file of report.testResults ?? []) {
      for (const assertion of file.assertionResults ?? []) {
        if (assertion.status !== "failed") continue;

        const title = [...(assertion.ancestorTitles ?? []), assertion.title]
          .filter(Boolean)
          .join(" > ");
        console.error(`    test file: ${file.name ?? "unknown"}`);
        console.error(`    test: ${title || "unknown"}`);
        for (const message of assertion.failureMessages ?? []) {
          printOutput(message);
        }
        return true;
      }
    }
  } catch (error) {
    console.error(
      `    unable to parse Vitest JSON report: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    rmSync(vitestResultsPath, { force: true });
  }

  return false;
}

console.log("SahelFlow verification gate");
console.log(`repo: ${repoDir}`);
console.log(`mode: ${fast ? "fast" : skipTests ? "skip-tests" : "full"}`);
console.log(`test failure mode: ${failFastTests ? "first failure" : "complete suite"}`);

let failures = 0;

for (const step of steps) {
  if (fast && step.skipInFast) continue;
  if (skipTests && step.skipWhenTestsSkipped) continue;

  const startedAt = Date.now();
  const result = spawnSync(step.command, step.args, {
    cwd: repoDir,
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10 * 60 * 1000,
  });
  const elapsed = Date.now() - startedAt;

  if (result.status === 0) {
    console.log(`PASS ${step.name} (${elapsed} ms)`);
    continue;
  }

  failures += 1;
  console.error(`FAIL ${step.name} (${elapsed} ms)`);
  const printedStructuredFailure =
    step.name === "Vitest" && failFastTests && printFirstVitestFailure();
  if (!printedStructuredFailure) {
    printOutput(`${result.stdout || ""}\n${result.stderr || ""}`);
  }
}

if (failures > 0) {
  console.error(`${failures} verification step(s) failed.`);
  process.exit(1);
}

console.log("All selected verification steps passed.");
