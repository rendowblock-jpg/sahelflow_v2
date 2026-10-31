// The desktop POSTs to an address a phone gave it. Only the known push
// services may ever be reached; everything else is refused before any request.

export const MAX_ENDPOINT_LENGTH = 2048;

const EXACT_HOSTS: ReadonlySet<string> = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
  "push.apple.com",
]);
// The leading dot matters: "evilfcm.googleapis.com" must not pass.
const SUFFIXES: readonly string[] = [".fcm.googleapis.com", ".notify.windows.com"];

export type PushEndpointErrorCode =
  | "not_string"
  | "too_long"
  | "bad_chars"
  | "bad_url"
  | "not_https"
  | "credentials"
  | "port"
  | "fragment"
  | "bad_host"
  | "trailing_dot"
  | "ip_literal"
  | "punycode"
  | "host_not_allowed";

// The message is the code only: an address never ends up in an error or a log.
export class PushEndpointError extends Error {
  readonly code: PushEndpointErrorCode;

  constructor(code: PushEndpointErrorCode) {
    super("Push endpoint refused: " + code);
    this.name = "PushEndpointError";
    this.code = code;
  }
}

/** Returns the parsed URL, or throws PushEndpointError. */
export function assertPushEndpoint(raw: string): URL {
  if (typeof raw !== "string") throw new PushEndpointError("not_string");
  if (raw.length > MAX_ENDPOINT_LENGTH) throw new PushEndpointError("too_long");
  // Printable ASCII only: the URL parser would quietly rewrite spaces,
  // backslashes and look-alike letters, and could turn them into an allowed host.
  if (/[^\x21-\x7e]/.test(raw) || raw.includes("\\")) throw new PushEndpointError("bad_chars");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PushEndpointError("bad_url");
  }
  if (url.protocol !== "https:") throw new PushEndpointError("not_https");
  if (url.username !== "" || url.password !== "") throw new PushEndpointError("credentials");
  // The parser drops an explicit :443, so any port left is a different one.
  if (url.port !== "") throw new PushEndpointError("port");
  if (raw.includes("#")) throw new PushEndpointError("fragment");
  const authority = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]*)/.exec(raw)?.[1] ?? "";
  if (authority.includes("%")) throw new PushEndpointError("bad_host");

  const host = url.hostname;
  if (host.endsWith(".")) throw new PushEndpointError("trailing_dot");
  if (host.startsWith("[") || /^[0-9.]+$/.test(host)) throw new PushEndpointError("ip_literal");
  if (host.split(".").some((label) => label.startsWith("xn--"))) throw new PushEndpointError("punycode");
  if (!EXACT_HOSTS.has(host) && !SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new PushEndpointError("host_not_allowed");
  }
  return url;
}

export function isAllowedPushEndpoint(raw: string): boolean {
  try {
    assertPushEndpoint(raw);
    return true;
  } catch {
    return false;
  }
}
