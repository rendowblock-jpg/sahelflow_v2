#!/usr/bin/env bun

console.error(
  "bun run release is disabled: it could commit, tag, push, sign, and publish unverified source.",
);
console.error(
  "Use the Build Internal Windows Candidate workflow with an exact protected-main commit SHA.",
);
console.error("That workflow produces unsigned internal build evidence only.");
process.exit(1);
