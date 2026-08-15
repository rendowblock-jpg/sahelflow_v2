import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Internal.19 Inbox composition contract", () => {
  it("keeps adaptive geometry in the shared experience authority instead of route patch CSS", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    const experience = read("src/app/experience-system.css");
    const foundation = read("src/app/phase5.css");

    expect(page).toContain('className="app-workspace-content flex flex-col"');
    expect(page).not.toContain("inbox-wave2.module.css");
    expect(experience).toContain('[data-inbox-workspace="v2"]');
    expect(experience).toContain('[data-inbox-queue="true"]');
    expect(experience).toContain('[data-inbox-thread]');
    expect(experience).toContain('aside:has(> [data-inbox-context="true"])');
    expect(foundation).not.toContain("data-inbox-workspace");
  });

  it("gives the thread deterministic two- and three-pane geometry with explicit RTL order", () => {
    const experience = read("src/app/experience-system.css");

    expect(experience).toContain("width: 19rem !important");
    expect(experience).toContain("width: 20rem !important");
    expect(experience).toContain("width: 17rem !important");
    expect(experience).toContain('html[dir="rtl"] [data-inbox-workspace="v2"] [data-inbox-queue="true"]');
    expect(experience).toContain("order: 3");
    expect(experience).toContain("order: 1");
  });

  it("raises legacy microcopy through shared workspace styling and preserves bounded thread scrolling", () => {
    const workspace = read("src/app/workspace-system.css");
    const hook = read("src/hooks/use-inbox-workspace.ts");

    expect(workspace).toContain('[data-inbox-workspace="v2"]');
    expect(workspace).toContain('[class~="text-[10px]"]');
    expect(workspace).toContain('[class~="text-[11px]"]');
    expect(workspace).toContain("font-size: 0.75rem");
    expect(hook).toContain("messages?limit=200");
    expect(hook).toContain("isNearBottomRef");
  });

  it("keeps a localized semantic work-surface heading without consuming layout space", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");

    expect(page).toContain("const { t } = await getI18n();");
    expect(page).toContain(
      '<h1 className="sr-only">{t("metadata.title.inbox")}</h1>',
    );
  });
});
