import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, it } from "vitest";

const root = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "__tests__") return [];
      return sourceFiles(path);
    }
    return /\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("durable automation producer contract", () => {
  it("does not allow fire-and-forget trigger persistence in production sources", () => {
    const violations = sourceFiles(root).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const forbidden = ["void dispatchTrigger(", "void dispatchLowStock("];
      return forbidden
        .filter((pattern) => source.includes(pattern))
        .map((pattern) => `${relative(process.cwd(), path)}: ${pattern}`);
    });

    if (violations.length > 0) {
      throw new Error(
        `Fire-and-forget automation producers remain:\n${violations.join("\n")}`,
      );
    }
  });
});
