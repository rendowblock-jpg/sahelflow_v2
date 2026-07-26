#!/usr/bin/env bun

console.error(
  "bun run release is disabled: it could commit, tag, push, sign, and publish unverified source.",
);
console.error(
  "Use the Build Signed Internal Windows Update workflow with an exact protected-main merge commit SHA.",
);
console.error(
  "That workflow creates a draft signed Internal updater and must pass the signed MSI, runtime, and UI gates before publication.",
);
process.exit(1);
