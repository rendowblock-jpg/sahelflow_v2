import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AxeViolation } from "../e2e/support/axe";
import {
  EXCLUDED,
  LOCALES,
  MODES,
  MODE_PLAN,
  ROUTES,
  THEMES,
  VIEWPORTS,
  assertPlanTables,
  cellId,
  cellVerdict,
  cells,
  classifyBuild,
  classifyPages,
  compareRuns,
  countByMode,
  discoverPageFiles,
  formatSummary,
  isReportOnly,
  modeSetup,
  pageFileToRoute,
  parseResultLines,
  passedCellIds,
  pickDetail,
  resolveRoutes,
  resultLine,
  routeAuth,
  summarize,
  summarizeViolations,
  themeStorage,
  type Cell,
  type ResultRecord,
} from "../e2e/support/a11y-matrix-plan";

const cell = (over: Partial<Cell> = {}): Cell => ({
  route: "/orders",
  locale: "ar",
  theme: "dark",
  viewport: "phone",
  mode: "normal",
  ...over,
});

const violation = (id: string, target = "main > button.x"): AxeViolation => ({
  id,
  impact: "serious",
  help: `${id} help`,
  helpUrl: `https://example.test/${id}`,
  nodes: [{ html: "<button></button>", target: [target] }],
});

describe("the fixed tables", () => {
  it("pins locales, themes, viewports and modes", () => {
    expect([...LOCALES]).toEqual(["ar", "fr", "en"]);
    expect([...THEMES]).toEqual(["light", "dark"]);
    expect(VIEWPORTS).toEqual({
      desktop: { width: 1366, height: 768 },
      phone: { width: 390, height: 844 },
      tiny: { width: 320, height: 568 },
    });
    expect([...MODES]).toEqual([
      "normal",
      "reflow320",
      "text200",
      "spacing",
      "forced",
      "reducedMotion",
      "keyboard",
    ]);
  });

  it("pins which viewports and themes each mode uses", () => {
    expect([...MODE_PLAN.normal.viewports]).toEqual(["desktop", "phone"]);
    expect([...MODE_PLAN.normal.themes]).toEqual(["light", "dark"]);
    expect([...MODE_PLAN.reflow320.viewports]).toEqual(["tiny"]);
    expect([...MODE_PLAN.text200.viewports]).toEqual(["desktop"]);
    expect([...MODE_PLAN.spacing.viewports]).toEqual(["phone"]);
    expect([...MODE_PLAN.forced.viewports]).toEqual(["phone", "desktop"]);
    expect([...MODE_PLAN.reducedMotion.viewports]).toEqual(["desktop"]);
    expect([...MODE_PLAN.keyboard.viewports]).toEqual(["desktop"]);
    for (const mode of MODES.filter((m) => m !== "normal")) {
      expect([...MODE_PLAN[mode].themes]).toEqual(["light"]);
    }
  });

  it("lists exactly 34 routes (23 static + 9 detail + the login and join pages) and 6 exclusions", () => {
    expect(ROUTES.length).toBe(34);
    expect(ROUTES.filter((r) => r.discover).length).toBe(9);
    expect(ROUTES.filter((r) => r.auth === "anonymous").map((r) => r.pattern)).toEqual(["/login", "/join"]);
    expect(EXCLUDED.length).toBe(6);
  });
});

describe("pageFileToRoute", () => {
  it("maps page files to routes, dropping route groups and keeping slots", () => {
    expect(pageFileToRoute("(dashboard)/orders/[id]/page.tsx")).toBe("/orders/[id]");
    expect(pageFileToRoute("page.tsx")).toBe("/");
    expect(pageFileToRoute("login/page.tsx")).toBe("/login");
    expect(pageFileToRoute("(dashboard)/@modal/(.)settings/page.tsx")).toBe("/@modal/(.)settings");
    expect(pageFileToRoute("(dashboard)/@modal/[...catchAll]/page.tsx")).toBe("/@modal/[...catchAll]");
    expect(pageFileToRoute("storefront/[slug]/lp/[page]/page.tsx")).toBe("/storefront/[slug]/lp/[page]");
    expect(pageFileToRoute("(dashboard)\\orders\\page.tsx")).toBe("/orders");
  });
});

describe("drift guard: every page.tsx is a route or an excluded page with a reason", () => {
  const files = discoverPageFiles(join(process.cwd(), "src/app"));

  it("reads the real app folder (not an empty list)", () => {
    expect(files.length).toBeGreaterThanOrEqual(40);
    expect(files).toContain("(dashboard)/orders/page.tsx");
  });

  it("leaves no page unclassified and no table entry without a page", () => {
    const result = classifyPages(files);
    expect(result.unclassified).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.routed.length + result.excluded.length).toBe(files.length);
  });

  it("names both @modal slots in the excluded list", () => {
    const patterns = EXCLUDED.map((e) => e.pattern);
    expect(patterns).toContain("/@modal/(.)settings");
    expect(patterns).toContain("/@modal/[...catchAll]");
  });

  it("reports a brand-new page nobody classified, including a new @modal slot", () => {
    expect(classifyPages(["(dashboard)/brand-new/page.tsx"]).unclassified).toEqual(["/brand-new"]);
    expect(classifyPages(["(dashboard)/@modal/(.)zzz/page.tsx"]).unclassified).toEqual(["/@modal/(.)zzz"]);
  });
});

describe("assertPlanTables", () => {
  it("accepts a sound table", () => {
    expect(
      assertPlanTables(
        [{ pattern: "/a", auth: "owner" }],
        [{ pattern: "/b", reason: "redirects to /a before it renders anything" }],
      ),
    ).toEqual([]);
  });

  it("rejects an empty, blank or one-word reason", () => {
    for (const reason of ["", "   ", "todo"]) {
      const problems = assertPlanTables([], [{ pattern: "/b", reason }]);
      expect(problems.length).toBe(1);
      expect(problems[0]).toContain("/b");
    }
  });

  it("rejects a duplicate pattern and a pattern that is both routed and excluded", () => {
    const reason = "a proper written reason for the exclusion";
    expect(
      assertPlanTables([{ pattern: "/a", auth: "owner" }, { pattern: "/a", auth: "owner" }], []).length,
    ).toBe(1);
    expect(
      assertPlanTables([{ pattern: "/a", auth: "owner" }], [{ pattern: "/a", reason }]).length,
    ).toBe(1);
  });

  it("holds for the real tables", () => {
    expect(assertPlanTables(ROUTES, EXCLUDED)).toEqual([]);
  });
});

describe("cells", () => {
  const routes = ["/a", "/b"];

  it("counts the default (normal mode only): 2 routes x 3 locales x 2 themes x 2 viewports", () => {
    expect(cells({}, routes).length).toBe(24);
  });

  it("counts every mode with A11Y_MODES=all: 33 cells per route", () => {
    const all = cells({ A11Y_MODES: "all" }, routes);
    expect(all.length).toBe(66);
    expect(countByMode(all)).toEqual({
      normal: 24,
      reflow320: 6,
      text200: 6,
      spacing: 6,
      forced: 12,
      reducedMotion: 6,
      keyboard: 6,
    });
  });

  it("puts reflow320 only on the 320 px viewport and never on desktop", () => {
    const list = cells({ A11Y_MODES: "reflow320" }, routes);
    expect(list.length).toBe(6);
    expect(new Set(list.map((c) => c.viewport))).toEqual(new Set(["tiny"]));
    expect(cells({ A11Y_MODES: "reflow320", A11Y_VIEWPORTS: "desktop" }, routes)).toEqual([]);
  });

  it("filters by locale, theme, viewport and mode", () => {
    expect(new Set(cells({ A11Y_LOCALES: "ar" }, routes).map((c) => c.locale))).toEqual(new Set(["ar"]));
    expect(cells({ A11Y_LOCALES: "ar,fr" }, routes).length).toBe(16);
    expect(new Set(cells({ A11Y_THEMES: "dark" }, routes).map((c) => c.theme))).toEqual(new Set(["dark"]));
    expect(cells({ A11Y_THEMES: "dark" }, routes).length).toBe(12);
    expect(new Set(cells({ A11Y_VIEWPORTS: "phone" }, routes).map((c) => c.viewport))).toEqual(new Set(["phone"]));
    expect(cells({ A11Y_MODES: "keyboard" }, routes).length).toBe(6);
  });

  it("A11Y_ONLY keeps a route and its sub-routes, not a route that merely starts with the same letters", () => {
    const list = ["/orders", "/orders/o1", "/ordersX", "/customers"];
    const only = (value: string) =>
      [...new Set(cells({ A11Y_ONLY: value, A11Y_LOCALES: "en", A11Y_THEMES: "light", A11Y_VIEWPORTS: "phone" }, list).map((c) => c.route))];
    expect(only("/orders")).toEqual(["/orders", "/orders/o1"]);
    expect(only("/orders,/customers")).toEqual(["/orders", "/orders/o1", "/customers"]);
  });

  it("rejects a mistyped filter instead of running zero cells", () => {
    expect(() => cells({ A11Y_LOCALES: "zz" }, routes)).toThrow(/A11Y_LOCALES/);
    expect(() => cells({ A11Y_THEMES: "blue" }, routes)).toThrow(/A11Y_THEMES/);
    expect(() => cells({ A11Y_VIEWPORTS: "watch" }, routes)).toThrow(/A11Y_VIEWPORTS/);
    expect(() => cells({ A11Y_MODES: "fast" }, routes)).toThrow(/A11Y_MODES/);
  });

  it("gives every cell a stable id", () => {
    expect(cellId(cell())).toBe("normal|/orders|ar|dark|phone");
    expect(cellId(cell({ mode: "reflow320", viewport: "tiny", theme: "light", locale: "en" }))).toBe(
      "reflow320|/orders|en|light|tiny",
    );
    const ids = cells({ A11Y_MODES: "all" }, ["/a", "/b"]).map(cellId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("shards", () => {
  const routes = ["/a", "/b", "/c"];
  const all = cells({ A11Y_MODES: "all" }, routes);

  it("covers every cell exactly once across the shards", () => {
    const parts = [1, 2, 3, 4].map((i) => cells({ A11Y_MODES: "all", A11Y_SHARD: `${i}/4` }, routes));
    const joined = parts.flat().map(cellId);
    expect(joined.length).toBe(all.length);
    expect(new Set(joined).size).toBe(all.length);
    expect([...joined].sort()).toEqual(all.map(cellId).sort());
  });

  it("balances shard sizes to within one cell", () => {
    const sizes = [1, 2, 3].map((i) => cells({ A11Y_MODES: "all", A11Y_SHARD: `${i}/3` }, routes).length);
    expect(sizes).toEqual([33, 33, 33]);
    const seven = [1, 2, 3].map((i) => cells({ A11Y_LOCALES: "ar", A11Y_THEMES: "light", A11Y_VIEWPORTS: "phone", A11Y_MODES: "spacing", A11Y_SHARD: `${i}/3` }, ["/a", "/b", "/c", "/d", "/e", "/f", "/g"]).length);
    expect(seven).toEqual([3, 2, 2]);
  });

  it("rejects a malformed shard", () => {
    for (const bad of ["0/3", "4/3", "a/b", "1/0", "2", "1/3/4"]) {
      expect(() => cells({ A11Y_SHARD: bad }, routes)).toThrow(/A11Y_SHARD/);
    }
  });
});

describe("modeSetup", () => {
  it("normal changes nothing", () => {
    expect(modeSetup("normal", "fr")).toEqual({ css: "", forcedColors: "none", reducedMotion: "no-preference" });
  });

  it("text200 doubles the root font", () => {
    expect(modeSetup("text200", "en").css).toBe("html{font-size:200% !important}");
  });

  it("spacing uses the WCAG 1.4.12 values and leaves letter-spacing off for Arabic", () => {
    const en = modeSetup("spacing", "en").css;
    expect(en).toContain("line-height:1.5 !important");
    expect(en).toContain("word-spacing:0.16em !important");
    expect(en).toContain("letter-spacing:0.12em !important");
    expect(en).toContain("p{margin-bottom:2em !important}");
    const ar = modeSetup("spacing", "ar").css;
    expect(ar).toContain("line-height:1.5 !important");
    expect(ar).toContain("word-spacing:0.16em !important");
    expect(ar).not.toContain("letter-spacing");
  });

  it("forced emulates forced colours and reducedMotion emulates reduce, and nothing else does", () => {
    expect(modeSetup("forced", "en").forcedColors).toBe("active");
    expect(modeSetup("reducedMotion", "en").reducedMotion).toBe("reduce");
    for (const mode of MODES) {
      if (mode !== "forced") expect(modeSetup(mode, "en").forcedColors).toBe("none");
      if (mode !== "reducedMotion") expect(modeSetup(mode, "en").reducedMotion).toBe("no-preference");
    }
  });
});

describe("theme and locale cookies", () => {
  it("sets the four cookies the product reads", () => {
    expect(themeStorage("dark", "ar")).toEqual({
      "sahelflow-theme": "dark",
      "sahelflow-theme-preset": "carnet",
      "sahelflow-look": "2",
      "sahelflow-locale": "ar",
    });
    expect(themeStorage("light", "fr")["sahelflow-theme"]).toBe("light");
  });
});

describe("detail routes found on the list pages", () => {
  const order = ROUTES.find((r) => r.pattern === "/orders/[id]");
  it("picks the first matching link and strips query and hash", () => {
    expect(order?.discover).toBeDefined();
    const link = order?.discover?.link ?? "";
    expect(pickDetail(["/orders", "/orders/confirmation-queue", "/orders/abc?x=1#top", "/orders/def"], link)).toBe("/orders/abc");
    expect(pickDetail(["/orders/confirmation-queue"], link)).toBeNull();
    expect(pickDetail([], link)).toBeNull();
  });

  it("resolves the 25 fixed routes plus the details found, and reports the missing ones", () => {
    const found = {
      "/orders": ["/orders/o1"],
      "/customers": ["/customers/c1"],
      "/products": ["/products/p1"],
      "/deliveries": [],
      "/returns": ["/returns/r1"],
      "/automations": ["/automations/new", "/automations/a1"],
      "/storefronts": ["/storefronts/new", "/storefronts/s1"],
    };
    const result = resolveRoutes(ROUTES, found);
    expect(result.routes.length).toBe(33);
    expect(result.routes).toContain("/orders/o1");
    expect(result.routes).toContain("/automations/a1");
    expect(result.routes).not.toContain("/automations/new/");
    expect(result.routes).toContain("/storefronts/s1/studio");
    expect(result.routes).toContain("/storefronts/s1/history");
    expect(result.missing).toEqual(["/deliveries/[id]"]);
    expect(routeAuth("/login")).toBe("anonymous");
    expect(routeAuth("/join")).toBe("anonymous");
    expect(routeAuth("/orders")).toBe("owner");
  });
});

describe("cellVerdict", () => {
  it("passes a clean cell", () => {
    expect(cellVerdict({ cell: cell(), violations: [], failures: [], reportOnly: false, settled: true })).toEqual({
      status: "pass",
      shouldThrow: false,
      message: "",
    });
  });

  it("fails strict on an axe violation and names rule, selector, route, locale, theme, viewport and mode", () => {
    const verdict = cellVerdict({
      cell: cell(),
      violations: [violation("color-contrast", "td.price")],
      failures: [],
      reportOnly: false,
      settled: true,
    });
    expect(verdict.status).toBe("fail");
    expect(verdict.shouldThrow).toBe(true);
    for (const piece of ["color-contrast", "td.price", "/orders", "ar", "dark", "phone", "normal"]) {
      expect(verdict.message).toContain(piece);
    }
  });

  it("report-only still records a fail but does not throw", () => {
    const verdict = cellVerdict({ cell: cell(), violations: [violation("label")], failures: [], reportOnly: true, settled: true });
    expect(verdict.status).toBe("fail");
    expect(verdict.shouldThrow).toBe(false);
    expect(verdict.message).toContain("label");
  });

  it("fails on a layout check failure alone and says the page was still animating", () => {
    const verdict = cellVerdict({ cell: cell(), violations: [], failures: ["sideways scroll: 412 > 390"], reportOnly: false, settled: false });
    expect(verdict.status).toBe("fail");
    expect(verdict.shouldThrow).toBe(true);
    expect(verdict.message).toContain("sideways scroll: 412 > 390");
  });
});

describe("summarizeViolations and resultLine", () => {
  it("summarises a violation with rule id, impact, node count and first selector", () => {
    expect(summarizeViolations([violation("button-name")])).toEqual([
      { rule: "button-name", impact: "serious", nodes: 1, target: "main > button.x", help: "button-name help" },
    ]);
  });

  it("writes one JSON line that carries the rule id and the cell", () => {
    const line = resultLine(cell(), {
      status: "fail",
      build: "prod",
      violations: summarizeViolations([violation("color-contrast")]),
      failures: ["x"],
      at: "2026-10-31T05:00:00.000Z",
    });
    expect(line.includes("\n")).toBe(false);
    const parsed = JSON.parse(line) as ResultRecord;
    expect(parsed.cellId).toBe("normal|/orders|ar|dark|phone");
    expect(parsed).toMatchObject({ route: "/orders", locale: "ar", theme: "dark", viewport: "phone", mode: "normal", status: "fail", build: "prod" });
    expect(parsed.violations[0]?.rule).toBe("color-contrast");
    expect(parsed.failures).toEqual(["x"]);
    expect(line).toContain('"rule":"color-contrast"');
  });
});

describe("resumable results", () => {
  const record = (id: string, status: ResultRecord["status"], build: ResultRecord["build"] = "prod", rules: string[] = []): ResultRecord => ({
    cellId: id,
    route: id.split("|")[1] ?? "",
    locale: "en",
    theme: "light",
    viewport: "phone",
    mode: "normal",
    status,
    build,
    violations: rules.map((rule) => ({ rule, impact: "serious", nodes: 1, target: "t", help: "h" })),
    failures: [],
    at: "x",
  });

  it("parses lines and ignores blank, partial and foreign lines", () => {
    const good = resultLine(cell(), { status: "pass", build: "dev", violations: [], failures: [], at: "t" });
    const parsed = parseResultLines(`${good}\n\nnot json\n{"half":\n{"unrelated":true}\n${good}\n`);
    expect(parsed.length).toBe(2);
  });

  it("counts a cell as passed only when its latest record is a pass on the same build", () => {
    const records = [
      record("normal|/a|en|light|phone", "pass"),
      record("normal|/b|en|light|phone", "fail", "prod", ["label"]),
      record("normal|/c|en|light|phone", "pass"),
      record("normal|/c|en|light|phone", "fail", "prod", ["label"]),
      record("normal|/d|en|light|phone", "skip"),
      record("normal|/e|en|light|phone", "pass", "dev"),
    ];
    expect([...passedCellIds(records, "prod")]).toEqual(["normal|/a|en|light|phone"]);
    expect([...passedCellIds(records, "dev")]).toEqual(["normal|/e|en|light|phone"]);
  });

  it("builds a summary by status, rule and route", () => {
    const records = [
      record("normal|/a|en|light|phone", "pass"),
      record("normal|/b|en|light|phone", "fail", "prod", ["label", "color-contrast"]),
      record("normal|/b|ar|light|phone", "fail", "prod", ["label"]),
      record("normal|/d|en|light|phone", "skip"),
    ];
    const summary = summarize(records);
    expect(summary).toEqual({
      run: 4,
      passed: 1,
      failed: 2,
      skipped: 1,
      byRule: { label: 2, "color-contrast": 1 },
      byRoute: { "/b": 2 },
    });
    const text = formatSummary(summary);
    expect(text).toContain("cells 4");
    expect(text).toContain("passed 1");
    expect(text).toContain("failed 2");
    expect(text).toContain("label 2");
    expect(text).toContain("/b 2");
  });

  it("compares two runs: new failures, fixed cells, still failing, new violations", () => {
    const before = [
      record("normal|/a|en|light|phone", "fail", "prod", ["label"]),
      record("normal|/b|en|light|phone", "pass"),
      record("normal|/c|en|light|phone", "fail", "prod", ["label"]),
    ];
    const after = [
      record("normal|/a|en|light|phone", "pass"),
      record("normal|/b|en|light|phone", "fail", "prod", ["color-contrast"]),
      record("normal|/c|en|light|phone", "fail", "prod", ["label", "region"]),
      record("normal|/d|en|light|phone", "fail", "prod", ["label"]),
    ];
    expect(compareRuns(before, after)).toEqual({
      newFailures: ["normal|/b|en|light|phone", "normal|/d|en|light|phone"],
      fixed: ["normal|/a|en|light|phone"],
      stillFailing: ["normal|/c|en|light|phone"],
      newViolations: [
        { cellId: "normal|/b|en|light|phone", rule: "color-contrast" },
        { cellId: "normal|/c|en|light|phone", rule: "region" },
        { cellId: "normal|/d|en|light|phone", rule: "label" },
      ],
    });
  });
});

describe("classifyBuild", () => {
  it("takes A11Y_BUILD first, rejects a bad value, and otherwise probes the script URLs", () => {
    expect(classifyBuild({ A11Y_BUILD: "prod" }, [])).toBe("prod");
    expect(classifyBuild({ A11Y_BUILD: "dev" }, ["/_next/static/chunks/main.js"])).toBe("dev");
    expect(() => classifyBuild({ A11Y_BUILD: "staging" }, [])).toThrow(/A11Y_BUILD/);
    expect(classifyBuild({}, ["/_next/static/development/_buildManifest.js"])).toBe("dev");
    expect(classifyBuild({}, ["/_next/static/chunks/webpack.js?v=1730"])).toBe("dev");
    expect(classifyBuild({}, ["/_next/static/chunks/main-abc123.js"])).toBe("unknown");
  });
});

describe("isReportOnly", () => {
  it("is on only for A11Y_REPORT_ONLY=1", () => {
    expect(isReportOnly({ A11Y_REPORT_ONLY: "1" })).toBe(true);
    expect(isReportOnly({ A11Y_REPORT_ONLY: "0" })).toBe(false);
    expect(isReportOnly({ A11Y_REPORT_ONLY: "true" })).toBe(false);
    expect(isReportOnly({})).toBe(false);
  });
});
