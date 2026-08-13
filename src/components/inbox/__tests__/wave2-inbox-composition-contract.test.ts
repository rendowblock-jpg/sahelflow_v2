import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Wave 2 Inbox composition contract", () => {
  it("keeps the adaptive layout route-scoped instead of adding page rules to the global foundation", () => {
    const page = read("src/app/(dashboard)/inbox/page.tsx");
    const css = read("src/app/(dashboard)/inbox/inbox-wave2.module.css");
    const foundation = read("src/app/phase5.css");

    expect(page).toContain('import styles from "./inbox-wave2.module.css"');
    expect(page).toContain("${styles.page}");
    expect(css).toContain('[data-inbox-workspace="v2"]');
    expect(foundation).not.toContain("data-inbox-workspace");
  });

  it("gives the thread adaptive two- and three-pane desktop geometry", () => {
    const css = read("src/app/(dashboard)/inbox/inbox-wave2.module.css");

    expect(css).toContain('> div:has(> [data-inbox-queue="true"])');
    expect(css).toContain(
      "grid-template-columns: clamp(17.5rem, 22vw, 20rem) minmax(0, 1fr)",
    );
    expect(css).toContain(
      '> div:has(> aside > [data-inbox-context="true"])',
    );
    expect(css).toContain("minmax(26rem, 1fr)");
    expect(css).toContain('aside:has(> [data-inbox-context="true"])');
  });

  it("raises legacy microcopy and stabilizes long scrolling workspaces", () => {
    const css = read("src/app/(dashboard)/inbox/inbox-wave2.module.css");
    const hook = read("src/hooks/use-inbox-workspace.ts");

    expect(css).toContain('[class~="text-[10px]"]');
    expect(css).toContain('[class~="text-[11px]"]');
    expect(css).toContain("font-size: 0.75rem");
    expect(css).toContain("scrollbar-gutter: stable");
    expect(css).toContain("overscroll-behavior: contain");
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
