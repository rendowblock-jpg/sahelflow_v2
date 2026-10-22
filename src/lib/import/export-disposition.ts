/**
 * Content-Disposition for a downloaded export file (RFC 6266, RFC 5987).
 *
 * A header value can only hold characters up to code point 255: the platform's
 * `Headers` throws a TypeError on anything above, and a route that builds its
 * response with such a name answers a generic 500 after the work is done. The
 * Arabic file names of the export routes (for example the word for "orders")
 * are exactly that, so a name that is not plain printable ASCII is sent twice:
 * an ASCII fallback in `filename` for old clients, and the real name in
 * `filename*` as UTF-8 percent-encoding, which browsers and WebView2 prefer.
 *
 * A plain ASCII name is sent exactly as before: `attachment; filename="name"`.
 */

/** Printable ASCII with no quote and no backslash: safe inside a quoted-string as it is. */
const PLAIN_QUOTED = /^[\x20\x21\x23-\x5B\x5D-\x7E]+$/;

/**
 * The ASCII fallback: trimmed first (so a blank fallback is empty, not a row of underscores), then everything that is not
 * safe is replaced by "_". Besides the quote and the backslash, the semicolon and the equals sign go too: they are harmless
 * inside a quoted-string by the RFC, but a sloppy parser could read `; filename*=` inside the fallback as a parameter.
 */
function asciiOnly(value: string): string {
  return value.trim().replace(/[^\x20\x21\x23-\x3A\x3C\x3E-\x5B\x5D-\x7E]/g, "_");
}

/**
 * RFC 5987 `attr-char` allows letters, digits and ``!#$&+-.^_`|~``. `encodeURIComponent`
 * also leaves `'()*` alone, which are not allowed in the extended value, so those four are
 * escaped by hand. Returns null for text that cannot be encoded (a lone surrogate).
 */
function encodeExtendedValue(value: string): string | null {
  try {
    return encodeURIComponent(value).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  } catch {
    return null;
  }
}

/**
 * @param fileName      the name the seller should see, in any script
 * @param asciiFallback a name made of ASCII letters, used by clients that ignore `filename*`
 */
export function attachmentContentDisposition(
  fileName: string,
  asciiFallback: string,
): string {
  if (PLAIN_QUOTED.test(fileName)) {
    return `attachment; filename="${fileName}"`;
  }
  const fallback = asciiOnly(asciiFallback) || "download";
  if (fileName === "") return `attachment; filename="${fallback}"`;
  const extended = encodeExtendedValue(fileName);
  if (extended === null) return `attachment; filename="${fallback}"`;
  return `attachment; filename="${fallback}"; filename*=UTF-8''${extended}`;
}
