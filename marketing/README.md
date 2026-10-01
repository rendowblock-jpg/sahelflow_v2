# sahelflow.com

Static marketing site for SahelFlow: Arabic by default, with French and English.

- Copy: `src/content.mjs` (all three languages) and `src/legal.mjs`.
- Business settings (WhatsApp number, email, trial length): `src/config.mjs`.
- Screenshots: `static/img/screens/<module>-<locale>.webp` (captured from the app).
- Build: `node marketing/build.mjs` writes `marketing/dist`.
- Hosting: Cloudflare Workers static assets (`wrangler.toml`, `worker.js`).
  GitHub Actions "Deploy sahelflow.com" builds and deploys it. `/get/windows` always
  redirects to the newest signed installer from the updater manifest.

No framework and no runtime dependencies. Every page works without JavaScript;
`src/site.js` only adds the header glass, the mobile menu, scroll reveals and
the remembered language choice.
