/**
 * Minimal, streaming-friendly markdown parser for the AI decision canvas.
 *
 * Scope: exactly the subset the Gemini assistant actually emits — headings,
 * bold/italic/strikethrough, inline + fenced code, ordered/unordered/task
 * lists, GFM pipe tables with alignment, links, blockquotes, horizontal
 * rules and paragraphs. Everything else (raw HTML, images, footnotes,
 * reference links…) is intentionally parsed as literal text.
 *
 * Safety model: the parser returns a plain token tree — never HTML. The
 * React renderer maps tokens to elements, so untrusted model output can
 * never inject markup. Link hrefs are protocol-allowlisted (http/https/
 * mailto); hrefs carrying control characters or embedded whitespace are
 * rejected outright and degrade to non-clickable text. No
 * `dangerouslySetInnerHTML` exists on this path.
 *
 * Streaming: the parser is a pure function of the current buffer, so the
 * canvas can re-parse on every `text_delta`. Partial constructs degrade
 * gracefully (an unclosed code fence renders as a code block that keeps
 * growing; an unfinished table renders its header first).
 */

export type MarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: MarkdownInline[] }
  | { kind: "emphasis"; children: MarkdownInline[] }
  | { kind: "delete"; children: MarkdownInline[] }
  | { kind: "link"; text: string; href: string; safe: boolean };

export type MarkdownTableAlign = "start" | "center" | "end" | null;

export interface MarkdownListItem {
  children: MarkdownInline[];
  task?: { checked: boolean };
}

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; children: MarkdownInline[] }
  | { kind: "paragraph"; lines: MarkdownInline[][] }
  | { kind: "code"; language: string | null; lines: string[] }
  | { kind: "list"; ordered: boolean; items: MarkdownListItem[] }
  | {
      kind: "table";
      header: MarkdownInline[][];
      rows: MarkdownInline[][][];
      align: MarkdownTableAlign[];
    }
  | { kind: "quote"; children: MarkdownInline[] }
  | { kind: "hr" };

const PROTOCOL_ALLOWLIST = /^(?:https?:\/\/|mailto:)/i;
const ESCAPABLE = /[\\`*_~[\]()#!>|-]/;

/**
 * Only http(s)/mailto hrefs are ever rendered as anchors. Unsafe schemes
 * (javascript:, data:, vbscript:, file:, unknown-app schemes) and hrefs
 * carrying control characters or embedded whitespace fall back to plain
 * non-clickable text in the renderer.
 */
export function isSafeMarkdownHref(raw: string): boolean {
  return safeHrefOrNull(raw) !== null;
}

function safeHrefOrNull(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Reject outright on control characters or embedded whitespace — a
  // hostile href is never "cleaned" into acceptability.
  if (/[\u0000-\u0020\u007f]/.test(trimmed)) return null;
  return PROTOCOL_ALLOWLIST.test(trimmed) ? trimmed : null;
}

/* ─── Block parsing ─────────────────────────────────────────────────────── */

const FENCE_OPEN = /^ {0,3}(`{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,})\s*$/;
const HEADING = /^(#{1,4})[ \t]+(\S.*)$/;
const THEMATIC_BREAK = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_MARKER = /^ {0,3}>\s?/;
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d{1,9})[.)])[ \t]+(\S.*)$/;
const TASK_MARKER = /^\[([ xX])\]\s+/;

/** Split a GFM table row into trimmed cells (backslash-escaped pipes honored). */
export function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function isTableDelimiter(line: string): boolean {
  if (!line.includes("|") || !line.includes("-")) return false;
  const cells = splitTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((cell) => cell.length > 0 && /^:?-+:?$/.test(cell));
}

function tableAlignment(line: string): MarkdownTableAlign[] {
  return splitTableRow(line).map((cell) => {
    const start = cell.startsWith(":");
    const end = cell.endsWith(":");
    if (start && end) return "center";
    if (end) return "end";
    if (start) return "start";
    return null;
  });
}

function startsBlock(line: string, nextLine: string | undefined): boolean {
  if (
    FENCE_OPEN.test(line) ||
    HEADING.test(line) ||
    THEMATIC_BREAK.test(line) ||
    QUOTE_MARKER.test(line) ||
    LIST_ITEM.test(line)
  ) {
    return true;
  }
  // A pipe row immediately followed by a delimiter row opens a table, even
  // when the paragraph above has not been closed yet.
  return (
    line.includes("|") && nextLine !== undefined && isTableDelimiter(nextLine)
  );
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined || !line.trim()) {
      index += 1;
      continue;
    }

    // Fenced code block. An unclosed fence stays open until the buffer
    // ends — the desired behavior while a response streams in.
    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      const info = (fence[2] ?? "").trim();
      const language =
        info && !info.startsWith(".")
          ? (info.split(/\s+/)[0] ?? null)
          : null;
      const body: string[] = [];
      index += 1;
      while (index < lines.length) {
        const bodyLine = lines[index];
        if (bodyLine === undefined || FENCE_CLOSE.test(bodyLine)) break;
        body.push(bodyLine);
        index += 1;
      }
      if (index < lines.length) index += 1; // consume the closing fence
      blocks.push({ kind: "code", language, lines: body });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: (heading[1] ?? "#").length as 1 | 2 | 3 | 4,
        children: parseInline((heading[2] ?? "").trim()),
      });
      index += 1;
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push({ kind: "hr" });
      index += 1;
      continue;
    }

    // GFM table: header row + delimiter row.
    if (line.includes("|") && index + 1 < lines.length) {
      const next = lines[index + 1];
      if (next !== undefined && isTableDelimiter(next)) {
        const header = splitTableRow(line).map(parseInline);
        const align = tableAlignment(next);
        index += 2;
        const rows: MarkdownInline[][][] = [];
        while (index < lines.length) {
          const rowLine = lines[index];
          if (
            rowLine === undefined ||
            !rowLine.trim() ||
            !rowLine.includes("|") ||
            isTableDelimiter(rowLine)
          ) {
            break;
          }
          rows.push(splitTableRow(rowLine).map(parseInline));
          index += 1;
        }
        blocks.push({ kind: "table", header, rows, align });
        continue;
      }
    }

    if (QUOTE_MARKER.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length) {
        const quoteLine = lines[index];
        if (quoteLine === undefined || !QUOTE_MARKER.test(quoteLine)) break;
        quoted.push(quoteLine.replace(QUOTE_MARKER, ""));
        index += 1;
      }
      blocks.push({
        kind: "quote",
        children: parseInline(quoted.join(" ").trim()),
      });
      continue;
    }

    const listItem = LIST_ITEM.exec(line);
    if (listItem) {
      const ordered = listItem[3] !== undefined;
      const rawItems: string[] = [listItem[4] ?? ""];
      index += 1;
      while (index < lines.length) {
        const current = lines[index];
        if (current === undefined) break;
        const nextItem = LIST_ITEM.exec(current);
        if (nextItem && (nextItem[3] !== undefined) === ordered) {
          rawItems.push(nextItem[4] ?? "");
          index += 1;
          continue;
        }
        // Indented continuation lines extend the previous item.
        const lastRaw = rawItems[rawItems.length - 1];
        if (
          lastRaw !== undefined &&
          /^\s+\S/.test(current) &&
          !startsBlock(current, lines[index + 1])
        ) {
          rawItems[rawItems.length - 1] = `${lastRaw} ${current.trim()}`;
          index += 1;
          continue;
        }
        break;
      }
      const items: MarkdownListItem[] = rawItems.map((raw) => {
        const task = TASK_MARKER.exec(raw);
        if (task) {
          return {
            children: parseInline(raw.slice(task[0]?.length ?? 0)),
            task: { checked: (task[1] ?? " ").toLowerCase() === "x" },
          };
        }
        return { children: parseInline(raw) };
      });
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // Paragraph: consecutive plain lines; single line breaks render as <br/>.
    const paragraphLines: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const paragraphLine = lines[index];
      if (
        paragraphLine === undefined ||
        !paragraphLine.trim() ||
        startsBlock(paragraphLine, lines[index + 1])
      ) {
        break;
      }
      paragraphLines.push(paragraphLine);
      index += 1;
    }
    blocks.push({
      kind: "paragraph",
      lines: paragraphLines.map((entry) => parseInline(entry)),
    });
  }

  return blocks;
}

/* ─── Inline parsing ────────────────────────────────────────────────────── */

const LINK_PATTERN = /^\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/;
const IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/;

/** Find the closing delimiter, ignoring backslash-escaped occurrences. */
function findDelimiter(text: string, from: number, delimiter: string): number {
  for (let i = from; i <= text.length - delimiter.length; i += 1) {
    if ((text[i] ?? "") === "\\") {
      i += 1;
      continue;
    }
    if (text.startsWith(delimiter, i)) return i;
  }
  return -1;
}

/** Find a lone `*` closer that is not part of a `**` strong delimiter. */
function findLoneAsterisk(text: string, from: number): number {
  for (let i = from; i < text.length; i += 1) {
    if ((text[i] ?? "") === "\\") {
      i += 1;
      continue;
    }
    if (
      (text[i] ?? "") === "*" &&
      (text[i + 1] ?? "") !== "*" &&
      (text[i - 1] ?? "") !== "*" &&
      (text[i - 1] ?? "") !== "\\"
    ) {
      return i;
    }
  }
  return -1;
}

export function parseInline(text: string): MarkdownInline[] {
  const tokens: MarkdownInline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) {
      tokens.push({ kind: "text", text: buffer });
      buffer = "";
    }
  };
  let i = 0;

  while (i < text.length) {
    const char = text[i] ?? "";
    const nextChar = text[i + 1] ?? "";

    // Backslash escape of markdown punctuation.
    if (char === "\\" && nextChar !== "" && ESCAPABLE.test(nextChar)) {
      buffer += nextChar;
      i += 2;
      continue;
    }

    // Inline code (single or repeated backticks).
    if (char === "`") {
      const run = /^`+/.exec(text.slice(i))?.[0] ?? "`";
      const close = findDelimiter(text, i + run.length, run);
      if (close > 0) {
        flush();
        let code = text.slice(i + run.length, close);
        if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ")) {
          code = code.slice(1, -1);
        }
        tokens.push({ kind: "code", text: code });
        i = close + run.length;
        continue;
      }
      buffer += run;
      i += run.length;
      continue;
    }

    // Strikethrough ~~text~~.
    if (char === "~" && text.startsWith("~~", i)) {
      const close = findDelimiter(text, i + 2, "~~");
      if (close > 0) {
        flush();
        tokens.push({
          kind: "delete",
          children: parseInline(text.slice(i + 2, close)),
        });
        i = close + 2;
        continue;
      }
      buffer += "~~";
      i += 2;
      continue;
    }

    // Strong **text** / __text__.
    if ((char === "*" || char === "_") && text.startsWith(char.repeat(2), i)) {
      const delimiter = char.repeat(2);
      const close = findDelimiter(text, i + 2, delimiter);
      if (close > 0) {
        flush();
        tokens.push({
          kind: "strong",
          children: parseInline(text.slice(i + 2, close)),
        });
        i = close + 2;
        continue;
      }
      buffer += delimiter;
      i += 2;
      continue;
    }

    // Emphasis *text*. A single underscore stays literal — that protects
    // snake_case identifiers the model quotes outside code spans.
    if (char === "*") {
      const close = findLoneAsterisk(text, i + 1);
      if (close > 0) {
        flush();
        tokens.push({
          kind: "emphasis",
          children: parseInline(text.slice(i + 1, close)),
        });
        i = close + 1;
        continue;
      }
      buffer += "*";
      i += 1;
      continue;
    }

    // Image syntax is never rendered (no remote image loading from model
    // output) — degrade to the alt text alone.
    if (char === "!" && nextChar === "[") {
      const image = IMAGE_PATTERN.exec(text.slice(i));
      if (image) {
        buffer += image[1] ?? "";
        i += image[0].length;
        continue;
      }
    }

    // Link [text](href) — protocol-validated.
    if (char === "[") {
      const link = LINK_PATTERN.exec(text.slice(i));
      if (link) {
        const label = link[1] ?? "";
        const rawHref = (link[2] ?? "").trim().split(/\s+/)[0] ?? "";
        const safeHref = safeHrefOrNull(rawHref);
        flush();
        tokens.push({
          kind: "link",
          text: label,
          href: safeHref ?? rawHref,
          safe: safeHref !== null,
        });
        i += link[0].length;
        continue;
      }
    }

    buffer += char;
    i += 1;
  }

  flush();
  return tokens;
}
