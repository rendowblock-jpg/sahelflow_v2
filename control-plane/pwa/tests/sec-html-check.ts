// W3b SEC: a strict reader for the HTML the phone draws (no DOM in the node test environment).
// Every "<" must open a KNOWN tag with KNOWN attributes (no on*, no style, no src), every attribute value must be free of < > ",
// a link may only be tel:, and a bidi override must sit inside an isolating element.
const TAGS = new Set(["section", "main", "h1", "h2", "h3", "p", "ul", "ol", "li", "button", "span", "div", "bdi", "strong", "dl", "dt", "dd", "a", "time", "form", "label", "textarea", "i", "progress", "figure", "figcaption", "em", "small", "header", "nav"]);
// "dir" = any element with a dir attribute (the browser isolates it). The element that DIRECTLY holds the override must isolate it: a span/strong/time lets it run on into the text after it.
const ISOLATING = new Set(["bdi", "dir", "p", "h1", "h2", "h3", "textarea", "dd", "dt"]);
const ATTR_OK = /^(class|id|role|dir|type|for|name|rows|maxlength|href|disabled|max|value|hidden|lang|datetime|aria-[a-z]+|data-[a-z-]+)$/;
const TAG_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-\w:.]*(?:="[^"<>]*")?)*)\s*>/;
const ATTR_RE = /\s+([a-zA-Z_:][-\w:.]*)(?:="([^"<>]*)")?/g;
const BIDI = /[\u202A-\u202E]/;

export function violations(html: string): string[] {
  const bad: string[] = []; const stack: string[] = []; let i = 0; let text = "";
  const flush = (): void => {
    if (BIDI.test(text) && !ISOLATING.has(stack[stack.length - 1] ?? "")) bad.push(`bidi override outside an isolating element: ${JSON.stringify(text.slice(0, 40))}`);
    if (text.includes(">")) bad.push(`raw angle bracket in text: ${JSON.stringify(text.slice(0, 40))}`);
    text = "";
  };
  while (i < html.length) {
    const c = html[i] as string;
    if (c !== "<") { text += c; i += 1; continue; }
    flush();
    const m = TAG_RE.exec(html.slice(i, i + 4000));
    if (!m) { bad.push(`raw "<" that opens no known tag at ${i}: ${JSON.stringify(html.slice(i, i + 40))}`); i += 1; continue; }
    const name = (m[2] as string).toLowerCase(); const closing = m[1] === "/";
    if (!TAGS.has(name)) bad.push(`tag not in the allowlist: <${name}>`);
    if (closing) { stack.pop(); } else {
      for (const a of (m[3] as string).matchAll(ATTR_RE)) {
        const an = (a[1] as string).toLowerCase(); const av = a[2] ?? "";
        if (!ATTR_OK.test(an)) bad.push(`attribute not in the allowlist: ${an}`);
        if (an === "href" && !/^tel:[+\d]*$/.test(av)) bad.push(`href is not tel:digits: ${av.slice(0, 40)}`);
      }
      stack.push(/\sdir="/.test(m[3] as string) ? "dir" : name);
    }
    i += m[0].length;
  }
  flush();
  return bad;
}
