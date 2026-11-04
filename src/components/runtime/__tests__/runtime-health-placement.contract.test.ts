/**
 * F-0022 source contract: the status lives in the top bar, in flow, and the
 * monitor runs in exactly one place. These read the source because a second
 * monitor or a floating box is a structural mistake no render test would see.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
/** Source without comments, so prose that says "fixed height" is not mistaken for a class. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = resolve(dir, entry);
    if (statSync(absolute).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...sourceFiles(absolute));
    } else if (/\.(?:ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
      out.push(absolute);
    }
  }
  return out;
}

describe("runtime health placement contract", () => {
  it("calls the monitor hook in exactly one place: the provider", () => {
    const callers = sourceFiles(resolve(root, "src"))
      .filter((file) => /(?<!function )useRuntimeHealth\(/.test(code(relative(root, file))))
      .map((file) => relative(root, file).replaceAll("\\", "/"));
    expect(callers).toEqual(["src/components/runtime/runtime-health-provider.tsx"]);
  });

  it("the dashboard layout mounts the provider around the shell and no floating box", () => {
    const layout = code("src/app/(dashboard)/layout.tsx");
    expect(layout).toContain("<RuntimeHealthProvider>");
    expect(layout).not.toContain("RuntimeHealthBanner");
    expect(layout.indexOf("<RuntimeHealthProvider>")).toBeLessThan(layout.indexOf("<DashboardLayout"));
    expect(layout.indexOf("</DashboardLayout>")).toBeLessThan(layout.indexOf("</RuntimeHealthProvider>"));
  });

  it("the floating banner component no longer exists", () => {
    expect(existsSync(resolve(root, "src/components/runtime/runtime-health-banner.tsx"))).toBe(false);
  });

  it("the top bar renders the control inside its inline-end cluster, before the update chip", () => {
    const topbar = code("src/components/layout/topbar.tsx");
    const cluster = topbar.indexOf('className="ms-auto flex shrink-0 items-center gap-0.5"');
    const control = topbar.indexOf("<RuntimeHealthIndicator />");
    const chip = topbar.indexOf("<UpdateChip />");
    expect(cluster).toBeGreaterThan(-1);
    expect(control).toBeGreaterThan(cluster);
    expect(chip).toBeGreaterThan(control);
  });

  it("the control and the provider never take themselves out of flow or use physical sides", () => {
    for (const path of [
      "src/components/runtime/runtime-health-indicator.tsx",
      "src/components/runtime/runtime-health-provider.tsx",
    ]) {
      const source = code(path);
      expect(source, path).not.toMatch(/(?<![\w-])(?:fixed|sticky)(?![\w-])/);
      expect(source, path).not.toMatch(/(?<![\w-])(?:left|right|bottom|top)-\d/);
      expect(source, path).not.toMatch(/(?<![\w-])(?:ml|mr|pl|pr)-/);
    }
  });
});
