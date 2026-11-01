# sahelflow.com

Static marketing site for SahelFlow, in the Carnet look (ruled paper, ink, red margin, stamps).
Arabic by default, with French and English. 24 pages per language: home, platform overview,
nine module pages, four solution pages, integrations, pricing, the comparison page, security,
download, help centre, contact and the two legal pages.

- Copy: `src/i18n/{ar,fr,en}.mjs` (one file per language, identical shape), `src/i18n/home.mjs`
  (the home), `src/i18n/sheets.mjs` (small headings of the inner pages) and `src/legal.mjs`.
- What the site may say: `src/claims.mjs`. Each integration and promise has a status
  (live, testing, planned); `installerIsSigned()` switches the SmartScreen note on the download page.
- Product facts the site promises (shops, team size, years of updates, extra shop price):
  `src/model.mjs`. `tests/marketing-site.test.ts` pins them to `src/lib/license/packages.ts`.
- Business settings (WhatsApp number, email, prices, trial length): `src/config.mjs`.
- Behaviour: `src/site.js` (theme toggle, reveals, calculators). Every page works without it.
- Screenshots: `static/img/screens/<screen>-<locale>.webp` are the 1600 px originals; the pages
  use the 480 / 800 / 1200 px copies made by `node marketing/scripts/make-screens.mjs`
  (the build leaves the originals out of `dist`).
- Build: `node marketing/build.mjs` writes `marketing/dist`.
- Hosting: Cloudflare Workers static assets (`wrangler.toml`, `worker.js`). `/get/windows`
  always redirects to the newest installer from the updater manifest. The CSP in
  `static/_headers` carries the hash of each inline script; `tests/marketing-carnet.test.ts`
  recomputes them.

## File layout (as built)

- `build.mjs` writes `dist/` (72 pages: 3 languages x 24 pages, plus 404, sitemap, `_headers`, `_redirects`). `worker.js` and `wrangler.toml` are the Cloudflare side; `static/` is copied as is (images, favicon, fonts).
- `src/layout.mjs`: head, header with a no-JS menu, footer. `src/pages.mjs`: home, pricing, download, security and the why page (one story: a ledger you own against a monthly online subscription). `src/inner.mjs`: product, the nine module pages from one template, solutions, integrations, help, contact, legal, 404. `src/scenes.mjs` (product diagrams). `src/ui.mjs`: helpers (`screenImg`, `button`, `statusBadge`, `faqList`). `src/icons.mjs`, `src/algeria.mjs` (wilayas), `src/model.mjs` (modules, solutions, integrations, help topics), `src/config.mjs`, `src/claims.mjs`, `src/legal.mjs`.
- `src/site.js`: the only script of the site (no framework; its gzipped size is limited in `budget.json`).
- Styles, concatenated in file-name order into `/assets/site.css`:
  - `src/styles/01-base.css`: sahelflow.com: CARNET. The shop ledger that grew up: cream page, 1 px ruled lines, a red double margin on the inline-start side (the reading-start side), ink UI. Logical properties only, so Arabic RTL and fr/en LTR share every rule.
  - `src/styles/02-chrome.css`: Header, phone menu, footer.
  - `src/styles/03-home.css`: Home: one ruled page with the red double margin on the inline-start side.
  - `src/styles/04-scenes.css`: 
  - `src/styles/05-pages.css`: 
  - `src/styles/06-sheets.css`: Inner pages as ruled sheets: ink rules, the red margin only on what needs care, status as stamps.
  - `src/styles/07-motion.css`: All motion of the inner pages. Nothing here runs unless the visitor has not asked for less motion.
  - `src/styles/08-inner.css`: Inner pages as ruled sheets: product, modules, solutions, integrations, help, contact, legal.
- Scripts (all need the site served first, see Checks):
  - `scripts/heights.mjs`: Phone (360x732) heights of the inner pages; writes the worst case per class into marketing/budget.json (pageHeightPx).
  - `scripts/make-screens.mjs`: One-off: makes the 480 / 800 / 1200 px webp copies of every product screenshot (sharp is already in the repo).
  - `scripts/measure.mjs`: Measures the built site in a real browser: contrast failures, tap targets, text cut off,
  - `scripts/prune-css.mjs`: Drops rules from the legacy style files (04, 05) whose classes appear on no built page and in no script.
- `budget.json`: the limits the tests read (home phone height, home weight, first-load JS, CSS size, and `pageHeightPx` per page class at 360x732) with the numbers measured by `scripts/heights.mjs`.

## Checks
Three scripts, all without dependencies beyond node (the browser one needs Playwright, found through `wt-rel47`), none touches the network.
Each prints PASS or FAIL per check with the page and the reason, and exits with code 1 when anything fails.

| command | what it protects |
|---|---|
| `node marketing/scripts/site-check.mjs [dist]` | the built files: one h1, lang/dir per locale, title 30-65 and description 70-160 characters (both unique), canonical, hreflang en/fr/ar + x-default reciprocal, Open Graph + Twitter card + og:image file (1200x630), JSON-LD (Organization + WebSite on home, BreadcrumbList inside, FAQPage only where the FAQ is visible), sitemap (every page once, alternates, nothing 404/redirected/noindex), robots, noindex 404, wrangler 404 handling, skip link, landmarks, heading order, img alt + width/height, labels, **no external URL** (own domains and `ALLOWED_OUTBOUND` in `src/config.mjs` only), every internal link/src/srcset resolves, `_redirects` targets, **CSP**: every inline script and speculation-rules block has its sha256 in script-src, no stale hash, no unsafe-inline/eval, object-src none, frame-ancestors none, security headers (nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS), cache headers (1 year immutable for css/js/fonts/images, none for html), budgets from `budget.json`, fonts (woff2, swap, no unused face, two preloads), dead CSS list. Without an argument it builds into a temp folder. `--all` prints every problem, `--only=id,id` runs some. |
| `node marketing/scripts/site-browser-check.mjs [baseUrl]` | what a visitor gets in Chromium: home, product, pricing, download, help x en/fr/ar x 360/768/1440 x dark/light on a 4x slower CPU: h1 at most 2 lines, no sideways scroll, 0 console errors (this is where a CSP violation shows), 0 failed or foreign requests, no broken image, no text under 13 px, tap targets of 44 px (phone: header, hero, footer), names for buttons/links/fields, contrast AA of the first screen, CLS < 0.02, LCP < 2 s; plus reduced-motion and scripts-off runs that must show all content, the 404 status and `/get/windows`. Without a URL it builds and serves the site with the real `_headers` (`scripts/serve-dist.mjs`). Takes the browser lock `/tmp/eyes.lock` itself. About 2 minutes; `--quick` about 20 s. |
| `node marketing/scripts/site-check-selftest.mjs` | the checks themselves: breaks a copy of the build in 35 ways (alt removed, second h1, external script, changed hash, ...) and fails if one of them goes unnoticed. |

`scripts/measure.mjs` only reports numbers (contrast, taps, weights, LCP, CLS per page); the gates are the two scripts above.
After a change to an inline script (`HEAD_SCRIPT`, the speculation rules, the root redirect page) run `node marketing/build.mjs --sync-headers`: the build always writes the right hashes into `dist/_headers`, and this command copies them into `static/_headers`, which `tests/marketing-carnet.test.ts` reads.

Caching: `build.mjs` appends `?v=<content hash>` to every `/assets`, `/fonts` and `/img` URL it writes, so `static/_headers` can serve them for a year as `immutable`; pages are revalidated on every visit. Never reference a font or picture without going through the build.

Other checks:
- `flock /tmp/vt.lock sf vt <worktree> tests/marketing-site.test.ts tests/marketing-carnet.test.ts`
- Layout audits against a served build: `node tests/marketing-overflow.mjs http://127.0.0.1:4411` and `node marketing/scripts/measure.mjs http://127.0.0.1:4411 out.json`.
- `budget.json` records the phone height budget of the home (360x732) and what was last measured.

Arabic numbers: inside copy, digit groups are joined with a no-break space (`4 800`), never a
plain space. A plain space lets the bidi algorithm reorder the groups in right-to-left text;
the test suite rejects it.
