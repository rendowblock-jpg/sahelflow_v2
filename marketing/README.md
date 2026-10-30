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
- Rendering: `src/layout.mjs` (head, header with a no-JS menu, footer), `src/pages.mjs`
  (every page), `src/scenes.mjs` (a few product diagrams), `src/ui.mjs` (helpers, `screenImg`).
- Styles: `src/styles/*.css`, concatenated in file-name order into `/assets/site.css`.
- Behaviour: `src/site.js` (theme toggle, reveals, calculators). Every page works without it.
- Screenshots: `static/img/screens/<screen>-<locale>.webp` are the 1600 px originals; the pages
  use the 480 / 800 / 1200 px copies made by `node marketing/scripts/make-screens.mjs`
  (the build leaves the originals out of `dist`).
- Build: `node marketing/build.mjs` writes `marketing/dist`.
- Hosting: Cloudflare Workers static assets (`wrangler.toml`, `worker.js`). `/get/windows`
  always redirects to the newest installer from the updater manifest. The CSP in
  `static/_headers` carries the hash of each inline script; `tests/marketing-carnet.test.ts`
  recomputes them.

## Checks
- `flock /tmp/vt.lock sf vt <worktree> tests/marketing-site.test.ts tests/marketing-carnet.test.ts`
- Browser audits (serve `marketing/dist` first, e.g. `python3 -m http.server 4411 --directory marketing/dist`):
  `node tests/marketing-overflow.mjs http://127.0.0.1:4411` (every page, five widths, tap targets) and
  `node marketing/scripts/measure.mjs http://127.0.0.1:4411 out.json` (contrast, taps, errors, weights, height).
- `budget.json` records the phone height budget of the home (360x732) and what was last measured.

Arabic numbers: inside copy, digit groups are joined with a no-break space (`4 800`), never a
plain space. A plain space lets the bidi algorithm reorder the groups in right-to-left text;
the test suite rejects it.
