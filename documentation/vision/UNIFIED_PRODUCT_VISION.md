# SahelFlow 1.0 — Unified Product Vision

> **Status:** Active vision baseline  
> **Product authority:** `documentation/product/`  
> **Engineering authority:** `documentation/architecture/`

## 1. North star

SahelFlow is the **AI-powered operating system for Algerian cash-on-delivery sellers**.

It gives a seller one dependable place to run the daily business:

- understand incoming demand;
- convert WhatsApp and storefront conversations into correct orders;
- control products, variants and stock;
- coordinate staff without shared accounts;
- choose and operate delivery providers;
- track delivery, returns, refunds and COD money;
- automate repetitive work safely;
- work from a low-end Windows computer and an Android/browser companion;
- recover from device loss, corruption, provider failure and human mistakes;
- publish professional COD storefronts without surrendering business authority to a cloud database.

The product is successful when a seller can trust it with the business, not merely when the screens render or tests pass.

## 2. The promise to the seller

SahelFlow must feel like a calm, capable operations partner:

- **Everything important is visible.** Money, stock, sync, delivery, approvals and failures never hide behind silent background work.
- **The next action is obvious.** Every workflow shows what happened, what is pending, who owns it and what can be done.
- **The seller remains in control.** Local authority, exportability, permanent major-version use and independent recovery are structural promises.
- **AI assists; it does not seize authority.** Suggestions are reviewable, typed and permission-checked.
- **Weak hardware is not a second-class edition.** Low-resource mode changes scheduling and presentation cost, never correctness or feature ownership.
- **Arabic is not a translation layer.** Arabic/French mixed business communication, RTL layout and Algerian conventions are designed from the start.
- **Connected features degrade honestly.** Offline, stale, queued, retrying and unavailable are explicit states.
- **Professional does not mean complicated.** Advanced power is progressively disclosed while common work stays fast.

## 3. Product identity

SahelFlow 1.0 is:

- Algeria-first;
- COD-first;
- WhatsApp-first;
- Windows-desktop-authoritative;
- local-first with a bounded Cloudflare plane;
- Arabic, French and English;
- team-capable;
- storefront-capable;
- recovery-capable;
- evidence-driven.

It is not:

- a generic CRM;
- a cloud multi-master database disguised as desktop software;
- an MVP marketed as enterprise-ready;
- a website template pack;
- a single-user PIN utility;
- a feature-tier subscription;
- an AI product that fails when Gemini is unavailable.

## 4. Commercial contract

The final product contract is:

- 35,000 DZD one-time;
- one complete edition;
- perpetual local use of major release 1;
- five-year same-major maintenance and SahelFlow-controlled connected continuity;
- one owner plus ten active members;
- five included shops;
- up to five extra shops at 5,000 DZD one-time each;
- published device, storage, media and fair-use boundaries;
- no subscription, feature tier, seat fee or mandatory recurring seller cloud fee.

The commercial model is part of the architecture: licensing, entitlements, continuity reserve, limits and offline behavior must all agree with it.

## 5. System shape

### 5.1 Canonical Windows desktop

The desktop is the full product and the final authority for:

- orders and order state;
- customers and private history;
- products, variants, reservations and stock;
- deliveries, returns, refunds and COD;
- accounting and operational metrics;
- team authorization and actor attribution;
- provider credentials;
- audit, domain events, inbox/outbox and automation execution;
- backup creation and recovery operations.

Each shop has an isolated local database. A standard license has one active authoritative installation.

### 5.2 Cloudflare control and coordination plane

Cloudflare provides bounded services:

- trial, license, entitlement and transfer coordination;
- tenant, member, device and session control;
- encrypted command/projection relay;
- durable provider and storefront ingress;
- notifications;
- zero-knowledge backup objects;
- storefront runtime and releases;
- founder payment, license, support and incident administration.

Cloud acceptance never means a business mutation succeeded. The desktop commit is final.

### 5.3 Android/browser operational companion

The PWA/browser workspace is a first-class daily operations surface with limited administration. It must support approved work even when the desktop is temporarily unreachable by showing accurate stale, queued and pending states.

### 5.4 Hosted storefront platform

One shared multi-tenant platform serves immutable releases for every entitled shop, accepts durable COD checkout while the desktop is offline, and relays accepted orders until the canonical desktop imports or rejects them with a visible reason.

### 5.5 Provider workers

WhatsApp, Gemini, commerce, couriers and Google Sheets operate through durable, scoped workers. Provider existence in source code is not a support claim; live certification controls public capability.

## 6. People and roles

### Owner

Owns business authority, entitlements, recovery, secrets, high-risk approvals and final policy.

### Manager

Runs broad operations across permitted shops without founder-only or entitlement authority.

### Operator

Works assigned queues: confirmation, fulfillment, customer contact, delivery, returns and other configured workflows.

### Viewer/analyst

Reads permitted operational projections and analytics without write authority.

### Founder/support administrator

Operates the bounded SahelFlow control plane for payment verification, signed licensing, transfers, support, incidents, release channels and continuity—without access to seller operational plaintext.

### Public customer

Uses storefront checkout and tracking. Public input is always untrusted.

## 7. Core business loop

The central SahelFlow loop is:

1. **Demand arrives** from WhatsApp, manual entry, storefront or commerce integration.
2. **Identity and risk are resolved** using customer history, phone reputation, wilaya and order signals.
3. **An order draft is created** with source evidence, products, variants, address and price.
4. **A human or approved automation confirms** the order.
5. **Stock is reserved and fulfillment is prepared.**
6. **A courier shipment is created and tracked.**
7. **Delivery outcome updates stock, customer history and COD facts.**
8. **Returns, exchanges, cancellations and refunds create explicit compensation facts.**
9. **COD remittance is reconciled** against expected money.
10. **Analytics and automations learn from the committed history.**

Every step must be idempotent, auditable and recoverable.

## 8. Differentiation

SahelFlow should win through the combination—not a single checkbox:

- Algerian COD domain depth;
- WhatsApp-native operations;
- Darija-aware assisted extraction;
- trustworthy money and COD reconciliation;
- professional team workflows;
- local authority and independent recovery;
- low-end Windows performance;
- remote operational companion;
- durable multi-provider synchronization;
- hosted storefronts designed for confirmed and delivered COD outcomes;
- top-tier experience quality.

## 9. Experience character

The intended character is **quiet power**:

- visually restrained;
- information-dense without crowding;
- fast and direct;
- precise around money and state;
- warm and human in guidance and errors;
- never flashy at the expense of weak hardware;
- never vague about failure or authority.

Reference products are used for disciplines, not imitation:

- Linear for density, interaction speed and keyboard fluency;
- Stripe for money clarity, trust and settings;
- Notion for progressive disclosure and connected records;
- Chatwoot/Intercom for communication workflows;
- Shopify for product/storefront workflows;
- professional logistics tools for shipment operations;
- Noon and W3C patterns for Arabic/RTL.

## 10. Stable launch definition

Stable means all of the following are true:

- the founder product contract is implemented exactly;
- every launch capability has a clear surface and owner;
- all critical journeys include failure and recovery states;
- architecture invariants are enforced;
- packaged Windows evidence exists;
- low-end budgets are met;
- provider claims are live-certified;
- Arabic/RTL and accessibility evidence exists;
- zero-knowledge restore works on a replacement installation;
- representative sellers complete a controlled beta without money-loss incidents;
- public claims link to exact evidence.

“Many features,” “large test count,” “build exits zero,” and “looks good in one screenshot” are not substitutes.
