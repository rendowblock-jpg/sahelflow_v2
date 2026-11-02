# Logos of the integrations

The logos in `static/img/brands/` show which tools SahelFlow is built to work with. They are the property of their owners, are shown
unchanged, and imply no partnership (the notice in `src/brands.mjs` `BRAND_MARKS` is printed in the home connections section, on the
integrations page and in every footer). Which file each brand uses is set in `src/brands.mjs`; set a brand's `file` to `null` and the site
shows its name with a neutral glyph instead (nothing else changes).

| Brand | File | Where it comes from |
|---|---|---|
| WhatsApp | `whatsapp.svg` | SahelFlow app, `public/integrations/whatsapp.svg` (green glyph) |
| Google Gemini | `gemini.svg` | SahelFlow app, `public/integrations/gemini.svg` |
| OpenAI | `openai.svg` | Wikimedia Commons, "OpenAI logo 2025 (symbol).svg", author OpenAI, licence shown as Public domain with the restriction "trademarked". The black Blossom, unmodified |
| Groq | none | See below |
| Yalidine | `yalidine.png` | SahelFlow app, `public/integrations/yalidine.png` (91 px) |
| ZR Express | `zr.svg` | SahelFlow app, `public/integrations/zr-express.svg` |
| EcoTrack | `ecotrack.svg` | SahelFlow app |
| Maystro Delivery | `maystro.svg` | SahelFlow app (contains a small embedded PNG) |
| Shopify | `shopify.svg` | SahelFlow app |
| YouCan | `youcan.svg` | SahelFlow app |
| WooCommerce | `woocommerce.svg` | SahelFlow app |
| SahelFlow Store | `storefront.svg` | SahelFlow's own mark |
| Google Sheets | `sheets.svg` | SahelFlow app |
| Excel / CSV | `excel.svg` | Wikimedia Commons, "Microsoft Office Excel (2025–present).svg", author Microsoft, Public domain with the restriction "trademarked". Unmodified |
| Meta Pixel + CAPI | `meta.svg` | SahelFlow app |

Every file was checked: no script, no event handler, no external reference, no foreign object.

## Groq: name only, on purpose

Groq's Trademark Policy (effective 24 Oct 2025, https://groq.com/trademark-policy) lets anyone name Groq for compatibility "limited to word
marks (no logos)", asks for an attribution line and a non-affiliation line (both are in `BRAND_MARKS`), and says logos in a UI need a licence.
So the site writes "Groq" in its own type and puts a neutral glyph in the tile.

To get the logo: email trademark-legal@groq.com with your full name, company, job title, the mark (the Groq logo), a mockup (a screenshot of
the home connections section), the audience (sellers in Algeria), the timing, and the attribution line "Groq is a trademark of Groq LLC and/or
its affiliates." When they send the file, put it in `static/img/brands/groq.svg` and set `groq: { file: "groq.svg" }` in `src/brands.mjs`.

## OpenAI

OpenAI's brand guidelines (https://openai.com/brand) say: use the logo only when it relates to OpenAI services, exactly as provided, with its
ownership acknowledged; do not add colours, imply endorsement, or make it more prominent than your own. The Blossom is shown black on white,
in the same size as every other logo, with the notice above. The app's own `public/brand/chatgpt/*` files are not reused: their NOTICE.md limits
them to the "Continue with ChatGPT" button.

## Before this branch is merged to main

The app keeps a mirror of the integration list (`src/lib/integrations/certification.ts`, `INTEGRATION_IDS` and `STATUS`) and a test compares it
with `marketing/src/claims.mjs`. The site now has `openai` and `groq` (both "testing"), so the app's list needs the same two ids with the status
"testing" before the merge, or `certification.test.ts` fails.
