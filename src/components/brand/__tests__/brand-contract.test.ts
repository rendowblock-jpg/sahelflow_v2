import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("SahelFlow canonical brand mark", () => {
  it("keeps the Founder mark as the shared web and application identity", () => {
    const icon = read("public/icons/icon.svg");
    const component = read("src/components/brand/sahelflow-mark.tsx");
    const sidebar = read("src/components/layout/sidebar.tsx");
    const layout = read("src/app/layout.tsx");
    const manifest = read("src/app/manifest.ts");

    for (const color of ["#101728", "#F2EEE4", "#39D4BF"]) {
      expect(icon).toContain(color);
      expect(component).toContain(color);
    }
    expect(sidebar).toContain("SahelFlowMark");
    expect(sidebar).not.toContain(">SF<");
    expect(layout).toContain('/icons/icon.svg');
    expect(manifest).toContain('/icons/icon.svg');
    expect(manifest).not.toContain("icon-1024.png");
  });

  it("regenerates native Windows bundle icons from the same source mark", () => {
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      build?: { beforeDevCommand?: string; beforeBuildCommand?: string };
      bundle?: { icon?: string[] };
    };

    expect(tauri.build?.beforeDevCommand).toContain(
      "tauri icon public/icons/icon.svg",
    );
    expect(tauri.build?.beforeBuildCommand).toContain(
      "tauri icon public/icons/icon.svg",
    );
    expect(tauri.bundle?.icon).toContain("icons/icon.ico");
  });
});
