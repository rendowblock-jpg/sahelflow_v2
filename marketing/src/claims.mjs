// What sahelflow.com is allowed to say.
//
// Every integration the site shows, and every promise that a seller could
// hold us to, has an entry here with a status and the evidence behind it.
// Pages read their status labels from this file; a test scans every built
// page for phrases that only a `live` entry may earn (see
// tests/marketing-site.test.ts).
//
// Statuses
//   live     proven today: run against a real account / release and recorded
//   testing  the code and its automated tests exist, but it has not been run
//            against a real account yet (live certification is Wave 5)
//   planned  not built, or not available to buy or use yet
//
// To promote an entry to `live`: record the proof in `evidence`, set
// `certifiedOn` to the date of that proof, change the status, and only then
// reword the pages. The banned-phrase test will keep failing until the
// registry and the words agree.

export const STATUSES = Object.freeze(["live", "testing", "planned"]);

/** The three honest labels, in the three languages of the site. */
export const STATUS_LABEL = Object.freeze({
  live: Object.freeze({ ar: "متاح", fr: "Disponible", en: "Available" }),
  testing: Object.freeze({ ar: "قيد الاختبار", fr: "En test", en: "In testing" }),
  planned: Object.freeze({ ar: "قيد التخطيط", fr: "Prévu", en: "Planned" }),
});

/** Algeria has had 69 wilayas since April 2026. Every page reads it from here. */
export const WILAYA_COUNT = 69;

const NOT_RUN =
  "Code and automated tests exist; it has not been run against a real account yet. Live certification is Wave 5 and needs the Founder's accounts.";

function entry(id, kind, status, evidence, { certifiedOn = null, ownerWave = null, allow = {}, proof = [] } = {}) {
  return Object.freeze({
    id,
    kind,
    status,
    label: STATUS_LABEL[status],
    evidence,
    certifiedOn,
    ownerWave,
    // Phrases a page may use because this claim is `live`; nothing else may.
    allow: Object.freeze(allow),
    // Repo paths (files or tests) that hold the proof; a test checks they exist.
    proof: Object.freeze(proof),
  });
}

export const CLAIMS = Object.freeze([
  // ── integrations: one entry per brand in model.mjs BRAND_NAMES ──
  entry("whatsapp", "integration", "testing", `${NOT_RUN} It links like WhatsApp Web (src/lib/whatsapp), which WhatsApp does not officially support.`, { ownerWave: "W5" }),
  entry("yalidine", "integration", "testing", `${NOT_RUN} src/lib/integrations/delivery.`, { ownerWave: "W5" }),
  entry("zr", "integration", "testing", `${NOT_RUN} src/lib/integrations/delivery.`, { ownerWave: "W5" }),
  entry("ecotrack", "integration", "testing", `${NOT_RUN} src/lib/integrations/delivery.`, { ownerWave: "W5" }),
  entry("maystro", "integration", "testing", `${NOT_RUN} src/lib/integrations/delivery.`, { ownerWave: "W5" }),
  entry("sheets", "integration", "testing", `${NOT_RUN} src/lib/integrations/google-sheets.`, { ownerWave: "W5" }),
  entry("shopify", "integration", "testing", `${NOT_RUN} src/lib/integrations/ecommerce.`, { ownerWave: "W5" }),
  entry("youcan", "integration", "testing", `${NOT_RUN} src/lib/integrations/ecommerce.`, { ownerWave: "W5" }),
  entry("woocommerce", "integration", "testing", `${NOT_RUN} src/lib/integrations/ecommerce.`, { ownerWave: "W5" }),
  entry("meta", "integration", "testing", `${NOT_RUN} src/lib/meta (Pixel and Conversions API from the storefront).`, { ownerWave: "W5" }),
  // Conservative: these have code and tests but no real-account or real-shop proof recorded.
  entry("gemini", "integration", "testing", "The seller's own Gemini key; extraction accuracy on Darja orders is unmeasured (Wave 3 eval).", { ownerWave: "W3" }),
  entry("openai", "integration", "testing", "Sign in with the seller's own ChatGPT plan (src/lib/ai/providers/openai-chatgpt); code and tests exist, no real-account proof recorded; extraction accuracy on Darja orders is unmeasured (Wave 3 eval).", { ownerWave: "W3" }),
  entry("groq", "integration", "testing", "The seller's own Groq key (src/app/api/secrets/groq-key); code and tests exist, no real-account proof recorded; extraction accuracy on Darja orders is unmeasured (Wave 3 eval).", { ownerWave: "W3" }),
  entry("storefront", "integration", "testing", "The hosted store runs, but no seller has published a real store yet.", { ownerWave: "W5" }),
  entry("excel", "integration", "testing", "src/lib/import and export have unit tests; not yet recorded against a real seller's file.", { ownerWave: "W5" }),

  // ── facts the site states about the product ──
  entry(
    "updates-verified",
    "fact",
    "live",
    "The in-app updater checks each update's minisign signature against the public key in src-tauri/tauri.conf.json (plugins.updater.pubkey) before it installs. This is NOT a Windows publisher signature on the installer.",
    { certifiedOn: "2026-10-30", allow: { en: ["signing key"], fr: ["clé de signature"], ar: ["مفتاح التوقيع"] } },
  ),
  entry(
    "licence-signed",
    "fact",
    "live",
    "The permanent licence is an Ed25519-signed entitlement that the app verifies offline (src/lib/license/entitlement.ts).",
    { certifiedOn: "2026-10-30", allow: { en: ["signed licence", "signed permanent licence"], fr: ["licence signée", "licence permanente signée"], ar: [] } },
  ),
  entry("data-encrypted", "fact", "live", "Sensitive fields are encrypted on disk with AES-256-GCM (src/lib/crypto/field-crypto.ts).", { certifiedOn: "2026-10-30" }),
  entry("price", "fact", "live", "35 000 DZD once; launch offer 17 000 DZD for the first 20 sellers; 7-day trial (marketing/src/config.mjs, pinned to src/lib/license/packages.ts by a test).", { certifiedOn: "2026-10-30" }),
  entry(
    "local-first",
    "fact",
    "live",
    "Each shop's orders, customers, stock and money are rows of one SQLite database file on the seller's own PC (prisma/schema.prisma: provider sqlite, url from DATABASE_URL; src/lib/db.ts). src/lib/data/__tests__/data-integrity.test.ts runs the order, stock and count paths against that local database.",
    { certifiedOn: "2026-10-30", proof: ["prisma/schema.prisma", "src/lib/db.ts", "src/lib/data/__tests__/data-integrity.test.ts"] },
  ),
  entry(
    "pin-roles",
    "fact",
    "live",
    "Sign-in checks a PIN whose hash is sealed at rest and starts a session; changing the PIN revokes every session (src/lib/auth/__tests__/server.test.ts). A team member opens only the shops the owner granted and a revoked member opens none (src/app/api/__tests__/shop-authorization-boundaries.test.ts). Only the shop owner may release a held WhatsApp send (src/lib/whatsapp/__tests__/held-send.test.ts). Every API route sits behind a guard (src/app/api/__tests__/route-guard-matrix.test.ts).",
    {
      certifiedOn: "2026-10-30",
      proof: [
        "src/lib/auth/__tests__/server.test.ts",
        "src/app/api/__tests__/shop-authorization-boundaries.test.ts",
        "src/lib/whatsapp/__tests__/held-send.test.ts",
        "src/app/api/__tests__/route-guard-matrix.test.ts",
      ],
    },
  ),
  entry(
    "ai-asks-first",
    "fact",
    "live",
    "The eight AI tools that change data (create_order, update_order_status, update_product_stock, cancel_order, create_product, update_product_price, create_customer, update_customer_notes) have executionClass \"sensitive\", which needs approval; the others only read (src/lib/ai/actions/contracts.ts, src/lib/ai/chat/tools/__tests__/capability-groups.test.ts). A text sent to a 6th chat inside 15 minutes is held until a person approves (src/lib/whatsapp/__tests__/send-guard.integration.test.ts). This is the code path; it has not been run with a real seller's Gemini key.",
    {
      certifiedOn: "2026-10-30",
      proof: [
        "src/lib/ai/actions/contracts.ts",
        "src/lib/ai/chat/tools/__tests__/capability-groups.test.ts",
        "src/lib/whatsapp/__tests__/send-guard.integration.test.ts",
      ],
    },
  ),
  entry("wilayas-69", "fact", "testing", "Algeria has 69 wilayas since April 2026. The app places the 11 new ones under their mother wilaya; a native 69-wilaya screen is Wave 3.", { ownerWave: "W3" }),
  entry("backup-restore-new-pc", "fact", "testing", "Encrypted backups can be created; restoring on a new PC has not been proven on a clean Windows machine (Wave 4 restore drill).", { ownerWave: "W4" }),
  entry("installer-publisher-signature", "fact", "planned", "The Windows installer carries no publisher (Authenticode) signature, so SmartScreen warns. Say so; never call the installer signed.", { ownerWave: "W5" }),
]);

/** Competitor statements need a source and a recent check. None are allowed today. */
export const COMPETITOR_CLAIMS = Object.freeze([]);

const COMPETITOR_MAX_AGE_DAYS = 90;

export function validCompetitorClaim(item, now = new Date()) {
  if (!item || typeof item.text !== "string" || item.text.length === 0) return false;
  if (typeof item.sourceUrl !== "string" || !/^https:\/\/\S+$/.test(item.sourceUrl)) return false;
  if (typeof item.checkedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.checkedOn)) return false;
  const age = (now.getTime() - Date.parse(item.checkedOn)) / 86_400_000;
  return Number.isFinite(age) && age >= 0 && age <= COMPETITOR_MAX_AGE_DAYS;
}

export function claimById(id) {
  const found = CLAIMS.find((claim) => claim.id === id);
  if (!found) throw new Error(`No claim "${id}" in marketing/src/claims.mjs`);
  return found;
}

/** The status of an integration. Throws for an unknown one, so a page cannot render it unlabelled. */
export function integrationStatus(key) {
  const found = CLAIMS.find((claim) => claim.kind === "integration" && claim.id === key);
  if (!found) throw new Error(`Integration "${key}" has no entry in marketing/src/claims.mjs`);
  return found.status;
}

export function statusLabel(status, locale) {
  const label = STATUS_LABEL[status]?.[locale];
  if (!label) throw new Error(`No label for status "${status}" in "${locale}"`);
  return label;
}

export function integrationLabel(key, locale) {
  return statusLabel(integrationStatus(key), locale);
}

/** Distinct statuses of a set of integrations, in the order live, testing, planned. */
export function statusesOf(keys) {
  const present = new Set(keys.map(integrationStatus));
  return STATUSES.filter((status) => present.has(status));
}

/** Phrases a page may use, only from claims that are live. */
export function allowedPhrases(locale) {
  return CLAIMS.filter((claim) => claim.status === "live").flatMap((claim) => claim.allow[locale] ?? []);
}

/** True once the Windows installer carries a publisher (Authenticode) signature. The download page shows the SmartScreen note only while this is false. */
export function installerIsSigned() {
  return claimById("installer-publisher-signature").status === "live";
}
