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

## Paid licences — the License Desk (no terminal)

The License Desk is one offline page: `tools/license-desk/sahelflow-license-desk.html`.
Download it from GitHub (open the file → **Download raw file**) and open it in
Edge or Chrome on your own PC. It cannot make any network request, so your
signing key never leaves the computer.

### Once: your permanent signing key

1. In the Desk, open **Create a new signing key**, keep the key id
   `permanent-2026-10` (or a new one such as `permanent-2027-01` when rotating),
   click **Create and download key**.
2. Store the downloaded `.private` file offline (a USB drive kept at home) and
   a second copy somewhere safe. Anyone with this file can issue licences;
   without it you cannot issue licences that installed versions accept.
3. Copy the public entry the Desk shows into the repository **variable**
   `SF_LICENSE_PERMANENT_PUBLIC_KEYS` (Settings → Secrets and variables →
   Actions → Variables). Keep any existing entries: the value is one JSON
   object, for example `{"permanent-2026-10":"…","permanent-2027-01":"…"}`.
4. The next signed release trusts the key. Licences signed with it activate on
   that release and every later one.

If a key was already created with `scripts/licensing-keygen.ts`, just open that
`.private` file in the Desk; paste the variable's current value under
**Check against the app's keyring** to confirm the installed version trusts it.

### Each sale

1. The seller pays by BaridiMob or CCP and sends, on WhatsApp, the receipt and
   their **request code** (`SFLR1.…`) from **Get my request code** on the
   licence screen or in Settings → Licence.
2. Verify the payment on your receiving account.
3. In the Desk: open your key file, paste the request code, choose extra shops
   (35,000 DZD includes 5 shops; each extra shop is 5,000 DZD, up to 10),
   fill the customer and payment reference, tick **I verified this payment**,
   click **Issue licence**.
4. Click **Copy message** and send it on WhatsApp (Arabic, French or English).
   It contains the activation code (`SFLA1.…`). You can also send the
   downloaded `.sflicense` file.
5. The seller opens SahelFlow → **Activate my licence**, pastes the code (or
   opens the file) and confirms with their PIN if asked.

Every licence grants the full SahelFlow 1.0 package from
`src/lib/license/packages.ts`: 5 shops plus paid extras, owner + 10 team
members, 23 remote devices, 20 GB backup (+4 GB per extra shop) and five years
of updates. The Desk keeps a sales ledger in that browser; use **Export CSV**
regularly.

The request code names the installation only; it grants nothing without your
signature, and activation re-checks every claim. The terminal path remains
available: `bun scripts/license-request-to-claims.ts "SFLR1.…" --extra-shops 0 > claims.json`
then `bun scripts/sign-license-entitlement.ts claims.json <key-file>`, which
prints the activation code and writes `claims.sflicense`.
