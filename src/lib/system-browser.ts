/**
 * Opens an address in the seller's own browser.
 *
 * The desktop shell sends a link to the system browser only when a real `<a href target="_blank">` is clicked
 * (tauri-plugin-shell listens for that click on <body>; it does NOT see `window.open`). So this puts one such
 * link in the page, clicks it and removes it. In a normal browser the same click opens a new tab.
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
  const link = document.createElement("a");
  link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
  return true;
}
