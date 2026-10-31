// W5 SEC2 (W4SEC-08): a small reader for the phone app's source. It finds every ${...} inside a template literal that builds HTML
// and says which names that interpolation puts into the page WITHOUT going through an escaper. It is a contract check, not a parser:
// literals, comments and regexes are masked, calls to the approved escapers and HTML builders are removed, the condition of a
// ternary or && is ignored (only the branches are written into the page), and what is left is a list of names for the test to judge.
export type Interpolation = { line: number; expr: string; names: string[] };

type Tpl = { line: number; statics: string; exprs: { text: string; line: number }[] };

const REGEX_PREV = "(,=:[!&|?{};";
const KEYWORDS = new Set(["true", "false", "null", "undefined", "typeof", "void", "new", "in", "of", "this", "return", "async", "function", "as", "const", "string", "number", "boolean", "readonly"]);
const LIST_METHODS = new Set(["map", "join", "filter", "slice", "concat", "reverse", "length"]);

const lineOf = (src: string, i: number): number => { let n = 1; for (let k = 0; k < i; k += 1) if (src.charCodeAt(k) === 10) n += 1; return n; };

function skipRegex(src: string, start: number): number {
  let i = start + 1; let inClass = false;
  while (i < src.length) {
    const c = src[i] as string;
    if (c === "\\") { i += 2; continue; }
    if (c === "[") inClass = true; else if (c === "]") inClass = false; else if (c === "/" && !inClass) { i += 1; break; }
    i += 1;
  }
  while (i < src.length && /[a-z]/.test(src[i] as string)) i += 1;
  return i;
}

/** Every template literal of the source with the text of each ${...} (nested templates are listed on their own). */
export function templates(src: string): Tpl[] {
  const out: Tpl[] = [];
  const template = (start: number): number => {
    let i = start + 1; let statics = ""; const exprs: Tpl["exprs"] = [];
    while (i < src.length && src[i] !== "`") {
      if (src[i] === "\\") { statics += src[i + 1] ?? ""; i += 2; continue; }
      if (src[i] === "$" && src[i + 1] === "{") {
        const s = i + 2; const e = scan(s, true);
        exprs.push({ text: src.slice(s, e - 1), line: lineOf(src, s) }); statics += "\u0000"; i = e; continue;
      }
      statics += src[i]; i += 1;
    }
    out.push({ line: lineOf(src, start), statics, exprs });
    return i + 1;
  };
  const scan = (start: number, inBrace: boolean): number => {
    let i = start; let depth = 0; let prev = "";
    while (i < src.length) {
      const c = src[i] as string; const n = src[i + 1];
      if (c === "/" && n === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
      if (c === "/" && n === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (c === "'" || c === '"') { i += 1; while (i < src.length && src[i] !== c) { if (src[i] === "\\") i += 1; i += 1; } i += 1; prev = "s"; continue; }
      if (c === "`") { i = template(i); prev = "s"; continue; }
      if (c === "/" && (prev === "" || REGEX_PREV.includes(prev))) { i = skipRegex(src, i); prev = "s"; continue; }
      if (inBrace) { if (c === "{") depth += 1; else if (c === "}") { if (depth === 0) return i + 1; depth -= 1; } }
      if (!/\s/.test(c)) prev = c;
      i += 1;
    }
    return i;
  };
  scan(0, false);
  return out;
}

function skipTemplate(code: string, start: number): number {
  let i = start + 1;
  while (i < code.length && code[i] !== "`") {
    if (code[i] === "\\") { i += 2; continue; }
    if (code[i] === "$" && code[i + 1] === "{") { i = skipBraces(code, i + 2); continue; }
    i += 1;
  }
  return i + 1;
}
function skipBraces(code: string, start: number): number {
  let i = start; let depth = 0;
  while (i < code.length) {
    const c = code[i] as string;
    if (c === "`") { i = skipTemplate(code, i); continue; }
    if (c === "'" || c === '"') { i += 1; while (i < code.length && code[i] !== c) { if (code[i] === "\\") i += 1; i += 1; } i += 1; continue; }
    if (c === "{") depth += 1; else if (c === "}") { if (depth === 0) return i + 1; depth -= 1; }
    i += 1;
  }
  return i;
}

/** The code of an interpolation with strings, comments and regexes replaced by "" and every template by T. */
function mask(code: string): string {
  let out = ""; let i = 0;
  while (i < code.length) {
    const c = code[i] as string; const n = code[i + 1];
    if (c === "/" && n === "/") { while (i < code.length && code[i] !== "\n") i += 1; continue; }
    if (c === "/" && n === "*") { const e = code.indexOf("*/", i + 2); i = e < 0 ? code.length : e + 2; continue; }
    if (c === "'" || c === '"') { i += 1; while (i < code.length && code[i] !== c) { if (code[i] === "\\") i += 1; i += 1; } i += 1; out += '""'; continue; }
    if (c === "`") { i = skipTemplate(code, i); out += "T"; continue; }
    if (c === "/" && /[(,=:[!&|?{};]\s*$/.test(out)) { i = skipRegex(code, i); out += '""'; continue; }
    out += c; i += 1;
  }
  return out;
}

function matchParen(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") depth += 1; else if (c === ")" || c === "]" || c === "}") { depth -= 1; if (depth === 0) return i; }
  }
  return code.length - 1;
}

function removeCalls(code: string, names: ReadonlySet<string>): string {
  const re = /(^|[^\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/g;
  let out = code; let m: RegExpExecArray | null;
  for (;;) {
    re.lastIndex = 0; let hit: RegExpExecArray | null = null;
    while ((m = re.exec(out)) !== null) { if (names.has(m[2] as string)) { hit = m; break; } }
    if (!hit) return out;
    const nameStart = hit.index + (hit[1] as string).length; const open = out.indexOf("(", nameStart);
    out = `${out.slice(0, nameStart)}X${out.slice(matchParen(out, open) + 1)}`;
  }
}

/** Only what a ternary or && can write into the page: its branches, not its condition. */
function emitted(code: string): string {
  let depth = 0; let q = -1; let colon = -1; let nest = 0;
  for (let i = 0; i < code.length; i += 1) {
    const c = code[i] as string;
    if (c === "(" || c === "[" || c === "{") depth += 1; else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (depth === 0 && c === "?" && code[i + 1] !== "." && code[i + 1] !== "?" && code[i - 1] !== "?") { if (q < 0) q = i; else nest += 1; }
    else if (depth === 0 && c === ":" && q >= 0) { if (nest === 0) { colon = i; break; } nest -= 1; }
  }
  if (q >= 0 && colon > q) return `${emitted(code.slice(q + 1, colon))} ${emitted(code.slice(colon + 1))}`;
  depth = 0; let last = -1;
  for (let i = 0; i < code.length - 1; i += 1) {
    const c = code[i] as string;
    if (c === "(" || c === "[" || c === "{") depth += 1; else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (depth === 0 && c === "&" && code[i + 1] === "&") { last = i + 2; i += 1; }
  }
  const tail = last >= 0 ? code.slice(last) : code;
  // A comparison is a boolean: it writes "true" or "false", never data.
  depth = 0;
  for (let i = 0; i < tail.length - 1; i += 1) {
    const c = tail[i] as string;
    if (c === "(" || c === "[" || c === "{") depth += 1; else if (c === ")" || c === "]" || c === "}") depth -= 1;
    else if (depth === 0 && /^(===|!==|==|!=|<=|>=)/.test(tail.slice(i, i + 3))) return "";
  }
  return tail;
}

/** The names an interpolation writes into the page unescaped. `safeCalls` = escapers and HTML builders (their own source is scanned too). */
export function freeNames(expr: string, safeCalls: ReadonlySet<string>, transparent: ReadonlySet<string> = new Set()): string[] {
  const bound = new Set<string>();
  let masked = mask(expr);
  // A function value: its parameters are bound and only its body is read.
  const head = /^\s*(?:async\s*)?(\([^()]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+?)?=>/.exec(masked);
  if (head) { for (const p of (head[1] as string).replace(/[()]/g, "").split(",")) { const id = /^\s*([A-Za-z_$][\w$]*)/.exec(p); if (id) bound.add(id[1] as string); } masked = masked.slice(head[0].length); }
  // Grouping parentheses (not calls): only what their ternary / && can write is read.
  let reduced = removeCalls(masked, safeCalls);
  let pos = 0;
  for (let guard = 0; guard < 80; guard += 1) {
    const re = /([^\w$)\]]|^)\(([^()]*)\)|([\w$\]])\(([^()]*)\)/g; re.lastIndex = pos;
    const g = re.exec(reduced);
    if (!g) break;
    const end = g.index + g[0].length;
    // The parameter list of an arrow function is not a grouping.
    if (/^\s*(?::[^=]+?)?=>/.test(reduced.slice(end))) { pos = end; continue; }
    if (g[2] !== undefined) {
      reduced = `${reduced.slice(0, g.index)}${g[1]}[${emitted(g[2])}]${reduced.slice(end)}`;
      pos = g.index;
    } else {
      // A call: each argument writes only what its own ternary / && can write. The brackets become \u0001 \u0002 so that the call is not read twice.
      const args: string[] = []; let d = 0; let cur = "";
      for (const ch of g[4] as string) {
        if ("[{\u0001".includes(ch)) d += 1; else if ("]}\u0002".includes(ch)) d -= 1;
        if (ch === "," && d === 0) { args.push(cur); cur = ""; } else cur += ch;
      }
      args.push(cur);
      reduced = `${reduced.slice(0, g.index)}${g[3]}\u0001${args.map((a) => emitted(a)).join(",")}\u0002${reduced.slice(end)}`;
      pos = g.index;
    }
  }
  reduced = reduced.replace(/\u0001/g, "(").replace(/\u0002/g, ")");
  const code = emitted(reduced);
  for (const m of code.matchAll(/\(([^()]*)\)\s*(?::\s*[\w<>\[\]|"' ]+)?\s*=>/g)) for (const p of (m[1] as string).split(",")) { const id = /^\s*([A-Za-z_$][\w$]*)/.exec(p); if (id) bound.add(id[1] as string); }
  for (const m of code.matchAll(/(?:^|[^\w$)])([A-Za-z_$][\w$]*)\s*=>/g)) bound.add(m[1] as string);
  const found = new Set<string>();
  for (const m of code.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)(\s*\()?/g)) {
    const parts = (m[2] as string).split(/\??\./);
    while (parts.length > 1 && LIST_METHODS.has(parts[parts.length - 1] as string)) parts.pop();
    const head = parts[0] as string;
    if (KEYWORDS.has(head) || bound.has(head) || head === "T" || head === "X") continue;
    if (m[3] !== undefined && parts.length === 1 && transparent.has(head)) continue;
    // `list.map((r) => <template or safe call>)` writes only what the callback builds, never the list itself.
    const path = (m[2] as string);
    const after = code.slice((m.index ?? 0) + (m[0] as string).length - (m[3] ?? "").length);
    if (/\.map$/.test(path) && /^\s*\(\s*\(?[\w$,\s]*\)?\s*=>\s*[TX]\b/.test(after)) continue;
    found.add(parts.join("."));
  }
  return [...found];
}

/** Every interpolation of every template that builds HTML (its fixed text holds a tag). */
export function htmlInterpolations(src: string, safeCalls: ReadonlySet<string>, transparent: ReadonlySet<string> = new Set()): Interpolation[] {
  const out: Interpolation[] = [];
  for (const t of templates(src)) {
    if (!/<\/?[a-zA-Z]/.test(t.statics)) continue;
    for (const e of t.exprs) out.push({ line: e.line, expr: e.text.trim().slice(0, 120), names: freeNames(e.text, safeCalls, transparent) });
  }
  return out;
}

/** The text of `const|let name = ...` up to its `;`, one entry per declaration in the file. */
export function initializers(src: string, name: string, beforeLine = Number.MAX_SAFE_INTEGER): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b(?:const|let)\\s+${name.replace(/\$/g, "\\$")}\\b[^=\\n;]*=(?!=)\\s*`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    out.length = lineOf(src, m.index) <= beforeLine ? 0 : out.length; // keep only the nearest declaration above the use
    const rest = mask(src.slice(m.index + m[0].length)); let depth = 0; let end = rest.length;
    for (let i = 0; i < rest.length; i += 1) {
      const c = rest[i] as string;
      if (c === "(" || c === "[" || c === "{") depth += 1; else if (c === ")" || c === "]" || c === "}") { depth -= 1; if (depth < 0) { end = i; break; } } else if (c === ";" && depth === 0) { end = i; break; }
    }
    if (lineOf(src, m.index) <= beforeLine) out.push(rest.slice(0, end));
  }
  return out;
}

// ---- The contract -------------------------------------------------------------------------------------------------------------
// Calls whose RESULT is safe to write into HTML and whose arguments are not read: the escapers, number formatters, and the builders
// that take DATA and return HTML (each of them is defined in the scanned folders, so its own templates are checked by this test too).
export const ESCAPERS = ["esc", "numText", "tr", "formatNumber", "Math.round", "Math.max", "Math.min", "Math.trunc"];
export const DATA_BUILDERS = ["fact", "dial", "html", "windowNote", "renderChip", "renderSkeleton", "renderFreshness", "renderOrderCommand", "renderRow", "renderBubble", "commandRow", "renderError", "renderEmpty", "renderComposer", "renderStateStrip", "withShellStrip", "renderApp", "pair", "today", "welcome", "settings", "bars", "renderReplyCommand", "renderConfirmSheet"];
// Helpers that wrap HTML they are given: the helper is accepted but its ARGUMENTS are read like any other interpolation.
export const HTML_HELPERS = ["btn", "chip", "note", "wrap", "seg", "button", "skeleton", "fig", "shell", "section"];
// Names that are safe in any file BY CONSTRUCTION.
export const GLOBAL_ALLOW: Readonly<Record<string, string>> = {
  NOTE_MAX: "numeric constant", REPLY_MAX: "numeric constant",
};
// Names that are safe in ONE file, each with the reason. Everything else must be a `const` in the same file whose initializer is itself safe.
export const ALLOW: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "views/view.ts": {
    "v.installed": "boolean in the condition of a ternary inside button(); the argument can only be \"ghost\" or \"primary\"",
    "v.canInstall": "boolean in the same ternary condition inside button()", "v.ios": "boolean in the same ternary condition inside button()",
    "p.whatsappHeld": "condition of a ternary; the value itself is written through formatNumber()",
    tid: "tab id from the fixed TabId lists (today, orders, inbox, settings, welcome)",
  },
  "views/install/screen.ts": { s: "installState() answers one of four fixed words (ios, android, inapp, unsupported)" },
  "views/orders/list.ts": {
    f: "filter id from the fixed FILTERS list",
    extra: "a number: Math.max(...) plus a counter guarded by typeof number and Number.isFinite",
  },
  "views/inbox/reply.ts": { "r.state": "OutboxRecord.state: a fixed state word of the command outbox, never customer text" },
  "kit/confirm-sheet.ts": { k: "reason key from the fixed REJECT_REASON_KEYS list" },
  "kit/state-strip.ts": { "i.state": "StripState union: pcoff, fresh or stale" },
  "kit/composer.ts": { "i.mode": "union \"reply\" | \"note\"" },
  "kit/empty-block.ts": { "i.action": "caller-supplied HTML: the callers pass a button built with esc() (kit contract)" },
  "kit/command-chip.ts": { "record.state": "OutboxRecord.state: a fixed state word of the command outbox, never customer text" },
};

const REMOVE = new Set([...ESCAPERS, ...DATA_BUILDERS]);
const TRANSPARENT = new Set(HTML_HELPERS);

export function contractViolations(file: string, src: string): string[] {
  const bad: string[] = [];
  // A parameter of an HTML helper is safe because every call site of the helper is read by this test (its arguments are not removed).
  const params = new Set<string>();
  for (const h of HTML_HELPERS) {
    for (const m of src.matchAll(new RegExp(`(?:const|function)\\s+${h}\\b[^=(]*(?:=\\s*)?(?:async\\s*)?\\(((?:[^()]|\\([^()]*\\))*)\\)`, "g"))) {
      for (const p of (m[1] as string).split(",")) { const id = /^\s*([A-Za-z_$][\w$]*)/.exec(p); if (id) params.add(id[1] as string); }
    }
  }
  const accepted = (name: string, depth: number, line: number): boolean => {
    if (GLOBAL_ALLOW[name] !== undefined || ALLOW[file]?.[name] !== undefined || params.has(name)) return true;
    if (name.includes(".") || depth > 6) return false;
    const inits = initializers(src, name, line);
    return inits.length > 0 && inits.every((init) => freeNames(init, REMOVE, TRANSPARENT).every((n) => accepted(n, depth + 1, line)));
  };
  for (const h of htmlInterpolations(src, REMOVE, TRANSPARENT)) {
    for (const n of h.names) if (!accepted(n, 0, h.line)) bad.push(`${file}:${h.line} writes "${n}" into HTML without esc(): \${${h.expr}}`);
  }
  src.split("\n").forEach((line, i) => {
    if (/["'][^"'`]*<\/?[a-zA-Z][^"'`]*["']\s*\+|\+\s*["'][^"'`]*<\/?[a-zA-Z]/.test(line)) bad.push(`${file}:${i + 1} builds HTML with "+" (use one template literal so the check can read it)`);
  });
  return bad;
}
