import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("SahelFlow canonical brand mark", () => {
  it("keeps the exact Founder-provided PNG as the shared web and application identity", () => {
    const icon = readFileSync(resolve(root, "public/icons/sahelflow-mark.png"));
    const digest = createHash("sha256").update(icon).digest("hex");
    const component = read("src/components/brand/sahelflow-mark.tsx");
    const sidebar = read("src/components/layout/sidebar.tsx");
    const layout = read("src/app/layout.tsx");
    const manifest = read("src/app/manifest.ts");

    expect(digest).toBe(
      "9aa05dff2a20f40027653db5bc146206ac7863d455ef9698dc5021f61f62253e",
    );
    expect(component).toContain('/icons/sahelflow-mark.png');
    expect(sidebar).toContain("SahelFlowMark");
    expect(sidebar).not.toContain(">SF<");
    expect(layout).toContain('/icons/sahelflow-mark.png');
    expect(manifest).toContain('/icons/sahelflow-mark.png');
    expect(`${layout}\n${manifest}`).not.toContain('/icons/icon.svg');
  });

  it("regenerates native Windows bundle icons from those same PNG bytes", () => {
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      build?: { beforeDevCommand?: string; beforeBuildCommand?: string };
      bundle?: { icon?: string[] };
    };

    expect(tauri.build?.beforeDevCommand).toContain(
      "tauri icon public/icons/sahelflow-mark.png",
    );
    expect(tauri.build?.beforeBuildCommand).toContain(
      "tauri icon public/icons/sahelflow-mark.png",
    );
    expect(tauri.bundle?.icon).toContain("icons/icon.ico");
  });
});
