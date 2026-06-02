# 🇩🇿 Algerian E-Commerce Bible — SahelFlow Knowledge Base

> **Source**: Full course transcript by leading Algerian e-commerce practitioners  
> **Distilled**: 2026-04-08 | 80,000+ words → Actionable intelligence  
> **Purpose**: Foundation rules for every SahelFlow feature, automation, and AI decision

---

## 1. The Algerian COD Market — Business Reality

### 1.1 Cash on Delivery is King

- **100% COD**: The Algerian market runs on cash-on-delivery (الدفع عند الاستلام)
- **No online payment**: No Stripe, no PayPal for end consumers — this is non-negotiable
- **Trust deficit**: Customers don't trust online merchants; COD removes that barrier
- **Consequence for SahelFlow**: Every order flow MUST assume COD. Payment collection happens at delivery, not checkout.

### 1.2 The Delivery Ecosystem

- **Multiple delivery companies**: Yalidine, ZR Express (Procolis), Maystro, EcoTrack, etc.
- **58 wilayas**: Algeria has 58 provinces, each with different delivery costs and timelines
- **Home delivery (à domicile) vs Stop desk (point de retrait)**
  - à domicile = ~100-200 DZD more expensive
  - Stop desk = cheaper but customer must pick up
- **Express shipping available**: Companies like ZR Express offer air freight (الشحن الجوي)
- **Delivery confirmation rate is CRITICAL**: A 70-80% delivery rate is considered good
- **Returns/refusals are expected**: 15-30% return rate is normal in Algeria

### 1.3 Key Financial Metrics

| Metric                        | Algerian Market | Target            |
| ----------------------------- | --------------- | ----------------- |
| **Confirmation rate**         | 60-80%          | ≥70% is healthy   |
| **Delivery rate**             | 60-75%          | ≥70% is goal      |
| **Return rate**               | 15-30%          | ≤20% is excellent |
| **Cost per order (Facebook)** | 1.5-3 USD       | ≤2 USD is great   |
| **Cost per order (TikTok)**   | 0.5-2 USD       | ≤1.5 USD is great |
| **CPM (TikTok)**              | 0.2-0.8 USD     | ≤0.5 is ideal     |
| **CTR**                       | Varies          | ≥0.8% minimum     |

---

## 2. Product Research — What Wins in Algeria

### 2.1 Winning Product Categories (by profitability)

1. **Compléments alimentaires** (Dietary supplements) — Highest margins, 40K→300K+ DZD
2. **Cosmétique** (Cosmetics/Skincare) — Production cost ~40K, sell 300-400K
3. **Vêtements/Fitment** (Clothing) — Local production possible, brand-able
4. **Gadgets/China imports** — Margin ~30K→190K, fast turnover
5. **Electronics accessories** — Smartwatches, phone cases, etc.

### 2.2 Product Sourcing Methods

1. **China direct**: Via 1688.com, AliExpress, contact factories
   - Shipping via sea (بري) or air (جوي)
   - Minimum ~500 units for cost efficiency
   - Product cost can be as low as 0.73 EUR per unit
2. **Local production (White Label)**:
   - Supplements: Use white-label labs (like Orali)
   - Cosmetics: Local labs can produce custom formulations
   - Clothing: Local ateliers/factories (العلمة, بابا حسن, البرج, قسنطينة)
3. **El Ouma/La Sigma market research**:
   - Visit wholesale markets in person with PiPi Ads on your phone
   - Search by image to check if products have active ad campaigns

### 2.3 PiPi Spy Product Research Method

The transcript describes a specific methodology:

1. Open PiPi Spy → Bibliothèque de Produits
2. Filter by: Last 24h, min 5 active ads
3. Look for products with high ad count = proven winner
4. Check the shop's other products for additional opportunities
5. Use image search to find China price (1688/AliExpress)
6. Cross-reference with PiPi Ads for creative inspiration
7. Track boutiques that consistently launch winning products

---

## 3. Pricing Strategy — The Golden Rules

### 3.1 Pricing Formula

```
Product Cost = Raw material/purchase + Shipping + Packaging
Selling Price = Product Cost + Marketing Cost + Desired Profit
```

### 3.2 The Breakeven Rule

- **Always calculate minimum viable price**: What's the lowest you can sell while still profitable?
- **Factor in**: confirmation rate, delivery rate, return rate, ad cost
- **Example from transcript**:
  - Supplement: Cost 30K DZD → Sell at 190K DZD (6x markup)
  - Cosmetic: Cost 40K → Sell at 300-400K (7-10x markup)
  - Clothing: Cost 130K → Sell at 380K (3x markup — lower but more volume)

### 3.3 Price Testing

- **Always test multiple prices**: e.g., 290, 240, 190 DZD
- **290 DZD**: Higher margin, fewer orders, higher confirmation
- **190 DZD**: Lower margin, more orders, potentially lower confirmation
- **The sweet spot**: Most sellers find 240-290 works best for supplements/cosmetics

### 3.4 The Upsell/Cross-sell Engine

This is CRITICAL for SahelFlow's automation:

- **Upsell (الابسيل)**: Offer larger quantity at discount during confirmation
  - "If you buy 2 boxes, you save X DZD and it lasts a full month"
  - Single box: 100K profit → 2 boxes: 190K profit → 3 boxes: 280K profit
- **Cross-sell (كروسيل)**: Offer complementary products
  - Creatine buyer → offer shaker as free gift
  - Skincare buyer → offer complementary serum
- **NEVER force**: Always propose gently, never pressure

---

## 4. Confirmation Workflow — The Heart of Algerian E-Commerce

> [!IMPORTANT]
> **This is the most critical section for SahelFlow.** In Algeria, order confirmation is not automatic — it's an active process that determines whether an order gets shipped or cancelled.

### 4.1 The Confirmation Call Script

The standard confirmation flow (what SahelFlow's automation MUST mirror):

```
1. GREETING: "السلام عليكم مسيو/مدام [NAME]"
2. IDENTIFY: "معك لاارك [BRAND NAME]"
3. CONFIRM PRODUCT: "عندك كوموند على [PRODUCT]"
4. CONFIRM ADDRESS: "عيطنالك باش نكونفيرميو لادريس باش نبعتولك لاكوموند"
5. GET ADDRESS: Customer provides wilaya + commune + exact address
6. DELIVERY TYPE: "تحبها ادوميسيل ولا ستوب ديسك؟"
7. UPSELL (optional): "لو كان تدي دو بواط راح تشدلك اكتر..."
8. CLOSE: "لا كوموند تاعك كونفيرمي، راح تلحقك [DATE]"
```

### 4.2 Confirmation Statuses (for SahelFlow)

| Status                       | Meaning                            | SahelFlow Action               |
| ---------------------------- | ---------------------------------- | ------------------------------ |
| **Confirmé (كونفيرمي)**      | Customer confirmed order           | → Inject to delivery           |
| **Annulé (انولي)**           | Customer cancelled                 | → Mark cancelled, track reason |
| **Rappel (غابيل)**           | Customer unavailable, call back    | → Schedule retry               |
| **En attente**               | Waiting for customer response      | → Auto-retry in 24h            |
| **Doublon (دوبل)**           | Duplicate order from same customer | → Merge or cancel              |
| **Faux numéro (فو نيميرو)**  | Wrong phone number                 | → Flag as fake lead            |
| **Boîte vocale (بوا فوكال)** | Voicemail, no answer               | → Retry 2-3 times              |

### 4.3 Fake Order Detection Signals

These MUST feed into SahelFlow's risk engine:

- **Faux commande (فوس كوموند)**: Customer orders with no intention to receive
- **Duplicate orders**: Same phone → multiple orders across sellers
- **Phone unreachable**: Goes to voicemail repeatedly
- **Wrong address**: Provides non-existent commune/wilaya
- **History check**: Previous returns from same customer
- **Max return rate threshold**: If >15% returns from a region, flag it
- **"Rappel" pattern**: Customer keeps saying "call me later" = likely fake

### 4.4 Post-Delivery Follow-up

- **Confirm receipt**: Call/message after delivery to verify satisfaction
- **Get feedback**: "اسك راك ساتيسفي من البرودوي؟" (Are you satisfied?)
- **Handle issues**: If wrong item/damaged → arrange replacement
- **Build loyalty**: Satisfied customers → recommend to friends/family
- **Repeat business**: Use data to re-engage past buyers with new products

---

## 5. Marketing & Creatives — What Works in Algeria

### 5.1 Creative Types That Convert

1. **UGC (User Generated Content) — "الاكلي"**: Person talking naturally to camera
   - Spontaneous, no heavy editing
   - Shot in natural environment (home, car, street)
   - Person speaks with CONFIDENCE (كونفيونس)
   - **This is the #1 performer in Algeria**

2. **Professional (البرو)**: Studio shot with script
   - Requires script, editing, professional setup
   - Uses: Problem → Solution → Action formula
   - Good for brand building, not always best for conversion

3. **Influencer Content**: Known faces using the product
   - **Medical professionals** for supplements → highest trust
   - **Pharmacists** for cosmetics → strong credibility
   - **Micro-influencers** (not mega-famous) → most authentic

### 5.2 The Script Formula (PSA)

Every creative MUST follow:

```
1. HOOK (الهوك) — 3-4 seconds: Grab attention
   "سي اوكي تكون مقلق ولا كاين ياماتش ماراكش..."

2. BODY (البودي): Explain the product
   Problem → Solution → Benefits

3. ACTION (اكشن): Tell them what to do
   "بعتلنا ميساج" or "اطلب من السيت تاعنا"
```

### 5.3 TikTok vs Facebook Strategy

| Platform     | Best For                    | CPM Range   | Testing Budget   |
| ------------ | --------------------------- | ----------- | ---------------- |
| **TikTok**   | Lead gen, younger audience  | 0.2-0.8 USD | 15-35 USD/day    |
| **Facebook** | Retargeting, older audience | Variable    | 15-35 USD/day    |
| **Both**     | Maximum reach               | Combined    | Scale separately |

### 5.4 TikTok Symphony (AI Creatives)

- TikTok's built-in AI tool for generating creatives
- Provide: product images, product info, voiceover text
- It generates: multiple video variations automatically
- Advantage: Reduces creative fatigue, scales faster
- Can mix AI-generated voiceover with manual footage

### 5.5 Angle Marketing (ليزونغل ماركيتين)

Different "angles" to target different audiences:

- **Students**: "Exam stress → supplement helps focus"
- **Workers**: "Work stress → supplement helps relax"
- **Parents**: "Parenting exhaustion → supplement restores energy"
- **Athletes**: "Recovery → supplement aids muscle repair"

**Each angle gets its own creative set and ad group.**

---

## 6. Scaling Strategy — From 10 to 1000 Orders/Day

### 6.1 Testing Phase

1. Launch 3 campaigns: Smart + Manual
2. Each campaign: 4-5 different creatives
3. Budget: 15-35 USD per campaign
4. Wait 24-48 hours for data
5. Identify winner creatives and angles

### 6.2 Scaling Rules

| Scenario                 | Action                                         |
| ------------------------ | ---------------------------------------------- |
| Cost per order < target  | **Scale up**: Increase budget 20% daily        |
| Cost per order = target  | **Maintain**: Keep running, duplicate campaign |
| Cost per order > target  | **Scale down**: Reduce budget 30% daily        |
| Cost per order >> target | **Kill**: Stop campaign, new creatives needed  |

### 6.3 Advanced Scaling

1. **Multiple ad accounts**: Use 2-3 accounts, each running campaigns
2. **Teams of media buyers**: Each manages their own accounts
3. **Audience exclusion**: Exclude people who saw ads 6+ seconds but didn't buy
4. **Creative refresh**: Winner creatives → create 4-5 variations (different hooks, same body)
5. **Retargeting**: Re-show ads to people who visited site but didn't order
6. **Custom audiences**: Target past buyers with new products (cross-sell)

### 6.4 Automation Rules (TikTok/Facebook)

```
Rule 1 — SCALE UP:
  IF daily_cost < max_CPA AND daily_orders > 50
  THEN increase_budget(+20%)

Rule 2 — SCALE DOWN:
  IF daily_cost > max_CPA
  THEN decrease_budget(-30%)

Rule 3 — KILL:
  IF daily_cost > 2x max_CPA
  THEN pause_campaign()
```

---

## 7. Order Management (جيستيون دي كوموند) — Google Sheets System

### 7.1 The Standard Google Sheet Structure

This is how most Algerian sellers manage orders (what SahelFlow must digitize):

| Column       | Content                             | Notes              |
| ------------ | ----------------------------------- | ------------------ |
| Date         | Order date                          | Auto from form     |
| Client Name  | Customer name                       | From confirmation  |
| Phone        | Phone number (format: 05XX or 07XX) | Validated          |
| Wilaya       | Province (58 options)               | Dropdown           |
| Commune      | City/town                           | Free text          |
| Address      | Full delivery address               | From confirmation  |
| Product      | Product ordered                     | Dropdown           |
| Quantity     | Number of items                     | Integer            |
| Size/Variant | If applicable                       | Dropdown           |
| Price        | Total price                         | Auto-calculated    |
| Status       | Confirmation status                 | Dropdown (see 4.2) |
| Delivery     | Delivery method                     | Domicile/Stop desk |
| Delivery Co  | Which delivery company              | Auto or manual     |
| Tracking     | Tracking number                     | After injection    |
| Notes        | Any special notes                   | Free text          |

### 7.2 iSar Google Sheet Integration

- The course specifically mentions **iSar Manager** for connecting TikTok lead forms to Google Sheets
- This is exactly what SahelFlow's automation engine replaces
- Key advantage SahelFlow offers: **No data loss between form and sheet** (a common problem with other tools)

### 7.3 Delivery Injection Flow

1. Confirm order
2. Prepare delivery label (colis)
3. Inject into delivery company system (Yalidine, ZR Express, Maystro, etc.)
4. Get tracking number
5. Notify customer: "طرد تاعك خرج، نيميرو تاع التتبع: [NUMBER]"
6. Follow up on delivery status

---

## 8. Brand Building (لاارك/البراند) vs Quick Sales

### 8.1 Quick Sales (Gadget/China)

- Test product → if works → scale → extract profit → move to next
- No long-term brand investment
- Higher risk of ad fatigue
- Typical lifespan: 1-3 months per product

### 8.2 Brand Building (The Goal)

- **Local production** (supplements, cosmetics, clothing)
- **Influencer partnerships** as brand ambassadors
- **Repeat customers** through quality and follow-up
- **Wholesale distribution** (pharmacies, retail stores)
- **Lifetime Value focus**: One customer = 7+ purchases over 2 years

### 8.3 Local Production Advantages

1. **Low cost**: Supplements at 40K DZD, sell at 300K+
2. **Full control**: Quality, inventory, timing
3. **Scalability**: Can do wholesale once demand proven
4. **Brand value**: "Made in Algeria" or custom-branded

---

## 9. SahelFlow Integration Points

### 9.1 What SahelFlow Automates

Based on the transcript, these are the manual processes sellers struggle with, now fully implemented in SahelFlow v2:

| Process                       | SahelFlow Feature                       | Status             |
| ----------------------------- | --------------------------------------- | ------------------ |
| Confirmation calls            | Smart Confirmation Sequences (WhatsApp) | ✅ **Implemented** |
| Order data entry              | Auto-capture from WhatsApp/Forms        | ✅ **Implemented** |
| Delivery injection            | One-click inject to delivery companies  | ✅ **Implemented** |
| Fake order detection          | AI Risk Engine                          | ✅ **Implemented** |
| Upsell during confirmation    | Automated upsell in confirmation flow   | ✅ **Implemented** |
| Google Sheet management       | Full dashboard replacement              | ✅ **Implemented** |
| Creative performance tracking | Analytics dashboard                     | ✅ **Implemented** |
| Customer follow-up            | Post-delivery automation                | ✅ **Implemented** |
| Duplicate detection           | Phone-based dedup across orders         | ✅ **Implemented** |
| Return management             | Return workflow automation              | ✅ **Implemented** |

### 9.2 Risk Engine Calibration (from transcript data)

The AI risk engine should weigh these factors:

1. **Phone number validity**: Must be valid Algerian format (05XX, 06XX, 07XX)
2. **Wilaya reputation**: Some wilayas have higher return rates (mentioned: regional profiles)
3. **Customer history**: Repeat buyers = low risk, serial returners = high risk
4. **Order value**: Unusually high quantities = suspicious
5. **Confirmation behavior**: "Rappel" multiple times = likely fake
6. **Voicemail pattern**: Goes to voicemail consistently = suspicious
7. **Duplicate phone**: Same number ordering from multiple sellers = flag

### 9.3 Confirmation Templates (Darija)

SahelFlow's WhatsApp confirmation sequences should use these proven templates:

**Initial Confirmation:**

```
السلام عليكم [NAME] 👋
معك [BRAND] 🏪
عندك كوموند على [PRODUCT]
عيطنالك باش نكونفيرميو لادريس ديالك 📦
وشنو هي الولايه والبلديه باش نبعتولك الكوموند؟
```

**After Address Confirmed:**

```
تمام [NAME] ✅
الكوموند تاعك كونفيرمي
[PRODUCT] × [QTY]
📍 [WILAYA] - [COMMUNE]
💰 [PRICE] دينار
🚚 التوصيل: [DELIVERY_TYPE]
راح تلحقك في [ESTIMATED_DATE] 📅
```

**Upsell Message:**

```
مسيو/مدام [NAME] 💡
كي تدي [QUANTITY+1] [PRODUCT]
راح تشدلك [DURATION] كامل
وراح يكون عندك تخفيض تاع [DISCOUNT] دينار 🎉
تحب نزيدلك؟
```

**Delivery Notification:**

```
[NAME] 📦
الطرد تاعك خرج اليوم!
نيميرو التتبع: [TRACKING]
التوصيل: [ESTIMATED_DELIVERY]
للاستفسار عيطونا على [PHONE] 📞
```

---

## 10. Key Vocabulary (Darija ↔ French ↔ SahelFlow)

| Darija         | French           | English                     | SahelFlow Field       |
| -------------- | ---------------- | --------------------------- | --------------------- |
| كوموند         | Commande         | Order                       | `orders` table        |
| كليون          | Client           | Customer                    | `customers` table     |
| كونفيرمي       | Confirmé         | Confirmed                   | `order.status`        |
| انولي          | Annulé           | Cancelled                   | `order.status`        |
| ليفريزون       | Livraison        | Delivery                    | `delivery`            |
| ادوميسيل       | À domicile       | Home delivery               | `delivery_type`       |
| ستوب ديسك      | Stop desk        | Pickup point                | `delivery_type`       |
| كوست           | Coût             | Cost per order              | `analytics`           |
| فايده          | Profit           | Profit/margin               | `analytics`           |
| بروداكت ريسيرش | Product Research | Product research            | N/A                   |
| كرياتيف        | Créatif          | Ad creative                 | N/A                   |
| تيست           | Test             | A/B test                    | N/A                   |
| سكيلينغ        | Scaling          | Scaling ads                 | N/A                   |
| ابسيل          | Upsell           | Upsell                      | `order_items`         |
| كروسيل         | Cross-sell       | Cross-sell                  | `order_items`         |
| محروقين        | Brûlés           | Burned/fatigued (creatives) | N/A                   |
| وينر           | Winner           | Winner product/creative     | N/A                   |
| ليد            | Lead             | Lead (potential customer)   | `leads`               |
| فو كوموند      | Fausse commande  | Fake order                  | `risk_score`          |
| غابيل          | Rappel           | Callback needed             | `confirmation_status` |
| بوا فوكال      | Boîte vocale     | Voicemail                   | `confirmation_status` |
| دوبل/دوبلون    | Doublon          | Duplicate                   | `duplicate_detection` |
| ريتور          | Retour           | Return                      | `order.status`        |
| ستوك           | Stock            | Inventory                   | `products.stock`      |
| بري            | Prix             | Price                       | `products.price`      |
| البراند        | Brand            | Brand                       | `seller.brand`        |
| ماركه          | Marque           | Brand/Mark                  | `seller.brand`        |
| لاشين          | La Chine         | China (sourcing)            | N/A                   |
| جمله           | Gros/En gros     | Wholesale                   | N/A                   |

---

## 11. Critical Business Rules for SahelFlow

> [!CAUTION]
> These rules come directly from real Algerian e-commerce operations. Breaking any of them will cause the platform to fail in the local market.

1. **Never auto-send orders to delivery without confirmation** — Always require human or AI confirmation first
2. **Always validate phone numbers** — Must be valid Algerian mobile (05, 06, 07 prefix)
3. **Always ask for wilaya AND commune** — Wilaya alone is insufficient for delivery
4. **Track confirmation rates per product** — Low confirmation = bad product or bad targeting
5. **Track delivery rates per wilaya** — Some regions are notoriously difficult
6. **Support both domicile and stop desk** — Customer must choose
7. **Enable upsell/cross-sell in confirmation** — This is where major revenue comes from
8. **Detect and flag duplicate orders** — Same phone = likely duplicate
9. **Handle "rappel" (callback) properly** — Must retry 2-3 times before marking as failed
10. **Post-delivery follow-up is mandatory** — For feedback, returns, and repeat business
11. **Never show product as "free" or "sponsored"** — Algerian consumers see through fake claims
12. **Support Darija + French in all customer-facing content** — Never use Modern Standard Arabic
13. **Price must ALWAYS include delivery cost** — Show total DZD upfront
14. **Return reasons must be categorized** — Was it: wrong product, damaged, customer changed mind, etc.?
15. **Stock management must be real-time** — Over-selling creates massive trust issues

---

_This document is the single source of truth for how Algerian e-commerce works. Every SahelFlow feature, automation recipe, AI prompt, and business rule should be validated against these realities._
