import { readFileSync, writeFileSync } from "node:fs";

const path = "src/lib/__tests__/windows-installed-runtime-contract.test.ts";
let source = readFileSync(path, "utf8");

const before = `    expect(capability.permissions).toEqual(
      expect.arrayContaining(["updater:default", "process:default"]),
    );`;
const after = `    expect(capability.permissions).toContain("updater:default");
    expect(capability.permissions).not.toContain("process:default");`;

if (source.includes(before)) {
  source = source.replace(before, after);
} else if (!source.includes(after)) {
  throw new Error("Missing retired process-permission assertion anchor");
}

writeFileSync(path, source);
