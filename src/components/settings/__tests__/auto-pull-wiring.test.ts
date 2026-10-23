/**
 * Source-text pins for the INT-03 off switch (spelling, not behaviour; the behaviour is in
 * auto-pull-panel.render.test.tsx and auto-pull-route.test.ts). These only prove that the pieces are
 * connected: the panel sits on the right settings pages with the right permission, the panel and the
 * route name the same path, and the route asks for the right right per switch.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("auto-pull wiring", () => {
  const pages = read("src/components/settings/settings-pages.tsx");
  const panel = read("src/components/settings/auto-pull-panel.tsx");
  const route = read("src/app/api/integrations/auto-pull/route.ts");

  it("puts the shop switch on the commerce page for people who manage integrations", () => {
    expect(pages).toContain('<AutoPullPanel kind="commerce" canManage={access.commerceManage} />');
  });

  it("puts the courier switch on the delivery page for people who manage courier credentials", () => {
    expect(pages).toContain('<AutoPullPanel kind="courier" canManage={access.delivery} />');
  });

  it("imports the panel into the pages file", () => {
    expect(pages).toContain('from "@/components/settings/auto-pull-panel"');
  });

  it("has the panel and the route agree on the path", () => {
    expect(panel).toContain('"/api/integrations/auto-pull"');
  });

  it("names the delivery right for the courier switch and the integrations right for the shop one", () => {
    expect(route).toContain('const COURIER_RIGHT = "delivery.credentials.manage"');
    expect(route).toContain('const COMMERCE_RIGHT = "integrations.manage"');
    expect(route).toMatch(/input\.courier !== undefined\) \{\s*assertTrustedAction\(actorContext, COURIER_RIGHT/);
    expect(route).toMatch(/input\.commerce !== undefined\) \{\s*assertTrustedAction\(actorContext, COMMERCE_RIGHT/);
  });

  it("identifies the actor before it reads the body", () => {
    const actorAt = route.indexOf("requireTrustedActor()", route.indexOf("export const PUT"));
    const bodyAt = route.indexOf("request.json()", route.indexOf("export const PUT"));
    expect(actorAt).toBeGreaterThan(-1);
    expect(bodyAt).toBeGreaterThan(actorAt);
  });
});
