/**
 * Opens an address in the seller's own browser. The desktop shell hands a new unlinked window to the system browser
 * (the same call the delivery pages use), so the sign-in page never loads inside the app window.
 * Only https addresses of the listed hosts are opened, never one with a login in it.
 */
export function openInSystemBrowser(rawUrl: string, allowedHosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.includes(url.hostname)) return false;
  window.open(url.href, "_blank", "noopener,noreferrer");
  return true;
}
