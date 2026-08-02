#!/usr/bin/env bun

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { assertTestSandbox } from "./test-sandbox";

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
  status?: string;
  message?: string;
  failureMessage?: string;
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
const vitestFailurePath = resolve(repoDir, ".sf-vitest-first-failure.txt");
const vitestFailuresPath = resolve(repoDir, ".sf-vitest-failures.txt");
const stepTimeoutMs = Number.parseInt(
  process.env.SF_VERIFY_STEP_TIMEOUT_MS ?? String(20 * 60 * 1000),
  10,
);
const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  SF_MASTER_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

// Bun auto-loads local .env files for this script. Verification must not pass
// developer, seller, provider, runtime, or signing credentials to child tools.
for (const key of [
  "APP_VERSION",
  "AUTH_SECRET",
  "CRON_SECRET",
  "DHD_API_BASE",
  "GITHUB_TOKEN",
  "SF_DEVICE_BINDING",
  "SF_LICENSE_DEVELOPMENT_BYPASS",
  "SF_LICENSE_CLOCK_ANCHOR_MS",
  "SF_LICENSE_CLOCK_ANCHOR_STATUS",
  "SF_LICENSE_PERMANENT_PUBLIC_KEYS",
  "SF_LICENSE_SERVICE_URL",
  "SF_LICENSE_TRIAL_PUBLIC_KEYS",
  "MAYSTRO_API_BASE",
  "NEXT_PUBLIC_CRON_SECRET",
  "SF_ACTIVE_SHOP_ID",
  "SF_DATABASE_FILE_ID",
  "SF_INSTALLATION_ID",
  "SF_MIGRATION_SET_SHA256",
  "SF_REGISTRY_REVISION",
  "SF_SHOP_INCARNATION_ID",
  "SF_WORKSPACE_ID",
  "SF_RUNTIME_APP_TOKEN",
  "SF_RUNTIME_INSTANCE_ID",
  "SF_RUNTIME_PORT",
  "SF_RUNTIME_TOKEN",
  "SIDECAR_TOKEN",
  "SIDECAR_TOKEN_FILE",
  "TAURI_PRIVATE_KEY_PATH",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "WHATSAPP_SIDECAR_PORT",
  "WHATSAPP_SIDECAR_URL",
  "YALIDINE_API_BASE",
  "ZREXPRESS_API_BASE",
]) {
  delete childEnv[key];
}

if (!Number.isSafeInteger(stepTimeoutMs) || stepTimeoutMs < 1) {
  throw new Error("SF_VERIFY_STEP_TIMEOUT_MS must be a positive integer");
}

rmSync(vitestResultsPath, { force: true });
rmSync(vitestFailurePath, { force: true });
rmSync(vitestFailuresPath, { force: true });

if (!skipTests) {
  assertTestSandbox("sf-verify");
}

const steps: Step[] = [
  {
    name: "Version and updater authority",
    command: "bun",
    args: ["run", "sf-version"],
  },
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
    args: [
      "vitest",
      "run",
      ...(failFastTests ? ["--bail=1"] : []),
      "--reporter=json",
      `--outputFile=${vitestResultsPath}`,
    ],
    skipInFast: true,
    skipWhenTestsSkipped: true,
  },
];

function printOutput(output: string): void {
  const trimmed = output.trim();
  if (!trimmed) return;

  const lines = trimmed.split("\n");
  let selectedLines = lines;
  if (lines.length > 120) {
    const firstErrorIndex = lines.findIndex((line) => /\berror\b/i.test(line));
    if (firstErrorIndex === -1) {
      selectedLines = lines.slice(-120);
    } else {
      const focusStart = Math.max(0, firstErrorIndex - 8);
      const focusEnd = Math.min(lines.length, firstErrorIndex + 16);
      const focus = lines.slice(focusStart, focusEnd);
      const tailCount = Math.max(0, 119 - focus.length);
      const tailStart = Math.max(focusEnd, lines.length - tailCount);
      selectedLines = [...focus];
      if (tailStart > focusEnd) {
        selectedLines.push(`... ${tailStart - focusEnd} line(s) omitted ...`);
      }
      selectedLines.push(...lines.slice(tailStart));
    }
  }

  for (const line of selectedLines) {
    console.error(`    ${line}`);
  }
}

function persistVitestFailure(lines: string[]): void {
  writeFileSync(vitestFailurePath, `${lines.join("\n").trim()}\n`, "utf8");
}

function persistVitestFailures(sections: string[][]): string {
  const firstFailure = sections[0];
  if (!firstFailure) {
    throw new Error("at least one Vitest failure is required");
  }

  const rendered = sections
    .map(
      (lines, index) =>
        `failure ${index + 1} of ${sections.length}\n${lines.join("\n").trim()}`,
    )
    .join("\n\n");
  writeFileSync(vitestFailuresPath, `${rendered}\n`, "utf8");
  persistVitestFailure(firstFailure);
  return rendered;
}

function printVitestFailures(): boolean {
  if (!existsSync(vitestResultsPath)) return false;

  try {
    const report = JSON.parse(readFileSync(vitestResultsPath, "utf8")) as VitestJsonResult;
    const failures: string[][] = [];
    for (const file of report.testResults ?? []) {
      let assertionFailureCount = 0;
      for (const assertion of file.assertionResults ?? []) {
        if (assertion.status !== "failed") continue;
        assertionFailureCount += 1;

        const title = [...(assertion.ancestorTitles ?? []), assertion.title]
          .filter(Boolean)
          .join(" > ");
        failures.push([
          `test file: ${file.name ?? "unknown"}`,
          `test: ${title || "unknown"}`,
          ...(assertion.failureMessages ?? []),
        ]);
      }

      if (assertionFailureCount === 0 && file.status === "failed") {
        const fileMessages = [file.failureMessage, file.message]
          .filter((value): value is string => Boolean(value?.trim()))
          .filter((value, index, values) => values.indexOf(value) === index);
        failures.push([
          `test file: ${file.name ?? "unknown"}`,
          "file-level failure: import, collection, setup or hook",
          ...(fileMessages.length > 0
            ? fileMessages
            : ["Vitest marked this file failed without assertion-level diagnostics."]),
        ]);
      }
    }

    if (failures.length === 0) return false;

    const rendered = persistVitestFailures(failures);
    console.error(`    Vitest reported ${failures.length} failure section(s).`);
    printOutput(rendered);
    return true;
  } catch (error) {
    const message = `unable to parse Vitest JSON report: ${error instanceof Error ? error.message : String(error)}`;
    persistVitestFailure([message]);
    writeFileSync(vitestFailuresPath, `${message}\n`, "utf8");
    console.error(`    ${message}`);
  } finally {
    rmSync(vitestResultsPath, { force: true });
  }

  return false;
}

console.log("SahelFlow verification gate");
console.log(`repo: ${repoDir}`);
console.log(`mode: ${fast ? "fast" : skipTests ? "skip-tests" : "full"}`);
console.log(`test failure mode: ${failFastTests ? "first failure" : "complete suite"}`);
console.log(`step timeout: ${stepTimeoutMs} ms`);

let failures = 0;

for (const step of steps) {
  if (fast && step.skipInFast) continue;
  if (skipTests && step.skipWhenTestsSkipped) continue;

  const startedAt = Date.now();
  const result = spawnSync(step.command, step.args, {
    cwd: repoDir,
    encoding: "utf8",
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: stepTimeoutMs,
  });
  const elapsed = Date.now() - startedAt;

  if (result.status === 0) {
    console.log(`PASS ${step.name} (${elapsed} ms)`);
    continue;
  }

  failures += 1;
  console.error(`FAIL ${step.name} (${elapsed} ms)`);
  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
  const printedStructuredFailure =
    step.name === "Vitest" && printVitestFailures();
  if (!printedStructuredFailure) {
    if (step.name === "Vitest" && !existsSync(vitestFailurePath)) {
      const fallback = combinedOutput.trim().split("\n").slice(-120);
      persistVitestFailure(fallback);
      writeFileSync(vitestFailuresPath, `${fallback.join("\n").trim()}\n`, "utf8");
    }
    printOutput(combinedOutput);
  }
}

if (failures > 0) {
  console.error(`${failures} verification step(s) failed.`);
  process.exit(1);
}

console.log("All selected verification steps passed.");