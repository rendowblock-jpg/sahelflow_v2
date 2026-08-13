import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativeUrl: string): string {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf8");
}

describe("locale transition authority", () => {
  it("clears client router/prefetch state with a full document reload", () => {
    const hook = source("../../../hooks/use-i18n.ts");

    expect(hook).toContain("requestLocale(newLocale);");
    expect(hook).toContain("window.location.reload();");
    expect(hook).not.toContain("router.refresh()");
    expect(hook).not.toContain("useRouter");
    expect(hook.indexOf("requestLocale(newLocale);")).toBeLessThan(
      hook.indexOf("window.location.reload();"),
    );
  });

  it("keeps locale durable authority in the cookie and commits server locale before paint", () => {
    const uiStore = source("../../../stores/ui-store.ts");
    const provider = source("../server-locale-context.tsx");

    expect(uiStore).toContain("sahelflow-locale=${locale}");
    expect(uiStore).toContain("full-document navigation/reload");
    expect(uiStore).not.toContain("Call `router.refresh()`");
    expect(provider).toContain("useLayoutEffect");
    expect(provider).toContain("commitLocale(locale);");
  });
});
