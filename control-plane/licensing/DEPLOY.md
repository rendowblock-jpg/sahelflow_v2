# Putting sahelflow.com and the licence service online

The trial service issues signed 7-day trials, one per device. Paid licences are
signed offline (`scripts/sign-license-entitlement.ts`) after BaridiMob/CCP
payment, and never touch this Worker.

Already done on the Cloudflare account: D1 database `sahelflow-licensing`
(`b494ff92-7b47-4577-92ea-aa06b8e9eb2b`, WEUR) with `schema.sql` applied.

Everything below is done in a browser. No terminal, no local tooling.

## 1. Add the domain to Cloudflare (you)

1. dash.cloudflare.com → **Add a domain** → `sahelflow.com` → Free plan.
2. Cloudflare imports the existing DNS records. Then:
   - delete the Hostinger parking records for `sahelflow.com` (A) and `www`
     (CNAME): the deploy attaches the site to those names and refuses a name
     that already has a CNAME;
   - set the Hostinger mail records (`autoconfig`, `autodiscover`,
     `hostingermail-*._domainkey`) to **DNS only** (grey cloud);
   - keep the MX and TXT (SPF, DMARC) records as they are.
3. Cloudflare shows **two nameservers** (like `xxx.ns.cloudflare.com`). Send
   them to the domain owner.

## 2. Point the domain at Cloudflare (domain owner, at Hostinger)

The domain stays registered to its owner at Hostinger; only the nameservers
change.

1. hPanel → **Domains** → `sahelflow.com` → **Manage**.
2. If **DNSSEC** is on, turn it off first.
3. **DNS / Nameservers** → **Change nameservers** → **Use custom nameservers**
   → paste the two Cloudflare nameservers → **Save**.
4. Make sure **auto-renew** is on: if the domain lapses, every customer's
   trial activation and the website stop working.

Cloudflare emails when the domain is **Active** (minutes to a few hours).

## 3. Contact mailbox (you, in Cloudflare)

The site's email link is `contact@sahelflow.com`. Use one mail system, not both:

- Hostinger email plan: create `contact@sahelflow.com` in hPanel → **Emails**.
- No Hostinger email plan: Cloudflare **Email → Email Routing** → create
  `contact@sahelflow.com` → forward to your Gmail; accept its offer to replace
  the Hostinger MX records.

## 4. Give GitHub permission to deploy (you)

1. Cloudflare → **Manage account → Account API tokens → Create token** →
   template **Edit Cloudflare Workers** → Account: your account, Zone:
   `sahelflow.com` → create, and copy the token (shown once).
2. Cloudflare home → your account → copy the **Account ID**.
3. GitHub → repository **Settings → Secrets and variables → Actions → Secrets**
   → add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Never paste the token in a chat or a file.

## 5. Deploy (you, in GitHub)

GitHub → **Actions → Deploy sahelflow.com → Run workflow** (branch `main`):

- First time: target **both**, tick **create trial key**.
- The run summary prints a line for the repository **variable**
  `SF_LICENSE_TRIAL_PUBLIC_KEYS`. Set it exactly (Settings → Secrets and
  variables → Actions → **Variables**). It is the public half; the private
  half was created inside the runner and exists only in Cloudflare.
- The summary also shows `https://license.sahelflow.com/healthz` and
  `https://activate.sahelflow.com/healthz` → `ok`.

Later deploys (website copy, a new screenshot): run it again with **create
trial key** unticked. It refuses to replace a trial key that installed apps
already trust.

## 6. Switch on the customer release (you)

Set the repository variable
`SF_LICENSE_SERVICE_URL=https://license.sahelflow.com|https://activate.sahelflow.com`
(primary|recovery). The customer release compiles both in and the build
refuses anything outside `sahelflow.com`.

## Paid licences

1. Once, on your own PC (the permanent key never leaves it):
   `bun scripts/licensing-keygen.ts permanent permanent-2026-10 %USERPROFILE%\sahelflow-keys`
   and merge its public entry into the repository variable
   `SF_LICENSE_PERMANENT_PUBLIC_KEYS` (it ships in the next release).
2. For each customer, after BaridiMob/CCP payment, they send you their
   **request code** (`SFLR1.…`) from the licence screen or Settings → Licence.
3. Turn it into a licence and sign it:
   `bun scripts/license-request-to-claims.ts "SFLR1.…" --members 5 > claims.json`
   `bun scripts/sign-license-entitlement.ts claims.json %USERPROFILE%\sahelflow-keys\permanent-2026-10.private > licence.json`
4. Send `licence.json`'s contents back on WhatsApp; the customer pastes it
   into **Activate my licence**.

The request code names the installation only; it grants nothing without your
signature, and activation re-checks every claim.
