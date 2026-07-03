# R-1: Algerian COD E-Commerce Management Software Market — Deep Research

**Author:** R-1 subagent (general-purpose)
**Date:** Session 23
**Method:** Web search + page reader (z-ai-web-dev-sdk CLI), competitor websites, App Store / Play Store listings, DZBuild/Leadivo/CODRocket/Mystoq blogs, Reddit r/algeria, Facebook groups, Shopify App Store.

---

## 1. Executive Summary (≈300 words)

The Algerian COD e-commerce market is dominated by **Cash on Delivery** — ~70–80 % of all online transactions are COD, with return rates of 25–40 % industry-wide (top performers 8–15 %). The market is organized around two layers: (1) **delivery/courier companies** that physically move parcels and collect cash, and (2) **store-management SaaS** that sellers use to run their storefront, orders and reconciliation.

At the courier layer, **Yalidine Express** (founded 2013 by Djamel Eddine Toumiat, 160+ branches, 1,469 communes, all 58 wilayas, well-documented API) is the de-facto standard. **Maystro Delivery** (2–3 K stores, 600+ drivers, "Call Center + Warehousing + Packaging" add-ons) is the strong #2 with a polished React-Native mobile app. **ZR Express, DHD, NOEST, EcoTrack, Mylers, 48H Express** are regional / price-competitive challengers. Algeria Post is the cheapest fallback but lacks an API.

At the SaaS layer, **DZBuild** ("Algerian Shopify", DZD-native, free to start, multi-courier integration, anti-fraud) and **Mystoq** (999 DZD/month, COD + Yalidine + FakeShield bundled) are the local Shopify alternatives. **YouCan.shop** (MENA-wide, free until $5K sales, 400K+ stores) is the regional player. **Leadivo** and **CODRocket** are MENA-wide multi-carrier/COD-specific management platforms. **Cirtasoft** sells WooCommerce plugins that bridge WordPress stores to Yalidine/ZR/NOEST (20–50 K DZD/year).

What Algerian sellers **complain about** most: couriers don't call customers before delivery, slow COD reimbursement ("remboursement") cycles (3–15 days), high return-shipping fees, app crashes on iOS, customer service that ghosts during Ramadan, prices going up too fast. **What sellers wish they had**: better WhatsApp-native order capture, automatic confirmation calls (or AI voice agents), per-wilaya return-rate analytics, phone reputation scoring, blacklists, multi-courier auto-selection, DZD-only pricing, and Arabic-first UX. The competitive bar for SahelFlow is high but the gaps are concrete and exploitable.

---

## 2. Competitor Profiles

### 2.1 Yalidine Express — *The Standard*

| Attribute | Detail |
|---|---|
| **Founded** | 2013 by Djamel Eddine Toumiat (Yalidine El Djazair Service SPA) |
| **HQ / contact** | Alger 0982 30 80 80, contact@yalidine.com |
| **Coverage** | 58 wilayas, 1,469 communes, 160+ branches |
| **Speed** | Under 24 h in northern wilayas, longer in the south |
| **Delivery modes** | Home delivery + Stop-Desk pickup (largest stop-desk network in Algeria) |
| **COD handling** | Collects cash at the door, settles to seller's bank account on a scheduled cycle. Yalidine's transport contract specifies settlement within **15 days maximum** by cheque / bank transfer / cash, otherwise Yalidine may repay by other means. |
| **Return policy** | After the **3rd failed delivery attempt**, the parcel is automatically returned and the return is **payable** by the seller. |
| **API** | Well-documented REST API (`api.yalidine.app/v1/parcels/`). Requires verified business account + API ID/Token. Used by virtually every Algerian SaaS platform natively (DZBuild, Leadivo, Mystoq, Cirtasoft plugin, Shopify app by Common Ninja). Rate-limited (HTTP 429). |
| **API payload** | Customer name, phone (auto-formatted 0X), optional second contact phone, address, wilaya, commune (must be in French), origin wilaya, product list, COD amount (= subtotal), declared value, dimensions L×W×H, weight, `is_stopdesk` flag, `stopdesk_id`, `freeshipping`, `do_insurance`, `exchange` flag. |
| **API response** | Tracking number + PDF label URL. Status webhooks flow back. |
| **Resellers** | Yalitec, Guepex, Easy & Speed share the Yalidine API under their own dashboards. |
| **Integrations** | Shopify (Common Ninja app, HulkApps integration), WooCommerce (Cirtasoft, Yalidine-Dz-Laravel-Api on GitHub), DZBuild (native), Mystoq (native), Leadivo (native), CourierDZ PHP client (multi-courier). |
| **Pricing (≈)** | Algiers home: 400–500 DZD. Wilaya home: 500–700 DZD. Stop-desk: 300–400 DZD. Scales by weight/dimensions. No per-order commission on top — the seller pays the delivery fee, the customer pays the seller. |
| **Market position** | #1 — most-used by Algerian e-commerce sellers, "best infrastructure, can carry your whole business" (Reddit r/algeria). Slightly more expensive than challengers, capacity strain during Ramadan / Black Friday. |
| **Weaknesses (per sellers)** | Slow customer service at peak times; delays in interior/southern wilayas; remboursement takes "some time"; high pricing relative to upstarts. Data breach allegation (123 GB data listed for sale) posted to Reddit in 2024. |

**Sources:** dzbuild.com/docs/couriers/yalidine · dzbuild.com/blog/shipping-companies-algeria · leadivo.app/blog/best-delivery-companies-algeria · wearetech.africa article · yalidine-express.com.dz · cirtasoft.com/yalidine-plugin/en · promochoclebonprix.com Yalidine transport conditions PDF · scribd Yalidine convention 2024 · github.com/sebbahali/Yalidine-Dz-Laravel-Api · github.com/PiteurStudio/CourierDZ · reddit.com/r/algeria/comments/129naah · reddit.com/r/algeria/comments/1mz0les

---

### 2.2 Maystro Delivery — *The Strong #2 with Mobile-First App*

| Attribute | Detail |
|---|---|
| **Coverage** | 58 wilayas, 14–15 hubs, 600+ drivers, 2–3 K+ registered stores |
| **Speed** | "75 % of orders delivered in less than 24 h" (per marketing) |
| **Services** | Fast Delivery + Warehousing + Pickup + Packaging + Cash Collection + **Call Center** (own BPO for confirmation calls) |
| **Apps** | **Maystro Partners** (seller) + **Maystro Drivers** (driver) — React Native. App Store rating 3.9/5 (61 ratings) |
| **Seller app features (per release notes)** | Real-time dashboard with cancellation rate, shipping time, top products · manual order entry · integration with Shopify, WooCommerce, Facebook leads · real-time payment-balance tracking · warehouse levels · notifications · team/member management · stop-desk ("Locomotive") picker · refunds creation · second phone number on orders · price-limit feature for products · loyalty Ambassador Tier |
| **Pricing** | Two packs: **Business** and **Premium** (contact sales, volume-based). Per-delivery ≈ Algiers 400–500 DZD / wilaya 500–700 DZD / stop-desk 300–400 DZD. |
| **Better pricing** | Negotiable after 100+ orders/day |
| **Market position** | "Trusted for larger stores" — better unit economics at high daily volume. Advanced reports/dashboard. |
| **Seller complaints (App Store reviews)** | App crashes entering client details (Jul 2025); "Prix ça va mais service na9es bzef" (price OK but service lacking, Aug 2025); customer service ghosting / hanging up ("yahgar bal3ayn"); stop-desk staff don't call customer, seller has to call themselves; prices rising too fast, customers refusing because of delivery cost; "they lie during Ramadan — push in-app notification claiming delivered, then it isn't" |
| **Mobile app launch** | v1.30.0 (Nov 2025) — confirmed React Native upgrade (Sep 2024), so the entire seller surface is mobile-first |

**Sources:** maystro-delivery.com · apps.apple.com/dz/app/maystro-partners/id1516638852 · apps.apple.com/dz/app/maystro-drivers/id1546512127 · play.google.com/store/apps/details?id=com.maystro.store · play.google.com/store/apps/details?id=com.maystro.agents · dz.linkedin.com/company/maystro-delivery · dzbuild.com/blog/shipping-companies-algeria

---

### 2.3 ZR Express — *The Urban Speed Challenger*

| Attribute | Detail |
|---|---|
| **Coverage** | All 58 wilayas, strong stop-desk network, focus on major cities (Algiers, Oran, Constantine, Annaba, Setif) |
| **Speed** | Very fast in Algiers and major cities; weaker in the south |
| **API** | Two APIs supported by DZBuild: (1) legacy "ZR Express (Procolis)" at procolis.com; (2) newer ZR Express API. |
| **Pricing (≈)** | Algiers 400–600 / wilaya 500–750 / stop-desk 300–450 DZD. |
| **COD settlement** | "Competitive COD settlement terms" (Leadivo) — designed to keep sellers' money moving |
| **Integrations** | Cirtasoft WooCommerce plugin (in the 50 K DZD multi-plugin pack with Yalidine + NOEST), DZBuild native, Leadivo native |
| **Market position** | "Very fast in Algiers and major cities"; reddit users: "Currently ZR Express and Nord Ouest are the best for fast delivery and prices." |
| **Weaknesses** | Higher pricing for long distances; weaker coverage in the south |

**Sources:** zrexpress.com · reddit.com/r/algeria/comments/12f0lco/about_yalidine_and_zr_express · reddit.com/r/algeria/comments/1gc4zz3/which_delivery_company_is_the_best · cirtasoft.com/zr-express-plugin/en · dzbuild.com/docs/couriers/zr-express · leadivo.app/blog/best-delivery-companies-algeria · play.google.com/store/apps/details?id=com.prodelivery

---

### 2.4 DHD Livraison Express — *The Mobile App Challenger*

| Attribute | Detail |
|---|---|
| **Founded** | March 2019, Bouira (100 % Algerian) |
| **Coverage** | National; positioned as express + home delivery specialist |
| **Apps** | **DHD - Expéditeur** (seller, com.dhddz.seller) + **DHD - Livreur** (driver, com.dhddz.driver) |
| **Seller app features** | Easy package creation · real-time tracking · **COD payment tracking "step by step with payment history"** · collection management · barcode/QR scan · instant notifications |
| **API / platform** | "platform.dhd" (referenced in seller community) — has ties to EcoTrack platform branding |
| **Market position** | Smaller challenger; aggressive in home-delivery niche; popular with smaller Instagram/FB sellers in interior wilayas |
| **Pricing** | Not publicly listed; quoted per merchant |

**Sources:** dhd-dz.com · facebook.com/dhdlivraisonexpress10 · apps.apple.com/us/app/dhd-expediteur/id6742082924 · play.google.com/store/apps/details?id=com.dhddz.driver · play.google.com/store/apps/details?id=com.dhddz.seller · trackdz.com/carriers/dhd · instagram.com/reel/DNytOR2WrUx

---

### 2.5 YouCan.shop — *The MENA Shopify Alternative*

| Attribute | Detail |
|---|---|
| **Coverage** | +166 countries, +400 K active stores, +20 % conversion rate (per marketing) |
| **Free tier** | **Free until $5,000 in sales**, no monthly fees, no credit card — pay only a tiny transaction fee after. $5 credit deposit required to activate store (anti-spam). |
| **COD support** | Native COD payment option, multi-currency via Shopify-Markets-style mechanism. **YouCan Ship** — separate shipping aggregator that lists local shipping companies and lets the seller pick. |
| **Built for** | MENA-region dropshipping & COD sellers — Morocco-first but Algerian merchants use it heavily |
| **Languages** | English, French, Arabic |
| **App** | iOS + Android (since 2019) |
| **Market position** | The default "first store" for many Algerian sellers because of the $5K-free runway; TikTok/FB ads → YouCan single-product landing → COD → Yalidine is a textbook Algerian seller stack |
| **Limitations** | Doesn't currently handle storage/shipping themselves; depends on YouCan Ship aggregator |
| **Common competitor** | LightFunnels (also COD-landing focused), DZBuild (Algeria-local) |

**Sources:** youcan.shop · shop.youcan.com.tr · apps.apple.com/sa/app/youcan-shop/id1485859147 · youcan.shop/en/blog/posts/youcan-ship · reddit.com/r/algeria/comments/17rigmu/cash_on_delivery_cod · fiverr.com/kamu01/build-youcan-shop-for-ecommerce-dropshipping-and-cod

---

### 2.6 DZBuild — *The Local Shopify*

| Attribute | Detail |
|---|---|
| **Type** | Multi-tenant SaaS, Algerian-built ("صنع في الجزائر") |
| **Pricing** | Free to start, no credit card; paid plans unlock advanced analytics, marketing automations, premium themes — billed in **DZD** (no FX surprise) |
| **Languages** | Arabic + French + English (with Arabic↔French commune-name resolution) |
| **Couriers** | Native integrations: **Yalidine, ZR Express, Maystro, EcoTrack, NOEST, Procolis** + stop-desk networks |
| **API** | Public DZBuild API (live 2026) for custom integrations |
| **COD-specific features** | Phone Reputation Score (scores buyer behavior across order history, flags high-risk phones), device fingerprinting (same-device → different-account detection), automatic blacklist after X returns in Y days, abandoned-cart WhatsApp recovery, per-wilaya return-rate analytics, multi-courier auto-selection based on wilaya + coverage + history |
| **Storefront features** | Customizable storefront, captcha protection, cascading variants, custom delivery labels, digital product variants, Facebook catalog sync, image cadre/crop, IP-order limits, multi-language, offer variant popups, product reviews, stock management, stop-desk selector, custom product shipping |
| **Mobile app** | Android app (com.dzbuild.app) — manage store from phone |
| **Trustpilot** | Listed; "Algeria's leading e-commerce platform, trusted by thousands of local merchants" |
| **Market position** | The most "Shopify-for-Algeria" — actively publishing COD best-practices content, multi-store + AI landing pages shipped April 2026 |
| **Roadmap gaps (per their own blog)** | "Some advanced features are on the roadmap" — implicit admission that they're still building |

**Sources:** dzbuild.com · dzbuild.com/blog/ecommerce-platforms-algeria · dzbuild.com/blog/shipping-companies-algeria · dzbuild.com/blog/cod-best-practices · dzbuild.com/blog/reduce-cod-return-rate-algeria · dzbuild.com/docs/couriers/yalidine · dzbuild.com/docs/couriers/zr-express · github.com/DZBuild-com · play.google.com/store/apps/details?id=com.dzbuild.app · f6s.com/software/dzbuild · fr.trustpilot.com/review/dzbuild.com · facebook.com/dzbuild · youtube.com/watch?v=9erR8vHwyS0

---

### 2.7 Mystoq — *The Boutique Algerian Alternative*

| Attribute | Detail |
|---|---|
| **Built by** | TKAWEN SAS, Annaba, Algeria |
| **Pricing** | **999 DZD/month**, 60-day free trial |
| **Bundled features** | COD + Yalidine integration + **FakeShield** (anti-fake-order) + cross-store wallet |
| **Languages** | Arabic-first |
| **Market position** | Smaller, focused alternative; positions vs Shopify/WooCommerce/Lightfunnels by emphasizing: native COD, native Yalidine, Arabic UX, DZD pricing, anti-fake-order tools |
| **Sister products** | liqaa.io, algeriacertify.com (TKAWEN portfolio) |

**Sources:** mystoq.com/en/answers/best-ecommerce-platform-algeria

---

### 2.8 Leadivo — *Multi-Carrier Aggregator SaaS*

| Attribute | Detail |
|---|---|
| **Type** | E-commerce platform with deep multi-carrier integration |
| **Native carrier integrations** | Yalidine, EcoTrack, ZR Express, Mylers (and 48H Express / others) |
| **Value proposition** | "Multi-carrier strategy" — don't put all eggs in one basket; Leadivo auto-assigns best carrier per order based on coverage + performance + seller preferences |
| **Differentiator** | Compares courier performance on delivery success rate, return rate, settlement cycle, return fees — and routes accordingly |
| **Market position** | Cross-platform SaaS that sits between the seller's storefront and the courier APIs; positions itself as carrier-agnostic |

**Sources:** leadivo.app/blog/best-delivery-companies-algeria · leadivo.app (full article extracted)

---

### 2.9 CODRocket — *MENA-wide COD-Specific Platform*

| Attribute | Detail |
|---|---|
| **Coverage** | "500+ sellers across MENA" |
| **Modules** | Operations Management · Inventory Tracking · Store & Landing Pages · Integrations · Delivery Management · Analytics & Reports |
| **Apps** | COD Form & Upsells · COD Affiliate · Google Sheets Sync (two-way) · TikTok Pixel & CAPI (server-side, past ad blockers) |
| **Self-hosted option** | Yes ("Self-Hosted" listed in nav) |
| **Languages** | EN, FR, AR |
| **Blog topics (signals roadmap)** | Fake-order reduction, COD call-center AI automation, COD reconciliation, COD KPIs, multi-courier dashboard, WhatsApp Business for COD, product testing framework, landing-page conversion, MENA last-mile, country guides (MA, DZ, TN, EG, SA, UAE) |
| **Market position** | The most explicit "COD operating system" for MENA — closest direct competitor to what SahelFlow wants to be, but multi-country |

**Sources:** codrocket.com/blog · codrocket.com (404 landing pages confirmed nav modules)

---

### 2.10 Cirtasoft — *WooCommerce-to-Algeria Connector*

| Attribute | Detail |
|---|---|
| **Product** | WooCommerce plugins connecting WP stores to Algerian couriers |
| **Pricing** | Yalidine Plugin: **20,000 DZD / year** (ex VAT 19 %). Yalidine + Wooexpress Plugin: **30,000 DZD**. Complete Logistics Pack (Yalidine + ZR Express + NOEST): **50,000 DZD**. |
| **Features** | Order sync, automatic waybill generation, real-time parcel tracking, automatic delivery-fee calculation by wilaya (home + StopDesk), status synchronization, customer-side tracking |
| **Target** | Algerian WooCommerce merchants — bridges WordPress sites to the local courier API ecosystem |
| **Market position** | Niche but established — "5000 satisfied customers" claimed across Cirtasoft products |

**Sources:** cirtasoft.com/yalidine-plugin/en · cirtasoft.com/zr-express-plugin/en

---

### 2.11 Shopify COD Apps (Releasit, EasySell, Madgic, CODMonster, CodForm, CODRocket, MIT Quick COD)

The Shopify ecosystem has spawned a sub-category of "COD Form" apps because **Shopify's native COD is bare-bones** — it just adds "Cash on Delivery" as a payment method, nothing more. Algerian/MENA sellers using Shopify almost universally install one of these.

| App | Free Tier | Paid Tiers | Rating | Key Features |
|---|---|---|---|---|
| **Releasit COD Form & Upsells** | 60 orders/mo | $9.99 / $29.99 / $69.99 (unlimited) | 4.9★ (2,661 reviews) | 1-click COD form (popup or embedded) bypassing Shopify checkout · OTP phone verification (SMS + WhatsApp) · upsells / downsells / quantity offers · A/B testing on upsells · multi-pixel (FB/TikTok/Google/Pinterest/Snapchat) · Google Sheets sync · address validation · cart recovery · IP blocking · postal-code limits · 19 languages · "Built for Shopify" certification |
| **EasySell COD Form & Upsells** | 60 orders/mo | $9.95 / $24.95 / $59.95 (unlimited) | 4.9★ (887 reviews) | Same shape as Releasit · multi-currency · quantity offers on PDP · partial payment · product-specific pixels · AI recommender (top tier) |
| **Madgic COD Form & Upsells** | — | $7.99 unlimited | — | Dropship-focused · WhatsApp OTP · fraud protection · multi-currency |
| **Releasit COD Fee** | — | — | — | Adds custom fee to COD orders, conditional hide/show |
| **CODMonster, CodForm, COD Rocket, MIT Quick COD** | Free plans | — | — | Variations on the same 1-click COD form pattern |

**Critical insight:** Shopify rejected COD apps that create orders "directly without Shopify checkout" — these apps use draft orders / storefront APIs to bypass Shopify checkout because COD customers won't tolerate a multi-page checkout flow. This is the same architectural constraint Algerian SaaS solves natively.

**Sources:** apps.shopify.com/releasit-cod-order-form · apps.shopify.com/easy-order-form · apps.shopify.com/mt-cod-form · apps.shopify.com/cash-on-delivery-fee · apps.shopify.com/quick-cod-order-form · releas.it · community.shopify.com COD app discussion · carthook.com compare articles · gempages.net help articles · reddit.com/r/shopify/comments/1mk2yzv

---

### 2.12 WooCommerce COD Plugins

| Plugin | Cost | What it adds |
|---|---|---|
| **WooCommerce COD (core)** | Free (bundled) | Bare-bones COD payment gateway — sets order to "Processing" until cash collected, lets you restrict to specific shipping methods, allow virtual orders, set title/description/instructions. **No fee logic, no OTP, no fraud scoring.** |
| **Smart COD for WooCommerce** | Free (wordpress.org) | Multiple extra COD fees, conditional rules (zone/total/category) |
| **Advanced Cash on Delivery with Fee** (official Woo extension) | Paid | Conditional fees, restrict by zone, hide/show COD conditionally |
| **Yalidine WooCommerce Plugin (Cirtasoft)** | 20 K DZD/yr | Auto-sync orders to Yalidine, waybill, tracking, wilaya fee calculation |
| **ZR Express Plugin (Cirtasoft)** | (in 50 K pack) | Same for ZR Express |
| **NOEST Plugin (Cirtasoft)** | (in 50 K pack) | Same for NOEST Express |
| **Yaxii.dev / CourierDZ (PHP)** | Open source | Multi-courier PHP clients |

**Insight:** WooCommerce's core COD is generic — Algerian sellers must stack 2–4 paid plugins (Smart COD + Advanced COD Fee + Cirtasoft Yalidine) to get feature parity with DZBuild/Mystoq out-of-the-box. That stack alone costs ~30–50 K DZD/year + hosting + maintenance.

**Sources:** woocommerce.com/document/cash-on-delivery · fr.wordpress.org/plugins/wc-smart-cod · yaxii.dev/blog/woocommerce-shipping-algeria-wilaya-commune · github.com/PiteurStudio/CourierDZ · cirtasoft.com/yalidine-plugin/en

---

### 2.13 Other Algerian/North-African Players Spotted

| Player | Type | Note |
|---|---|---|
| **NOEST Express** (Nord Et Ouest Express Transport) | Courier | Algerian delivery company; bundled in Cirtasoft multi-pack |
| **EcoTrack** | Courier | "Cost-effective alternative" — lower delivery fees than Yalidine; same API shape as some Yalidine resellers |
| **Mylers** | Courier | Urban speed specialist (Algiers/Oran/Constantine same/next-day) |
| **48H Express** | Courier | Fast + low-price express service |
| **Yalitec / Guepex / Easy & Speed** | Yalidine resellers | Use Yalidine's API under their own brand |
| **Procolis** | API/legacy | Legacy API used historically by ZR Express; also a south-coverage specialist |
| **LightFunnels** | SaaS | Single-product funnel for COD; used in DZ per Reddit r/algeria |
| **Selldone** | SaaS | "Business OS" no-plugin shop builder for Algeria |
| **TrackDz** | Tracker | Public parcel tracker across Algerian couriers |
| **CourierDZ** (PHP) | OSS | Multi-courier PHP client for Algerian providers |
| **Algérie Poste** | Courier | Widest coverage + cheapest (~150–250 DZD), but slow (3–10 days), no API, no COD settlement infrastructure |

---

## 3. The Real Algerian COD Seller's Daily Workflow

Synthesized from DZBuild's COD best-practices & return-rate guides, Leadivo's COD flow article, Reddit r/algeria threads, Maystro App Store reviews, and the Cirtasoft plugin page.

### 3.1 End-to-End Daily Loop

```
┌─────────────────────────────────────────────────────────────────────────┐
│ MORNING — PRE-ORDER PREP                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ 6:30  Wake → check overnight WhatsApp messages on the business number    │
│ 7:00  Open Instagram DMs + Facebook Page inbox → answer "livraison       │
│       combien pour [wilaya]" questions                                   │
│ 7:30  Scroll Facebook/Instagram ads → see what competitors are running   │
│ 8:00  Sync new products / prices from supplier WhatsApp groups           │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│ MORNING — INBOUND ORDERS                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ 8:30  New orders arrived overnight via:                                  │
│         - Direct WhatsApp message ("bghit nchri [product]")              │
│         - Facebook Lead Form                                             │
│         - YouCan / DZBuild / Shopify store form                          │
│         - Instagram DM → manual transcription                           │
│ 9:00  Manually enter WhatsApp / FB / IG orders into Maystro / Yalidine   │
│       dashboard (or DZBuild order screen)                                │
│       Required fields:                                                   │
│         - customer name (first + family, in Arabic or French)            │
│         - phone (0X 10-digit) + optional second contact phone            │
│         - wilaya + commune (commune in French for Yalidine API)          │
│         - address with landmark ("near mosque", "in front of bank")      │
│         - product list + quantity                                        │
│         - COD amount (= subtotal — courier collects this)                │
│         - delivery mode: home or stop-desk + stopdesk_id                 │
│ 9:30  Run a phone-reputation / blacklist check (DZBuild auto-does this)  │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│ MIDDAY — CONFIRMATION CALLS (the #1 return-reduction lever)              │
├─────────────────────────────────────────────────────────────────────────┤
│ 10:00 Within 2 hours of order → call every customer                      │
│       Script:                                                            │
│       "Salam aleikum, ana min [store], nchri [product] b [price] DZD,    │
│        livraison l-[wilaya]. Waqtach yji courier? Sobh wla achia?"       │
│       Rule: Never dispatch an unconfirmed order                          │
│ 11:00 If no answer → WhatsApp: "Hello! Order [product] @ [price] DZD.    │
│       Reply 1 confirm, 2 cancel"                                         │
│ 12:00 Second call attempt after 24h, otherwise cancel                    │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│ AFTERNOON — SHIPPING                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ 13:00 For each confirmed order → create parcel via courier API           │
│       (Yalidine / ZR / Maystro — often multi-courier based on wilaya)    │
│ 13:30 Auto-generated waybill PDF → print in bulk                         │
│ 14:00 Pack products + attach waybill                                     │
│ 14:30 Courier driver arrives for pickup OR drop parcels at branch        │
│ 15:00 Push tracking number to customer via WhatsApp                      │
│         "Votre colis [tracking] partira ce soir, livraison dans 2-3 j"   │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│ EVENING — TRACKING + RETURNS + RECONCILIATION                            │
├─────────────────────────────────────────────────────────────────────────┤
│ 16:00 Courier status webhook flows back:                                 │
│         processing → shipped → delivered                                 │
│         OR → returned / cancelled (after 2-3 failed attempts)            │
│ 16:30 For deliveries → reconcile COD cash — courier holds cash, pays     │
│         seller weekly/bi-weekly via bank transfer / cheque / cash        │
│         (Yalidine: max 15 days per contract; in practice 3–14 days)      │
│ 17:00 For returns → inspect product, contact customer "we saw it came    │
│         back, reship?", flag repeat-returner phone numbers               │
│ 17:30 Update Excel / DZBuild / Maystro dashboard with return reasons     │
│ 18:00 Plan tomorrow's ad spend based on yesterday's ROAS                │
└─────────────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│ WEEKLY — ACCOUNTING                                                       │
├─────────────────────────────────────────────────────────────────────────┤
│ Reconcile courier remboursement transfers against delivered orders list  │
│ Discrepancies: missing cash, wrong amount collected, return-fee debits   │
│ Pay suppliers (China / Turkey sourced product → USD/TYR via informal hawala) │
│ Restock based on what sold + what got returned to inventory              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Critical Pain Points (Where SahelFlow Can Win)

1. **Manual order entry from WhatsApp / Instagram DM** — most Algerian sellers transact on chat, but no platform has a true WhatsApp-inbox → order parser. Sellers copy-paste customer info by hand.
2. **Confirmation calls are time-consuming** — every order, every day. AI voice agent + WhatsApp bot would be a killer feature.
3. **Remboursement reconciliation is a nightmare** — courier pays a single weekly bank transfer = sum of dozens of deliveries. Matching it back to per-order COD amount is manual.
4. **No good cross-courier comparison** — sellers use 2–4 couriers and pick per-order based on gut, not data.
5. **Return-rate analytics are weak** — most dashboards show top-line return %, not per-wilaya × per-product × per-courier matrices.
6. **Phone reputation is critical** but underbuilt — DZBuild has it; nobody else does.
7. **Abandoned-cart recovery** — 40 % of COD orders abandoned at address form; few sellers recover them.
8. **iOS app quality is bad** across the board (Maystro crashes, Yalidine doesn't have a serious one).
9. **Customer service at couriers is universally hated** — sellers want one neutral dashboard to fight disputes.
10. **Arabic-first UX is still inconsistent** — even DZBuild has Arabic↔French commune-name friction.

---

## 4. COD-Specific Feature Checklist — The Bar to Compete

A COD management tool for Algeria must have these to be **real competition**. Grouped by category; **(★) = table-stakes / non-negotiable**, **(☆) = differentiator**.

### 4.1 Order Management
- ★ Order creation: name, phone (10-digit auto-format), second contact phone, wilaya, commune, address + landmark, product list, COD amount, delivery mode
- ★ Arabic ↔ French commune-name resolution
- ★ Manual order entry (for WhatsApp/IG/FB orders)
- ★ Bulk import (CSV / Google Sheets sync)
- ★ Order statuses: pending → confirmed → shipped → delivered | refused | returned | cancelled
- ★ Bulk actions: bulk print, bulk ship, bulk cancel
- ★ Order timeline with every status change (audit trail)
- ☆ Soft-hold status for "couldn't reach customer, trying again"
- ☆ Exchange orders (when customer refuses one product, swaps for another) — Yalidine's `exchange` flag

### 4.2 Customer Management
- ★ Customer database (name, phone, address history)
- ★ Blacklist by phone / address / name
- ★ Per-customer return-rate / lifetime-value
- ☆ Phone Reputation Score (cross-order behavior score)
- ☆ Device fingerprinting (catch same-device / different-account fraud)
- ☆ Auto-blacklist after X returns in Y days
- ☆ "Repeat returner" flag in real-time at order entry

### 4.3 Courier Integration (Multi-Carrier)
- ★ Native API integration with **Yalidine** (parcels endpoint, waybill PDF, status webhooks)
- ★ Native integration with **ZR Express** (both legacy procolis + new API)
- ★ Native integration with **Maystro Delivery**
- ★ Native integration with **NOEST Express**
- ★ Native integration with **DHD Livraison Express**
- ★ Native integration with **EcoTrack**
- ★ Per-wilaya rate sync (home + stop-desk fees) — overridable per store
- ★ Stop-desk picker (name, address, phone, stopdesk_id per wilaya)
- ★ Waybill PDF generation + bulk printing
- ★ Tracking-number auto-pull from courier
- ★ Status webhook sync (processing → shipped → delivered / refused / returned)
- ☆ Multi-courier auto-selection (best coverage + best price + lowest return rate for that wilaya)
- ☆ Per-courier performance dashboard (delivery success %, return %, settlement days, return fees)
- ☆ Courier comparison side-by-side

### 4.4 COD-Specific Delivery Features (the stuff generic e-commerce tools miss)
- ★ Home delivery vs Stop-Desk choice at checkout
- ★ Stop-desk picker per wilaya (Yalidine requires stopdesk_id, will error if missing)
- ★ 2–3 delivery attempts before Return-To-Sender
- ★ RTS (Return-to-Sender) flow + return-fee tracking
- ★ Refused-order status + reason capture
- ★ Delivery-attempt counter per order
- ★ Pre-delivery WhatsApp alert (24h before)
- ★ Courier-side "customer not available" → re-attempt scheduling
- ☆ Delivery-window choice (morning/afternoon) offered during confirmation call
- ☆ Photo-on-delivery capture
- ☆ SMS tracking link to buyer

### 4.5 COD Cash Reconciliation
- ★ Per-order COD amount captured (= product subtotal, not including shipping)
- ★ Settlement-cycle tracking per courier (Yalidine 15d max, Maystro weekly, ZR variable)
- ★ Pending-cash ledger (delivered but not yet reimbursed)
- ★ Reconciled-cash ledger (matched to bank transfer)
- ★ Discrepancy flag (collected amount ≠ expected amount)
- ★ Return-fee debit reconciliation
- ☆ Auto-match bank transfer to delivered-orders list (amount-based fuzzy match)
- ☆ Per-courier "expected this week" forecast
- ☆ Cash-flow projection (when does the money actually arrive?)

### 4.6 Returns Management
- ★ Return status (auto from courier webhook after 3 failed attempts)
- ★ Return-reason capture (impulse / found cheaper / wrong expectation / not home / changed mind)
- ★ Return-shipping fee tracking per courier (Yalidine 200-250 DZD, etc.)
- ★ Returned-product restock workflow (most items are resellable)
- ★ Repeat-returner phone tracking
- ☆ Auto-reship offer to customer ("saw your package came back, reship?")
- ☆ Per-product return-rate alert (>30 % → review product page)

### 4.7 Confirmation & Customer Contact
- ★ 1-click WhatsApp confirmation (templated message with product photo, price, address, delivery ETA)
- ★ SMS fallback for non-WhatsApp customers
- ★ Scheduled follow-up for unanswered orders (24h, 48h, then auto-cancel)
- ★ Pre-delivery WhatsApp alert ("your package ships tomorrow")
- ☆ AI voice agent for confirmation calls (the CODRocket 2026 thesis)
- ☆ WhatsApp Business inbox unified with orders (chat → order parser)
- ☆ Abandoned-cart WhatsApp recovery (auto-triggered on incomplete address form)

### 4.8 Analytics & Reporting
- ★ Overall return rate
- ★ Return rate by wilaya
- ★ Return rate by courier
- ★ Return rate by product
- ★ Confirmation rate (and time-to-confirm)
- ★ Delivery success rate per courier
- ★ Avg delivery time per courier per wilaya
- ★ Cash collected vs pending vs reconciled
- ☆ Per-wilaya profit (revenue − delivery cost − return cost)
- ☆ Per-product margin after returns (the real number that matters)
- ☆ Customer lifetime value vs customer acquisition cost
- ☆ Facebook/TikTok ad-attribution to delivered orders (not just placed orders)
- ☆ Export to Google Sheets / Excel / PDF

### 4.9 Storefront / Multi-Channel Capture
- ★ Single-product landing-page builder (COD-style funnel)
- ★ Multi-product catalog store
- ★ COD order form (bypass checkout — name, phone, wilaya, commune, address only)
- ★ Wilaya picker with auto-calculated delivery fee shown upfront
- ★ Stop-desk picker
- ★ Mobile-first (70 % of Algerian ecommerce traffic is mobile, often on 3G)
- ★ Arabic + French UI
- ☆ Facebook Lead Form integration (auto-create order from FB lead)
- ☆ Instagram DM → order
- ☆ TikTok Shop integration
- ☆ Multi-store management (one dashboard for several storefronts)

### 4.10 Ad Tracking / Marketing
- ★ Multi-pixel tracking (Facebook, TikTok, Google, Pinterest, Snapchat)
- ★ Conversion API / Server-side tracking (past ad blockers)
- ★ "Delivered" event (not just "Purchase") — the real conversion in COD
- ☆ Retargeting lists based on delivered orders
- ☆ A/B testing on order form / upsells
- ☆ Upsells / downsells / quantity offers

### 4.11 Anti-Fraud / Anti-Fake-Order
- ★ OTP phone verification (SMS + WhatsApp)
- ★ IP blocking
- ★ Postal-code limits (block high-risk areas)
- ★ COD-unavailable for known-bad phones (blacklist at checkout)
- ☆ Device fingerprinting
- ☆ Phone Reputation Score (cross-store data sharing — Mystoq's FakeShield model)
- ☆ Acompte / partial advance (200–500 DZD via BaridiMob / Dahabia / bank transfer for orders > 3000 DZD)

### 4.12 Pricing / Currency
- ★ DZD-denominated pricing (no USD invoices)
- ★ Free tier (Algerian sellers are price-sensitive — see YouCan's $5K-free model)
- ★ Transparent per-order or per-month pricing in DZD
- ☆ Pay-on-delivery (take a cut of successful COD, not of placed orders) — seller-friendly alignment

### 4.13 Localisation / UX
- ★ Arabic + French (mandatory)
- ★ Arabic-first / RTL UI (most Algerian sellers operate in Arabic)
- ★ Wilaya picker (58 wilayas, including the post-2019 new ones)
- ★ Commune picker (1,469 communes)
- ★ Arabic ↔ French commune name resolution
- ★ Mobile-first design (test on slow 3G)
- ★ Offline-tolerant (network is unreliable)
- ☆ Darija (Algerian Arabic) microcopy — not MSA

### 4.14 Platform / Tech
- ★ Desktop + mobile (Algerian sellers do most work on phones — Maystro's lesson)
- ★ API for custom integrations
- ★ Webhooks for status updates
- ★ Data export (CSV/Excel)
- ☆ Self-hosted option (CODRocket offers this; appeals to privacy-conscious Algerian merchants)
- ☆ Privacy jurisdiction in Algeria (recent Yalidine breach allegation makes this relevant)

---

## 5. Pricing Landscape

### 5.1 Per-Delivery Courier Pricing (≈ 2026, in DZD)

| Courier | Algiers home | Wilaya home | Stop-desk |
|---|---|---|---|
| Yalidine | 400–500 | 500–700 | 300–400 |
| ZR Express | 400–600 | 500–750 | 300–450 |
| Maystro | 400–500 | 500–700 | 300–400 |
| EcoTrack | (lower than industry avg) | — | — |
| Procolis | 450–600 | 550–800 | 350–450 |
| Mylers | (premium urban) | — | — |
| Algérie Poste | 150–250 | 200–350 | — |

All couriers negotiate down at 100+ orders/day.

### 5.2 SaaS / Platform Pricing

| Platform | Model | Cost |
|---|---|---|
| **YouCan** | Free until $5K sales, then % transaction | $0 → small tx fee |
| **DZBuild** | Free tier + paid plans | Free → paid (DZD) |
| **Mystoq** | Subscription | 999 DZD/month, 60-day trial |
| **Shopify** | Subscription (USD) | $29–$399/month |
| **WooCommerce** | Free core + hosting + plugins | Hosting + 20–50K DZD/yr plugins |
| **Releasit COD** (Shopify app) | Free 60 orders, then sub | $0 / $9.99 / $29.99 / $69.99 |
| **EasySell COD** (Shopify app) | Free 60 orders, then sub | $0 / $9.95 / $24.95 / $59.95 |
| **Madgic COD** (Shopify app) | Sub | $7.99 unlimited |
| **Cirtasoft Yalidine plugin** | Annual | 20,000 DZD/yr (+19% VAT) |
| **Cirtasoft multi-pack** | Annual | 50,000 DZD/yr |
| **CODRocket** | SaaS + self-hosted | (custom) |
| **Leadivo** | SaaS | (custom) |
| **Yalidine/Maystro/ZR** | Per-delivery fee | Per parcel (see table above) |

### 5.3 Pricing Sensitivity Conclusions
- The free-tier threshold for Algerian sellers is **firm**: YouCan's "$5K-free" runway, DZBuild's "free to start, no credit card", Mystoq's 60-day trial — all confirm sellers will not pay upfront.
- Sellers are highly USD-averse (Shopify's $39/month = ~5,200 DZD at black-market rate, considered expensive).
- 999 DZD/month (Mystoq) is the cheapest paid tier observed — roughly the price of one delivered parcel; sellers will absorb this without blinking.
- 20–50 K DZD/year for Cirtasoft plugins is acceptable to established WooCommerce sellers but a barrier for new ones.
- The "pay-on-delivery" model (take a cut of successful COD, not placed orders) is **unexploited** — no major player does this. Sellers would love it because it aligns platform incentives with theirs.

---

## 6. Gaps & Opportunities for SahelFlow

SahelFlow is positioned as a desktop (Tauri) COD management app for Algerian sellers. The market research surfaces **concrete exploitable gaps**:

### 6.1 No True WhatsApp-Native Order Capture
**Gap:** Sellers receive 60–80 % of orders via WhatsApp / Instagram DM. Every existing tool requires manual transcription. YouCan, DZBuild, Maystro, Shopify-all-apps treat the storefront form as the primary order source — but in Algeria it isn't.
**SahelFlow opportunity:** Build a WhatsApp-inbox module that parses incoming messages into draft orders using LLM + Darija-aware extraction. Auto-reply with confirmation. This single feature would differentiate SahelFlow from every competitor.

### 6.2 AI Confirmation Calls Are the 2026 Frontier
**Gap:** CODRocket explicitly states "AI is replacing COD call centers in 2026" but their AI voice agent is still a blog thesis. No Algerian-local platform has shipped this.
**SahelFlow opportunity:** Ship a Darija-speaking AI voice agent (or WhatsApp bot) that auto-confirms orders within 2 hours — the single highest-leverage return-reduction intervention per DZBuild's data (cuts refusals 25–35 %).

### 6.3 Remboursement Reconciliation Is Universally Painful
**Gap:** Every seller struggles to match weekly bank transfers from couriers back to delivered-orders lists. DZBuild tracks pending cash but auto-matching is weak.
**SahelFlow opportunity:** A "reconciliation engine" that takes a bank-statement line + the courier's settlement report and auto-matches to delivered orders. Flag mismatches. This is a desktop-app-perfect workflow (heavy on local data manipulation).

### 6.4 Phone Reputation / Cross-Store Fraud Sharing
**Gap:** DZBuild has phone-reputation scoring but only within a single store. Mystoq's FakeShield is the only cross-store attempt. Sellers want a shared blacklist ("this phone returns 80 % of orders across 30 stores") — but no neutral aggregator exists.
**SahelFlow opportunity:** Opt-in shared phone-reputation registry across SahelFlow installs (privacy-preserving hash-based). The "Interpol for Algerian COD scammers" — would be a wedge feature.

### 6.5 Desktop-First Is Actually an Advantage
**Gap:** Every Algerian SaaS is mobile-app-first (Maystro, DZBuild, YouCan all have native mobile apps). But heavy workflows — bulk printing, accounting reconciliation, multi-courier rate comparison, large order grids — are painful on a 6-inch screen. Sellers do them anyway because there's no desktop alternative.
**SahelFlow opportunity:** Tauri desktop = real estate for power-user workflows: split-pane order grid + customer timeline + courier comparison; native print queue for bulk waybills; local SQLite for offline-first operation (network is unreliable); fast keyboard navigation. Position SahelFlow as "the operator's console" — complementary to mobile, not competitive.

### 6.6 Multi-Courier Auto-Selection with Real Data
**Gap:** Leadivo and DZBuild advertise multi-courier but the routing logic is basic (seller preference + coverage). No platform uses actual per-wilaya × per-courier delivery-success-rate × return-rate × price matrix to auto-pick.
**SahelFlow opportunity:** Build a routing engine that, for each new order, computes expected net margin per courier (price − expected return cost − expected RTS fee) and routes to the highest-margin one. This is real, defensible, quantifiable value.

### 6.7 Arabic-First, Darija-Aware UX
**Gap:** Most platforms are French-first with Arabic as translation. Maystro's reviews show language friction (commune names must be in French for the Yalidine API). Sellers think in Darija.
**SahelFlow opportunity:** Darija microcopy, Darija TTS for the AI agent, Darija OCR for parsing WhatsApp screenshots. Be the only platform that feels native.

### 6.8 Pay-on-Delivery Pricing Model
**Gap:** Every SaaS charges per-month or per-order-placed. Sellers hate paying for orders that get returned. Nobody charges per-delivered-order.
**SahelFlow opportunity:** Pricing model = "X DZD per successfully delivered order, first 50 free". Aligns platform incentive with seller. Would be a marketing wedge.

### 6.9 Privacy / Data Sovereignty
**Gap:** Reddit alleged Yalidine was breached (123 GB data listed for sale). Cloud-hosted SaaS platforms hold all seller customer data on their servers. Algerian sellers are increasingly wary.
**SahelFlow opportunity:** Tauri desktop = local SQLite by default. Seller's customer data never leaves their machine. Sync is opt-in and encrypted. This is a real differentiator that the SaaS players can't match without re-architecting.

### 6.10 The "Confirmation Call Center as a Service" Gap
**Gap:** Maystro has an in-house call center (their differentiator) but it's only for Maystro customers and only for Maystro parcels. Independent sellers using multiple couriers have no neutral call-center service.
**SahelFlow opportunity:** Offer (as a paid add-on) a network of human confirmation-call agents, triggered from the SahelFlow dashboard, working across all couriers. Or — the AI version of this — replace the humans with Darija TTS+STT.

---

## 7. Sources (All URLs Read or Referenced)

### Competitor homepages / docs
- https://yalidine.app
- https://yalidine-express.com.dz
- https://yalidine-express.com.dz/nos-agences
- https://yalidine.app/app/conditions_transport.php
- https://maystro-delivery.com
- https://dzbuild.com
- https://dzbuild.com/docs/couriers/yalidine
- https://dzbuild.com/docs/couriers/zr-express
- https://dzbuild.com/blog/shipping-companies-algeria
- https://dzbuild.com/blog/ecommerce-platforms-algeria
- https://dzbuild.com/blog/cod-best-practices
- https://dzbuild.com/blog/reduce-cod-return-rate-algeria
- https://youcan.shop
- https://youcan.shop/en/blog/posts/youcan-ship
- https://shop.youcan.com.tr
- https://mystoq.com/en/answers/best-ecommerce-platform-algeria
- https://www.leadivo.app/blog/best-delivery-companies-algeria
- https://codrocket.com/blog
- https://www.cirtasoft.com/yalidine-plugin/en
- https://www.cirtasoft.com/zr-express-plugin/en
- https://dhd-dz.com
- https://www.facebook.com/dhdlivraisonexpress10
- https://trackdz.com/carriers/dhd
- https://www.releas.it

### App Store / Play Store listings (with reviews)
- https://apps.apple.com/dz/app/maystro-partners/id1516638852
- https://apps.apple.com/dz/app/maystro-drivers/id1546512127
- https://play.google.com/store/apps/details?id=com.maystro.store
- https://play.google.com/store/apps/details?id=com.maystro.agents
- https://play.google.com/store/apps/details?id=com.prodelivery  (ZR Express)
- https://play.google.com/store/apps/details?id=com.dhddz.driver
- https://play.google.com/store/apps/details?id=com.dhddz.seller
- https://play.google.com/store/apps/details?id=com.dzbuild.app
- https://apps.apple.com/us/app/dhd-expediteur/id6742082924
- https://apps.apple.com/sa/app/youcan-shop/id1485859147
- https://apps.shopify.com/releasit-cod-order-form
- https://apps.shopify.com/easy-order-form
- https://apps.shopify.com/mt-cod-form  (Madgic COD)
- https://apps.shopify.com/cash-on-delivery-fee  (Releasit COD Fee)
- https://apps.shopify.com/quick-cod-order-form  (MIT Quick COD)

### Shopify COD / WooCommerce COD
- https://woocommerce.com/document/cash-on-delivery
- https://fr.wordpress.org/plugins/wc-smart-cod
- https://help.gempages.net/articles/v7-releasit-cod-form-upsells
- https://help.gempages.net/articles/easysell-cod-form-upsells
- https://carthook.com/blogs/compare/shopify-upsell-and-cross-sell-apps-easysell-cod-form-upsells-vs-slide-cart-sticky-add-to-cart
- https://shopcircle.co/products/releasit-cod-order-form
- https://community.shopify.com/t/how-do-cod-apps-like-releasit-easysell-create-orders-directly-without-shopify-checkout/585341

### Reddit / community
- https://www.reddit.com/r/algeria/comments/129naah/requesting_some_info_about_yalidine
- https://www.reddit.com/r/algeria/comments/12f0lco/about_yalidine_and_zr_express
- https://www.reddit.com/r/algeria/comments/1gc4zz3/which_delivery_company_is_the_best
- https://www.reddit.com/r/algeria/comments/17rigmu/cash_on_delivery_cod
- https://www.reddit.com/r/algeria/comments/18n4npy/what_s_the_best_company_for_delivery_in_algeria
- https://www.reddit.com/r/algeria/comments/1mz0les/best_delivery_company_for_ecommerce_in_algeria
- https://www.reddit.com/r/shopify/comments/1mk2yzv/do_i_really_need_a_cod_form_app_for_my_store
- https://www.facebook.com/groups/1359379725001804  (delivery complaints group)
- https://www.facebook.com/yalidine
- https://www.facebook.com/nordetouest  (NOEST Express)

### Press / analysis
- https://www.wearetech.africa/en/fils-uk/solutions/algerian-firm-yalidine-targets-e-commerce-growth-with-delivery-solutions
- https://www.f6s.com/software/dzbuild
- https://fr.trustpilot.com/review/dzbuild.com
- https://trends.builtwith.com/shop/country/Algeria
- https://github.com/DZBuild-com
- https://github.com/PiteurStudio/CourierDZ
- https://github.com/sebbahali/Yalidine-Dz-Laravel-Api
- https://www.linkedin.com/posts/azzedine-guessoum-moussaoui-11236322b_beyond-logistics-why-yalidine-should-bridge-activity-7451265946805268480-T4OH
- https://fr.scribd.com/document/807174621/Contrat-Client-100351004-FR (Yalidine contract)
- https://promochoclebonprix.com/wp-content/uploads/2025/06/conditions_transport.php_.pdf (Yalidine transport conditions)
- https://yaxii.dev/blog/woocommerce-shipping-algeria-wilaya-commune
- https://dz.linkedin.com/company/maystro-delivery
- https://www.hulkapps.com/products/shopify-yalidine-express-algeria-app-integration
- https://discover.commoninja.com/shopify/app/yalidine
- https://www.fiverr.com/kamu01/build-youcan-shop-for-ecommerce-dropshipping-and-cod

---

## 8. Quick-Reference Competitor Matrix

| Feature | Yalidine | Maystro | ZR Express | DHD | YouCan | DZBuild | Mystoq | Leadivo | CODRocket | Cirtasoft plugin | Releasit/EasySell (Shopify) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Storefront builder | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | (Woo) | (Shopify) |
| Order management | ✓ (own parcels) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | sync | ✓ |
| Multi-courier API | ✗ (Yalidine only) | ✗ (Maystro only) | ✗ (ZR only) | ✗ | via YouCan Ship | ✓ (Yalidine/ZR/Maystro/NOEST/EcoTrack) | ✓ (Yalidine) | ✓ (Yalidine/EcoTrack/ZR/Mylers) | ✓ | per-courier plugin | ✗ |
| COD cash reconciliation | ✓ | ✓ | ✓ | ✓ (step-by-step) | limited | ✓ | ✓ | ✓ | ✓ | via Woo | ✗ |
| Stop-desk support | ✓ (largest) | ✓ (Locomotive) | ✓ | ? | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| Phone reputation | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ (FakeShield) | ✗ | ✓ | ✗ | ✓ (OTP/IP) |
| WhatsApp confirmation | manual | manual | manual | manual | ✗ | ✓ (1-click) | limited | limited | ✓ (blog) | ✗ | ✓ (via OTP) |
| Abandoned-cart recovery | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ? | ? | ✓ | ✗ | ✓ |
| Return-rate analytics (per wilaya × product × courier) | basic | advanced dashboard | basic | basic | ✗ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| AI confirmation call agent | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | thesis | ✗ | ✗ |
| Arabic-first / RTL | partial | ✓ | partial | ✓ | ✓ | ✓ | ✓ (Arabic-first) | partial | ✓ | partial | partial |
| DZD pricing | ✓ | ✓ | ✓ | ✓ | ✗ (USD/%) | ✓ | ✓ (999 DZD/mo) | ? | ? | ✓ (DZD/yr) | ✗ (USD) |
| Free tier | ✗ (per-delivery) | ✗ (per-delivery) | ✗ (per-delivery) | ✗ | ✓ ($5K free) | ✓ | ✓ (60-day trial) | ? | ✓ | ✗ | ✓ (60 orders/mo) |
| Desktop app | ✗ (web only) | ✗ (mobile only) | ✗ | ✗ | ✗ | ✗ (web + Android) | ✗ | ✗ | ✗ (self-host option) | ✗ | ✗ |
| Mobile app | ✓ | ✓ (RN) | ✓ | ✓ | ✓ | ✓ (Android) | ? | ? | ? | ✗ | ✗ |
| Multi-store management | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (shipped Apr 2026) | ? | ? | ✓ | ✗ | ✗ |
| AI voice / TTS for Darija | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Local SQLite / offline | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (self-host = server) | ✗ | ✗ |
| Open source / OSS | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Privacy / data sovereignty | cloud | cloud | cloud | cloud | cloud | cloud | cloud | cloud | self-host option | self-host (on seller's WP) | cloud |

**SahelFlow's empty quadrant (where nobody sits):** Desktop-first × local-SQLite × DZD-pricing × WhatsApp-native × AI-Darija-confirmation × multi-courier-with-smart-routing × phone-reputation-shared × pay-on-delivered-order. None of the existing competitors combine even three of these.

---

*End of R-1 findings document.*
