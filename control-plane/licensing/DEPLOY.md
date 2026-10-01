# Deploying license.sahelflow.com

The trial service issues signed 7-day trials, one per device. Paid licences are
signed offline (`scripts/sign-license-entitlement.ts`) after BaridiMob/CCP
payment, and never touch this Worker.

Already done on the Cloudflare account:

- D1 database `sahelflow-licensing` (`b494ff92-7b47-4577-92ea-aa06b8e9eb2b`, WEUR) with `schema.sql` applied.

Founder steps (one time, on your own PC — the private key must never leave it):

1. Add `sahelflow.com` to Cloudflare (Websites → Add a site) and switch the
   domain's nameservers at your registrar to the two Cloudflare nameservers.
2. Generate the trial signing key, outside the repository:
   `bun scripts/licensing-keygen.ts trial trial-2026-10 %USERPROFILE%\sahelflow-keys`
   Paste the printed public entry into `wrangler.toml` →
   `SF_LICENSE_TRIAL_PUBLIC_KEYS`, and merge it into the GitHub repository
   variable `SF_LICENSE_TRIAL_PUBLIC_KEYS` (keep existing entries).
3. From this folder:
   `npx wrangler login`
   `npx wrangler secret put TRIAL_PRIVATE_KEY_PKCS8` (paste the contents of `trial-2026-10.private`)
   `npx wrangler deploy`
4. Check both `https://license.sahelflow.com/healthz` and
   `https://activate.sahelflow.com/healthz` return `{"status":"ready",...}`.
5. Set the GitHub repository variable
   `SF_LICENSE_SERVICE_URL=https://license.sahelflow.com|https://activate.sahelflow.com`
   (primary|recovery). The customer release compiles both in and the build
   refuses anything outside `sahelflow.com`.

Paid licences: generate the permanent key once
(`bun scripts/licensing-keygen.ts permanent permanent-2026-10 %USERPROFILE%\sahelflow-keys`),
merge its public entry into `SF_LICENSE_PERMANENT_PUBLIC_KEYS`, and keep the
private file offline for `scripts/sign-license-entitlement.ts`.
