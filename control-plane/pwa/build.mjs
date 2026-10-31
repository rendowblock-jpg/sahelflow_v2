// node control-plane/pwa/build.mjs -> control-plane/pwa/dist
// esbuild only (already a dependency). Hash-named assets, an asset manifest, strict _headers.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_VERSION = "0.1.0";
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const COMMON = { bundle: true, minify: true, write: false, legalComments: "none", logLevel: "silent", target: ["es2020", "chrome90", "safari15"] };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self' https://connect.sahelflow.com; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'";

export async function buildPwa({ outDir = join(HERE, "dist"), relayUrl = "https://connect.sahelflow.com" } = {}) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, "assets"), { recursive: true });
  await mkdir(join(outDir, "icons"), { recursive: true });
  await mkdir(join(outDir, "licenses"), { recursive: true });
  const assets = {};
  const emit = async (name, ext, content) => {
    const file = `${name}.${sha(content).slice(0, 8)}.${ext}`;
    await writeFile(join(outDir, "assets", file), content);
    return `/assets/${file}`;
  };
  const js = async (entry, extra) => (await build({ entryPoints: [join(HERE, entry)], ...COMMON, ...extra })).outputFiles[0].contents;

  for (const f of (await readdir(join(HERE, "static/fonts"))).filter((x) => x.endsWith(".woff2"))) {
    const name = f.replace(".woff2", "");
    assets[name] = await emit(name, "woff2", await readFile(join(HERE, "static/fonts", f)));
  }
  await writeFile(join(outDir, "licenses/fonts-OFL.txt"), await readFile(join(HERE, "static/fonts/LICENSE.txt")));
  for (const f of (await readdir(join(HERE, "static/icons"))).filter((x) => x.endsWith(".png"))) {
    await writeFile(join(outDir, "icons", f), await readFile(join(HERE, "static/icons", f)));
  }

  let css = await readFile(join(HERE, "src/styles/app.css"), "utf8");
  css = css.replace(/__FONT:([\w-]+)__/g, (_m, n) => assets[n] ?? (() => { throw new Error(`font ${n} missing`); })());
  let bars = "";
  for (let i = 0; i <= 20; i += 1) bars += `.b${i}::before{height:${i * 6}px}\n`;
  assets.css = await emit("app", "css", Buffer.from((await transform(css + bars, { loader: "css", minify: true, target: ["chrome90", "safari15"] })).code));
  assets.worker = await emit("keygen.worker", "js", await js("src/pair/keygen.worker.ts", { format: "iife" }));
  assets.boot = await emit("boot", "js", await js("src/boot.ts", { format: "iife" }));
  assets.app = await emit("app", "js", await js("src/main.ts", {
    format: "esm",
    define: { __KEYGEN_WORKER_URL__: JSON.stringify(assets.worker), __RELAY_URL__: JSON.stringify(relayUrl), __APP_VERSION__: JSON.stringify(APP_VERSION) },
  }));

  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#F3EEE4" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#14161A" media="(prefers-color-scheme: dark)"><meta name="referrer" content="no-referrer"><title>SahelFlow</title><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icons/icon-192.png"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"><link rel="stylesheet" href="${assets.css}">`;
  await writeFile(join(outDir, "index.html"), `<!doctype html><html lang="ar" dir="rtl"><head>${head}<script src="${assets.boot}"></script></head><body><div id="app"></div><script type="module" src="${assets.app}"></script></body></html>`);
  await writeFile(join(outDir, "offline.html"), `<!doctype html><html lang="ar" dir="rtl"><head>${head}<script src="${assets.boot}"></script></head><body><div id="app"><main><h1>SahelFlow</h1><div class="note"><p lang="ar">لا يوجد اتصال، والتطبيق غير محفوظ بعد على هذا الهاتف. اتصل بالإنترنت مرة واحدة ثم أعد المحاولة.</p><p lang="fr" dir="ltr">Pas de connexion et l'application n'est pas encore enregistrée sur ce téléphone. Connectez-vous une fois, puis réessayez.</p><p lang="en" dir="ltr">No connection, and the app is not saved on this phone yet. Connect once, then try again.</p></div><a class="btn btn-primary" href="/">SahelFlow</a></main></div></body></html>`);

  const manifest = {
    id: "/", name: "SahelFlow", short_name: "SahelFlow", description: "SahelFlow companion for the shop owner", lang: "ar", dir: "rtl",
    start_url: "/", scope: "/", display: "standalone", display_override: ["standalone", "minimal-ui"], orientation: "portrait",
    theme_color: "#F3EEE4", background_color: "#F3EEE4", categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  await writeFile(join(outDir, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

  const precache = ["/", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png", ...Object.values(assets)];
  const version = sha(JSON.stringify(precache)).slice(0, 10);
  await writeFile(join(outDir, "sw.js"), await js("src/sw/sw.ts", { format: "iife", define: { __PRECACHE__: JSON.stringify(precache), __VERSION__: JSON.stringify(version) } }));
  await writeFile(join(outDir, "asset-manifest.json"), JSON.stringify({ version, assets, precache }, null, 2));
  await writeFile(join(outDir, "_headers"), `/*\n  Content-Security-Policy: ${CSP}\n  Referrer-Policy: no-referrer\n  X-Content-Type-Options: nosniff\n  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/offline.html\n  Cache-Control: no-cache\n/manifest.webmanifest\n  Cache-Control: no-cache\n`);
  return { outDir, version, precache, assets };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPwa().then((r) => console.log(`pwa built: ${r.outDir} version ${r.version}, ${r.precache.length} precached files`)).catch((e) => { console.error(e); process.exit(1); });
}
