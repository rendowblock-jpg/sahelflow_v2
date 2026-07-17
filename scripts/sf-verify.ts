#!/usr/bin/env bun

import { spawnSync } from "node:child_process";

interface Step {
  name: string;
  command: string;
  args: string[];
  skipInFast?: boolean;
  skipWhenTestsSkipped?: boolean;
}

const cliArgs = process.argv.slice(2);
const fast = cliArgs.includes("--fast");
const skipTests = fast || cliArgs.includes("--skip-tests");
const repoDir = process.env.SF_REPO_DIR || process.cwd();

const steps: Step[] = [
  {
    name: "Prisma client generation",
    command: "bun",
    args: ["run", "db:generate"],
    skipInFast: true,
  },
  { name: "TypeScript", command: "bun", args: ["run", "typecheck"] },
  { name: "ESLint", command: "bun", args: ["run", "lint"] },
  {
    name: "Vitest",
    command: "bun",
    args: ["run", "test"],
    skipInFast: true,
    skipWhenTestsSkipped: true,
  },
];

function printOutput(output: string): void {
  const lines = output.trim().split("\n");
  for (const line of lines.slice(-40)) {
    console.error(`    ${line}`);
  }
}

console.log("SahelFlow verification gate");
console.log(`repo: ${repoDir}`);
console.log(`mode: ${fast ? "fast" : skipTests ? "skip-tests" : "full"}`);

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
  printOutput(`${result.stdout || ""}\n${result.stderr || ""}`);
}

if (failures > 0) {
  console.error(`${failures} verification step(s) failed.`);
  process.exit(1);
}

console.log("All selected verification steps passed.");
