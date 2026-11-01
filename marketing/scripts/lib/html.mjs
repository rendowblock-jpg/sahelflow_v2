// Tiny HTML reader for the pages this site generates (no dependencies). Not a general HTML5 parser:
// it tokenizes tags, keeps raw text of script/style, and builds the facts the checks need.
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW = new Set(["script", "style"]);

export function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, "\u00a0").replace(/&amp;/g, "&");
}

export function parseAttrs(s) {
  const attrs = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (let m; (m = re.exec(s)); ) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return attrs;
}

/** Tokens: {t:"open"|"close"|"text", tag, attrs, text, pos, raw}. */
export function tokenize(html) {
  const toks = [];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
  let last = 0;
  for (let m; (m = re.exec(html)); ) {
    if (m.index > last) toks.push({ t: "text", text: html.slice(last, m.index), pos: last });
    last = re.lastIndex;
    if (m[1]) toks.push({ t: "close", tag: m[1].toLowerCase(), pos: m.index });
    else if (m[2]) {
      const tag = m[2].toLowerCase();
      const body = m[3] ?? "";
      const tok = { t: "open", tag, attrs: parseAttrs(body.replace(/\/$/, "")), pos: m.index, selfClosing: /\/$/.test(body) || VOID.has(tag) };
      if (RAW.has(tag)) {
        const end = html.toLowerCase().indexOf(`</${tag}`, last);
        const stop = end < 0 ? html.length : end;
        tok.text = html.slice(last, stop);
        toks.push(tok);
        last = stop;
        re.lastIndex = stop;
        continue;
      }
      toks.push(tok);
    }
  }
  if (last < html.length) toks.push({ t: "text", text: html.slice(last), pos: last });
  return toks;
}

/** Everything the checks read from one page. */
export function readPage(html) {
  const toks = tokenize(html);
  const page = {
    html, toks, title: null, meta: {}, links: [], headings: [], imgs: [], anchors: [], scripts: [], styles: [], ids: new Set(),
    tags: {}, htmlAttrs: {}, text: "", forms: [], controls: [], buttons: [], svgs: 0,
  };
  const skip = []; // inside script/style/title: not visible text
  let head = null; // open heading
  let btn = null; // open button/a with text collector
  const open = [];
  let inTitle = false;
  const visible = [];
  for (const k of toks) {
    if (k.t === "open") {
      page.tags[k.tag] = (page.tags[k.tag] ?? 0) + 1;
      if (k.attrs.id) page.ids.add(k.attrs.id);
      if (k.tag === "html") page.htmlAttrs = k.attrs;
      else if (k.tag === "title") inTitle = true;
      else if (k.tag === "meta") {
        const key = (k.attrs.name ?? k.attrs.property ?? k.attrs["http-equiv"] ?? "").toLowerCase();
        if (key) (page.meta[key] ??= []).push({ content: k.attrs.content ?? "", media: k.attrs.media });
        if (k.attrs.charset) (page.meta.charset ??= []).push({ content: k.attrs.charset });
      } else if (k.tag === "link") page.links.push(k.attrs);
      else if (k.tag === "script") page.scripts.push({ attrs: k.attrs, text: k.text ?? "" });
      else if (k.tag === "style") page.styles.push(k.text ?? "");
      else if (k.tag === "img") page.imgs.push(k.attrs);
      else if (k.tag === "form") page.forms.push(k.attrs);
      else if (k.tag === "svg") page.svgs++;
      if (/^h[1-6]$/.test(k.tag)) { head = { level: Number(k.tag[1]), text: "", pos: k.pos, attrs: k.attrs }; page.headings.push(head); }
      if (k.tag === "a") { btn = { href: k.attrs.href, attrs: k.attrs, text: "" }; page.anchors.push(btn); }
      if (k.tag === "button" || k.tag === "summary") { btn = { tag: k.tag, attrs: k.attrs, text: "", inner: [] }; page.buttons.push(btn); }
      if (["input", "select", "textarea"].includes(k.tag)) page.controls.push({ tag: k.tag, attrs: k.attrs, pos: k.pos });
      if (btn && k.tag === "img") btn.text += ` ${k.attrs.alt ?? ""}`;
      if (btn && k.tag === "svg" && k.attrs["aria-label"]) btn.text += ` ${k.attrs["aria-label"]}`;
      if (!k.selfClosing) open.push(k.tag);
    } else if (k.t === "close") {
      if (k.tag === "title") inTitle = false;
      if (/^h[1-6]$/.test(k.tag)) head = null;
      if (k.tag === "a" || k.tag === "button" || k.tag === "summary") btn = null;
      const i = open.lastIndexOf(k.tag);
      if (i >= 0) open.length = i;
    } else {
      const text = decode(k.text);
      if (inTitle) page.title = (page.title ?? "") + text;
      else {
        visible.push(text);
        if (head) head.text += text;
        if (btn) btn.text += text;
      }
    }
  }
  page.text = visible.join(" ").replace(/\s+/g, " ").trim();
  page.labels = [...html.matchAll(/<label\b([^>]*)>/gi)].map((m) => parseAttrs(m[1]));
  page.jsonLd = page.scripts.filter((s) => s.attrs.type === "application/ld+json");
  return page;
}

export const first = (page, key) => page.meta[key]?.[0]?.content;
export const linkRel = (page, rel) => page.links.filter((l) => (l.rel ?? "").split(/\s+/).includes(rel));
