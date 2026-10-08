# sahelflow.com

Static marketing site for SahelFlow: Arabic by default, with French and English.
24 pages per language — home, platform overview, nine module pages, four
solution pages, integrations, pricing, the comparison page, security, download,
help centre, contact and the two legal pages.

- Copy: `src/i18n/{ar,fr,en}.mjs` (one file per language, identical shape) and
  `src/legal.mjs`.
- Product facts the site promises (shops, team size, years of updates, extra
  shop price): `src/model.mjs`. `tests/marketing-site.test.ts` pins them to the
  signed licence package in `src/lib/license/packages.ts`.
- Business settings (WhatsApp number, email, prices, trial length): `src/config.mjs`.
- Rendering: `src/layout.mjs` (head, mega-menu header, footer),
  `src/pages.mjs` (every page), `src/scenes.mjs` (animated product scenes),
  `src/ui.mjs` (helpers).
- Styles: `src/styles/*.css`, concatenated in order into `/assets/site.css`.
- Behaviour: `src/site.js` (menus, scroll story, product tour, calculators,
  reveals) and `src/gl.js` (the real-time WebGL night, loaded only on pages
  that have one).
- Screenshots: `static/img/screens/<screen>-<locale>.webp`, captured from the
  app at 2× and resized to 1600 px.
- Build: `node marketing/build.mjs` writes `marketing/dist`.
- Hosting: Cloudflare Workers static assets (`wrangler.toml`, `worker.js`).
  GitHub Actions "Deploy sahelflow.com" builds and deploys it. `/get/windows`
  always redirects to the newest signed installer from the updater manifest.

No framework and no runtime dependencies. Every page works without
JavaScript; scripts only add motion and interaction. Animations respect
`prefers-reduced-motion`, and the WebGL scene falls back to the CSS night sky
when WebGL is unavailable.

Arabic numbers: inside copy, digit groups are joined with a no-break space
(`4 800`), never a plain space. A plain space lets the bidi algorithm reorder
the groups in right-to-left text; the test suite rejects it.
