import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) =>
  readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");

describe("desktop app shell viewport contract", () => {
  it("allows every nested flex region to shrink inside the WebView viewport", () => {
    const layout = read("src/components/layout/dashboard-layout.tsx");
    const sidebar = read("src/components/layout/sidebar.tsx");

    expect(layout).toContain(
      'className="flex h-[100dvh] min-h-0 overflow-hidden',
    );
    expect(layout).toContain(
      'className="hidden h-full min-h-0 shrink-0 lg:flex"',
    );
    expect(layout).toContain(
      'className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
    );
    expect(sidebar).toContain(
      '"flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar"',
    );
    expect(sidebar).toContain('<ScrollArea className="min-h-0 flex-1">');
  });
});
