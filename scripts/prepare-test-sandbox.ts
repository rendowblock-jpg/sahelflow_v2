#!/usr/bin/env bun

import { prepareTestSandbox } from "./test-sandbox";

const root = process.argv[2];

try {
  const sandbox = prepareTestSandbox(root ?? "");
  console.log(`SF_TEST_ROOT=${sandbox.root}`);
  console.log(`SF_DATA_DIR=${sandbox.dataDir}`);
  console.log(`DATABASE_URL=${sandbox.databaseUrl}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
