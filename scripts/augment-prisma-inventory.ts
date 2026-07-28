#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

interface RepositoryInventory {
  counts: Record<string, number>;
  prisma: {
    schema: string | null;
    schemaFiles?: string[];
    models: string[];
    enums: string[];
    migrations: string[];
  };
}

const repoRoot = resolve(process.env.SF_REPO_DIR || process.cwd());
const inventoryPath = resolve(repoRoot, ".sf-inventory/repository-inventory.json");
const summaryPath = resolve(repoRoot, ".sf-inventory/SUMMARY.md");

const git = spawnSync(
  "git",
  ["ls-files", "-z", "--", "prisma/*.prisma", "prisma/**/*.prisma"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
if (git.status !== 0) {
  throw new Error(`failed to enumerate Prisma schema files: ${git.stderr || "unknown error"}`);
}

const schemaFiles = git.stdout
  .split("\0")
  .map((file) => file.trim())
  .filter(Boolean)
  .filter((file) => !file.startsWith("prisma/migrations/"))
  .sort();
if (schemaFiles.length === 0) {
  throw new Error("multi-file Prisma inventory found no schema files");
}

const modelSet = new Set<string>();
const enumSet = new Set<string>();
for (const file of schemaFiles) {
  const content = readFileSync(resolve(repoRoot, file), "utf8");
  for (const match of content.matchAll(/^model\s+(\w+)\s*\{/gm)) {
    if (match[1]) modelSet.add(match[1]);
  }
  for (const match of content.matchAll(/^enum\s+(\w+)\s*\{/gm)) {
    if (match[1]) enumSet.add(match[1]);
  }
}

const inventory = JSON.parse(
  readFileSync(inventoryPath, "utf8"),
) as RepositoryInventory;
const models = [...modelSet].sort();
const enums = [...enumSet].sort();

inventory.counts.prismaSchemaFiles = schemaFiles.length;
inventory.counts.prismaModels = models.length;
inventory.counts.prismaEnums = enums.length;
inventory.prisma.schema = "prisma/";
inventory.prisma.schemaFiles = schemaFiles;
inventory.prisma.models = models;
inventory.prisma.enums = enums;
writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");

const countKeys = new Set([
  "prismaSchemaFiles",
  "prismaModels",
  "prismaEnums",
]);
const summaryLines = readFileSync(summaryPath, "utf8")
  .split("\n")
  .filter((line) => {
    const match = /^- ([A-Za-z0-9_]+):/.exec(line);
    return !match || !countKeys.has(match[1] ?? "");
  });
const insertionIndex = summaryLines.findIndex((line) => line.startsWith("- migrationFiles:"));
if (insertionIndex < 0) {
  throw new Error("repository inventory summary has no migrationFiles count anchor");
}
summaryLines.splice(
  insertionIndex,
  0,
  `- prismaSchemaFiles: ${schemaFiles.length}`,
  `- prismaModels: ${models.length}`,
  `- prismaEnums: ${enums.length}`,
);
writeFileSync(summaryPath, summaryLines.join("\n"), "utf8");

console.log(`Prisma schema files: ${schemaFiles.length}`);
console.log(`Prisma models: ${models.length}`);
console.log(`Prisma enums: ${enums.length}`);
