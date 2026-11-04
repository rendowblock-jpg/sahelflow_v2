import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * R50 thread lane, phone (390x844 and 360x740): every control in the thread
 * pane is at least 40x40 css px, and the composer row does not run out of room.
 *
 * Why a contract on the source and not only on `size="icon-sm"`: the shared
 * Button sizes (`icon-sm` = size-9, `icon` = var(--control-height) = 36 px,
 * `sm` = h-9) only grow to the touch floor through `--sf-touch-target`, which
 * dashboard-layout.tsx sets to 3rem for a coarse pointer and to 0px otherwise.
 * A phone emulator (and a Windows touch laptop in a narrow window) reports a
 * fine pointer, so the floor must be explicit and deterministic: a `max-sm:`
 * class (phone = under 640 px, desktop is untouched).
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

type Tag = { file: string; line: number; text: string };

/** Opening tags of the given JSX element names (brace and quote aware). */
function openingTags(file: string, names: readonly string[]): Tag[] {
  const source = read(file);
  const out: Tag[] = [];
  const start = new RegExp(`<(${names.join("|")})(?=[\\s>/])`, "g");
  for (let match = start.exec(source); match; match = start.exec(source)) {
    let i = match.index + match[0].length;
    let depth = 0;
    let quote: string | null = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && source[i - 1] !== "=") break;
    }
    out.push({
      file,
      line: source.slice(0, match.index).split("\n").length,
      text: source.slice(match.index, i + 1).replace(/\s+/g, " "),
    });
  }
  return out;
}

const DIR = "src/components/inbox/";
const THREAD_PANE_FILES = [
  "inbox-v3-thread.tsx",
  "inbox-emoji-picker.tsx",
  "canned-response-picker.tsx",
  "held-send-notice.tsx",
  "inbox-thread-header.tsx",
  "inbox-thread-message.tsx",
  "inbox-thread-states.tsx",
  "voice-note-player.tsx",
  "inbox-media-attachment.tsx",
  "order-draft-dock.tsx",
  "conversation-controls.tsx",
].map((name) => DIR + name);

/** `max-sm:size-10`, `max-sm:min-h-10`, `max-sm:h-11` ... (10 = 40 px or more) */
const PHONE_FLOOR = /(?:^|[\s"'`])max-sm:(?:size|min-h|h)-(?:10|11|12)(?=[\s"'`}])/;
/** the same as a base class (back control: `size-11 md:size-8`) */
const BASE_FLOOR = /(?:^|[\s"'`])(?:size|min-h|h)-(?:10|11|12)(?=[\s"'`}])/;

function isControl(tag: Tag): boolean {
  if (/type="(?:file|hidden|checkbox|radio)"/.test(tag.text)) return false;
  return true;
}

function hasPhoneFloor(tag: Tag): boolean {
  if (PHONE_FLOOR.test(tag.text)) return true;
  // a base floor counts only when nothing shrinks it again for a fine pointer
  // (a phone emulator reports a fine pointer); `sm:[@media(pointer:fine)]:` is fine, it starts at 640 px
  return BASE_FLOOR.test(tag.text) && !/(?<!sm:)\[@media\(pointer:fine\)\]/.test(tag.text);
}

describe("phone: every control of the thread pane is at least 40 px tall", () => {
  const tags = THREAD_PANE_FILES.flatMap((file) =>
    openingTags(file, ["Button", "button", "Input", "input"]),
  ).filter(isControl);

  it("the scanner finds the controls it is meant to guard", () => {
    expect(tags.length).toBeGreaterThan(40);
    for (const file of THREAD_PANE_FILES) {
      expect(tags.some((tag) => tag.file === file), file).toBe(true);
    }
  });

  it("each Button / button / Input carries a phone floor (max-sm:size|min-h|h-10 or more)", () => {
    const missing = tags
      .filter((tag) => !hasPhoneFloor(tag))
      .map((tag) => `${tag.file.replace(DIR, "")}:${tag.line} ${tag.text.slice(0, 110)}`);
    expect(missing).toEqual([]);
  });

  it("icon-only buttons are square: they raise the WIDTH too (size-10), not only min-h", () => {
    const narrow = tags
      .filter((tag) => /size="icon(?:-sm|-xs)?"/.test(tag.text))
      .filter((tag) => !/(?:^|[\s"'`])(?:max-sm:)?size-(?:10|11|12)(?=[\s"'`}])/.test(tag.text))
      .map((tag) => `${tag.file.replace(DIR, "")}:${tag.line}`);
    expect(narrow).toEqual([]);
  });

  it("the scroll-to-bottom button is 40 px on the phone", () => {
    const thread = read(DIR + "inbox-v3-thread.tsx");
    expect(thread).toMatch(/"size-9 max-sm:size-10"|"size-9[^"]*max-sm:size-1[012]/);
  });
});

describe("phone: the composer row has room for the field at 360 px", () => {
  // widths in css px. A fine pointer gets 40 px buttons (max-sm:size-10); a real phone
  // (coarse pointer) gets min-w/min-h = --sf-touch-target = 3rem = 48 px from dashboard-layout.tsx
  const VIEWPORT = 360;
  const ROW_PADDING = 2 * 12; // .sf-thread-column padding-inline 0.75rem
  const SEND = 44;
  const GAPS = 2 * 6; // gap-1.5 between three items
  const startGroup = (button: number) => 3 * button + 2 * 2; // attach, emoji, templates (gap-0.5)
  const endGroup = (button: number) => button + SEND + 4; // mic, send (gap-1)
  const fieldOnOneLine = (button: number) => VIEWPORT - ROW_PADDING - startGroup(button) - endGroup(button) - GAPS;

  it("on one line the field would be 112 px (40 px buttons) or 80 px (48 px buttons) wide: too narrow to write in", () => {
    expect(fieldOnOneLine(40)).toBeLessThan(160);
    expect(fieldOnOneLine(48)).toBeLessThan(120);
  });

  it("so on the phone the row wraps: the field takes a full line, the two button groups share the next", () => {
    const thread = read(DIR + "inbox-v3-thread.tsx");
    const style = read(DIR + "inbox-composer-style.ts");
    expect(thread).toMatch(/"flex flex-wrap items-end gap-1\.5"/);
    expect(style).toMatch(/max-sm:order-first/);
    expect(style).toMatch(/max-sm:basis-full/);
    const mark = thread.indexOf('data-inbox-composer-group="end"');
    expect(thread.slice(mark - 200, mark)).toMatch(/max-sm:ms-auto/);
    // wrapped: the field has the whole 336 px line, both groups fit the second line together (even at 48 px buttons)
    expect(VIEWPORT - ROW_PADDING).toBeGreaterThanOrEqual(300);
    expect(startGroup(48) + endGroup(48) + 6).toBeLessThanOrEqual(VIEWPORT - ROW_PADDING);
  });
});

describe("phone: the emoji grid keeps 40 px cells inside the popover", () => {
  const POPOVER = Math.min(21 * 16, 0.92 * 360); // w-[min(21rem,92vw)] at 360 px
  const INNER = POPOVER - 16; // p-2
  const GAP = 2; // gap-0.5

  it("eight 40 px cells would overflow, seven fit", () => {
    expect(8 * 40 + 7 * GAP).toBeGreaterThan(INNER);
    expect(7 * 40 + 6 * GAP).toBeLessThanOrEqual(INNER);
  });

  it("the grid is 7 columns on the phone, headings span the whole row, cells and tabs are 40 px", () => {
    const emoji = read(DIR + "inbox-emoji-picker.tsx");
    expect(emoji).toMatch(/grid-cols-8[^"]*max-sm:grid-cols-7|max-sm:grid-cols-7[^"]*grid-cols-8/);
    expect(emoji).not.toMatch(/col-span-8/);
    expect(emoji).toMatch(/col-span-full/);
  });
});

describe("the header's container query is declared", () => {
  function cssFiles(dir: string): string[] {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? cssFiles(join(dir, entry.name))
        : entry.name.endsWith(".css")
          ? [join(dir, entry.name)]
          : [],
    );
  }

  it("every named container variant used in the inbox folder has a declared container", () => {
    const sources = readdirSync(join(ROOT, DIR))
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => read(DIR + name));
    const used = new Set<string>();
    for (const source of sources) {
      for (const m of source.matchAll(/@(?:min|max)-(?:\[[^\]]+\]|[a-z0-9]+)\/([a-z][a-z0-9-]*):/g)) used.add(m[1]!);
      for (const m of source.matchAll(/@[a-z0-9]+\/([a-z][a-z0-9-]*):/g)) used.add(m[1]!);
    }
    const declaredIn = [
      ...sources,
      ...[...cssFiles("src/app"), ...cssFiles("src/components/inbox")].map(read),
    ].join("\n");
    const undeclared = [...used].filter(
      (name) =>
        !declaredIn.includes(`@container/${name}`) &&
        !new RegExp(`container-name:\\s*${name}\\b`).test(declaredIn),
    );
    expect(undeclared).toEqual([]);
  });

  it("the primary action word uses the thread pane's own container, declared on the pane that holds the header", () => {
    const header = read(DIR + "inbox-thread-header.tsx");
    const thread = read(DIR + "inbox-v3-thread.tsx");
    const css = read("src/app/workspace-system.css");
    // Tailwind 4.3 compiles `@min-[36rem]/inbox-thread:inline` to
    // `@container inbox-thread (width >= 36rem)` (checked with compile())
    expect(header).toMatch(/hidden @min-\[36rem\]\/inbox-thread:inline/);
    expect(css).toMatch(/\[data-inbox-thread\]\s*\{[^}]*container-name:\s*inbox-thread;[^}]*container-type:\s*inline-size/);
    const pane = thread.indexOf('data-inbox-thread="active"');
    expect(pane).toBeGreaterThan(0);
    expect(thread.indexOf("<InboxThreadHeader", pane)).toBeGreaterThan(pane);
    expect(thread.indexOf("<InboxThreadHeader", pane) - pane).toBeLessThan(300);
  });
});
