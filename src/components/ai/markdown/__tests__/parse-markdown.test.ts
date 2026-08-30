import { describe, expect, it } from "vitest";

import {
  isSafeMarkdownHref,
  parseInline,
  parseMarkdown,
  splitTableRow,
} from "@/components/ai/markdown/parse-markdown";

describe("AI markdown parser — XSS safety", () => {
  it("renders raw HTML as literal text tokens, never markup", () => {
    const blocks = parseMarkdown(
      '<script>alert("xss")</script>\n\n<img src=x onerror="alert(1)">',
    );
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.kind).toBe("paragraph");
    }
    const tokens = blocks.flatMap((block) =>
      block.kind === "paragraph" ? block.lines.flat() : [],
    );
    // Every token is plain text — React renders these as escaped strings.
    for (const token of tokens) {
      expect(token.kind).toBe("text");
    }
    const texts = tokens
      .map((token) => (token.kind === "text" ? token.text : ""))
      .join("|");
    expect(texts).toContain('<script>alert("xss")</script>');
    expect(texts).toContain('<img src=x onerror="alert(1)">');
  });

  it("never produces a clickable javascript:/data:/vbscript: link", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "jav&#x09;ascript:alert(1)",
    ]) {
      const tokens = parseInline(`[click](${href})`);
      const link = tokens.find((token) => token.kind === "link");
      expect(link, href).toBeDefined();
      expect(link && link.kind === "link" && link.safe).toBe(false);
    }
  });

  it("keeps http/https/mailto links clickable and exact", () => {
    for (const href of [
      "https://example.com/a?b=c",
      "http://example.com",
      "mailto:seller@example.dz",
      "https://en.wikipedia.org/wiki/Algiers_(department)",
    ]) {
      const tokens = parseInline(`[label](${href})`);
      const link = tokens.find((token) => token.kind === "link");
      expect(link && link.kind === "link" && link.safe).toBe(true);
      expect(link && link.kind === "link" && link.href).toBe(href);
    }
  });

  it("rejects hrefs with control characters or embedded whitespace", () => {
    expect(isSafeMarkdownHref("https://a.b/\u0000evil")).toBe(false);
    expect(isSafeMarkdownHref("https://a.b/x y")).toBe(false);
    expect(isSafeMarkdownHref("https://a.b/x\u0007y")).toBe(false);
    expect(isSafeMarkdownHref("https://a.b/ok")).toBe(true);
  });

  it("never renders image syntax — degrades to alt text only", () => {
    const tokens = parseInline("![tracker](https://evil.example/pixel.png)");
    expect(tokens).toEqual([{ kind: "text", text: "tracker" }]);
    const serialized = JSON.stringify(tokens);
    expect(serialized).not.toContain("evil.example");
  });
});

describe("AI markdown parser — GFM tables", () => {
  it("parses header, alignment row and body cells", () => {
    const blocks = parseMarkdown(
      [
        "| Order | Total | Status |",
        "| ------ | ---: | :---: |",
        "| SF-1001 | 1200 | pending |",
        "| SF-1002 | 3400 | delivered |",
      ].join("\n"),
    );
    expect(blocks).toHaveLength(1);
    const table = blocks[0];
    expect(table?.kind).toBe("table");
    if (table?.kind !== "table") return;
    expect(table.header).toHaveLength(3);
    expect(table.header[0]).toEqual([{ kind: "text", text: "Order" }]);
    expect(table.align).toEqual([null, "end", "center"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]?.[0]).toEqual([{ kind: "text", text: "SF-1001" }]);
  });

  it("honors escaped pipes inside cells", () => {
    expect(splitTableRow("| a \\| b | c |")).toEqual(["a | b", "c"]);
  });

  it("supports inline markdown inside table cells", () => {
    const blocks = parseMarkdown("| **Total** |\n| --- |\n| 1 200 DZD |");
    const table = blocks[0];
    expect(table?.kind).toBe("table");
    if (table?.kind !== "table") return;
    expect(table.header[0]?.[0]).toEqual({
      kind: "strong",
      children: [{ kind: "text", text: "Total" }],
    });
  });

  it("renders a header-only table while the body streams in", () => {
    const blocks = parseMarkdown("| Order |\n| --- |");
    const table = blocks[0];
    expect(table?.kind).toBe("table");
    if (table?.kind === "table") expect(table.rows).toHaveLength(0);
  });

  it("does not treat a lone pipe paragraph as a table", () => {
    const blocks = parseMarkdown("Today | tomorrow\nand | more");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe("paragraph");
  });
});

describe("AI markdown parser — blocks", () => {
  it("parses heading levels 1-4 with inline content", () => {
    const blocks = parseMarkdown("### Risk **summary**");
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 3 });
    const heading = blocks[0];
    if (heading?.kind !== "heading") return;
    expect(heading.children[0]).toEqual({ kind: "text", text: "Risk " });
    expect(heading.children[1]?.kind).toBe("strong");
  });

  it("keeps an unclosed code fence open while streaming", () => {
    const blocks = parseMarkdown("```python\nprint('hi')");
    const code = blocks[0];
    expect(code).toMatchObject({
      kind: "code",
      language: "python",
      lines: ["print('hi')"],
    });
  });

  it("parses fenced code with language and multiple lines", () => {
    const blocks = parseMarkdown("```\nline1\nline2\n```");
    expect(blocks[0]).toMatchObject({
      kind: "code",
      language: null,
      lines: ["line1", "line2"],
    });
  });

  it("parses ordered, unordered and task lists", () => {
    const bullets = parseMarkdown("- first\n- second");
    expect(bullets[0]).toMatchObject({
      kind: "list",
      ordered: false,
      items: [{ children: [{ kind: "text", text: "first" }] }, { children: [{ kind: "text", text: "second" }] }],
    });
    const numbered = parseMarkdown("1. step one\n2. step two");
    expect(numbered[0]).toMatchObject({ kind: "list", ordered: true });
    const tasks = parseMarkdown("- [x] confirmed\n- [ ] to call");
    const list = tasks[0];
    if (list?.kind !== "list") throw new Error("expected list");
    expect(list.items[0]?.task).toEqual({ checked: true });
    expect(list.items[1]?.task).toEqual({ checked: false });
    expect(list.items[0]?.children).toEqual([
      { kind: "text", text: "confirmed" },
    ]);
  });

  it("parses blockquotes and thematic breaks", () => {
    const blocks = parseMarkdown("> note **bold**\n\n---\n\nafter");
    expect(blocks[0]).toMatchObject({ kind: "quote" });
    expect(blocks[1]).toEqual({ kind: "hr" });
    expect(blocks[2]?.kind).toBe("paragraph");
  });

  it("keeps paragraph line breaks as separate lines", () => {
    const blocks = parseMarkdown("line one\nline two");
    const paragraph = blocks[0];
    if (paragraph?.kind !== "paragraph") throw new Error("expected paragraph");
    expect(paragraph.lines).toHaveLength(2);
  });
});

describe("AI markdown parser — inline", () => {
  it("parses bold, italic, strikethrough and inline code", () => {
    const tokens = parseInline(
      "**bold** and *ital* and ~~gone~~ and `a * b` plus __strong__",
    );
    expect(tokens).toEqual([
      { kind: "strong", children: [{ kind: "text", text: "bold" }] },
      { kind: "text", text: " and " },
      { kind: "emphasis", children: [{ kind: "text", text: "ital" }] },
      { kind: "text", text: " and " },
      { kind: "delete", children: [{ kind: "text", text: "gone" }] },
      { kind: "text", text: " and " },
      { kind: "code", text: "a * b" },
      { kind: "text", text: " plus " },
      { kind: "strong", children: [{ kind: "text", text: "strong" }] },
    ]);
  });

  it("nests strong inside emphasis", () => {
    const tokens = parseInline("*a **b** c*");
    expect(tokens[0]).toMatchObject({ kind: "emphasis" });
    const emphasis = tokens[0];
    if (emphasis?.kind !== "emphasis") throw new Error("expected emphasis");
    expect(emphasis.children.map((token) => token.kind)).toEqual([
      "text",
      "strong",
      "text",
    ]);
  });

  it("leaves unmatched emphasis markers as literal text (streaming-safe)", () => {
    expect(parseInline("**unclosed")).toEqual([
      { kind: "text", text: "**unclosed" },
    ]);
    expect(parseInline("*a")).toEqual([{ kind: "text", text: "*a" }]);
    expect(parseInline("a `b")).toEqual([{ kind: "text", text: "a `b" }]);
  });

  it("does not italicize snake_case identifiers (single underscore stays literal)", () => {
    const tokens = parseInline("the order_status field");
    expect(tokens).toEqual([
      { kind: "text", text: "the order_status field" },
    ]);
  });

  it("supports backslash escapes for markdown punctuation", () => {
    expect(parseInline("\\*not ital\\*")).toEqual([
      { kind: "text", text: "*not ital*" },
    ]);
    expect(parseInline("3 \\* 4")).toEqual([{ kind: "text", text: "3 * 4" }]);
  });

  it("handles DZD amounts and order numbers without mangling", () => {
    const tokens = parseInline("Order SF-1042 costs 4_500 DZD");
    expect(tokens).toEqual([
      { kind: "text", text: "Order SF-1042 costs 4_500 DZD" },
    ]);
  });
});
