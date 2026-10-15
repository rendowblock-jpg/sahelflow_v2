// sahelflow.com edge entry (Cloudflare Workers with static assets).
// Everything is a static file except /get/windows, which always points at the
// newest signed installer named by the updater manifest, so the website never
// needs a redeploy when a release ships.
const MANIFEST = "https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest/download/latest.json";
const RELEASES = "https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/get/windows" || url.pathname === "/get/windows/") {
      try {
        const response = await fetch(MANIFEST, { cf: { cacheTtl: 300, cacheEverything: true } });
        if (response.ok) {
          const manifest = await response.json();
          const platforms = manifest?.platforms ?? {};
          const installer =
            [platforms["windows-x86_64"]?.url].find(
              (candidate) =>
                typeof candidate === "string" &&
                /^https:\/\/github\.com\/rendowblock-jpg\/sahelflow_v2\/releases\/download\/[^?#]+\.exe$/.test(candidate),
            ) ??
            [platforms["windows-x86_64"]?.url, platforms["windows-x86_64-msi"]?.url].find(
              (candidate) =>
                typeof candidate === "string" &&
                /^https:\/\/github\.com\/rendowblock-jpg\/sahelflow_v2\/releases\/download\/[^?#]+\.msi$/.test(candidate),
            );
          if (typeof installer === "string") {
            return Response.redirect(installer, 302);
          }
        }
      } catch {
        // Fall through to the releases page.
      }
      return Response.redirect(RELEASES, 302);
    }
    return env.ASSETS.fetch(request);
  },
};
