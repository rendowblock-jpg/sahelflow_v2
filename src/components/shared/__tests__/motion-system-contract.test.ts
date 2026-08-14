import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Internal.17 governed motion system", () => {
  it("loads the final motion authority after historical compatibility CSS", () => {
    const layout = read("src/app/layout.tsx");
    const phase5 = layout.indexOf('import "./phase5.css"');
    const product = layout.indexOf('import "./product-system.css"');
    const workspaces = layout.indexOf('import "./workspace-system.css"');
    const motion = layout.indexOf('import "./motion-system.css"');

    expect(phase5).toBeGreaterThanOrEqual(0);
    expect(product).toBeGreaterThan(phase5);
    expect(workspaces).toBeGreaterThan(product);
    expect(motion).toBeGreaterThan(workspaces);
  });

  it("restores shared route, stagger and directional surface motion", () => {
    const motion = read("src/app/motion-system.css");

    expect(motion).toContain('.page-sections > *');
    expect(motion).toContain('.stagger-grid > *');
    expect(motion).toContain('.animate-fade-up');
    expect(motion).toContain('.animate-scale-in');
    expect(motion).toContain('.animate-slide-right, .animate-slide-inline');
    expect(motion).toContain('--sf-motion-inline-entry: -8px');
    expect(motion).toContain('[dir="rtl"]');
    expect(motion).toContain('--sf-motion-inline-entry: 8px');
  });

  it("uses transform/opacity feedback and gives reduced-motion final authority", () => {
    const motion = read("src/app/motion-system.css");

    expect(motion).toContain('transform: scale(0.985)');
    expect(motion).toContain('transform: translateY(-1px)');
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)');
    expect(motion).toContain('animation-duration: 0.01ms !important');
    expect(motion).toContain('animation-delay: 0ms !important');
    expect(motion).toContain('transform: none !important');
  });
});
