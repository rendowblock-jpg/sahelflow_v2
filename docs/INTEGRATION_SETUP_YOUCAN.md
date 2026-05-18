# YouCan Integration Setup Guide

## Overview

Connect your YouCan store to SahelFlow — Algeria's fastest-growing e-commerce platform.

---

## Step 1: Get Your YouCan Credentials

1. Log in to your **YouCan Seller Area**
2. Go to **Settings → API**
3. Generate an **Access Token**
4. Copy your **Store URL** (e.g., `https://my-store.youcan.shop`)
5. (Optional) If you want webhook signature verification, note your OAuth Client Secret

---

## Step 2: Connect in SahelFlow

1. Open SahelFlow → **Settings → Integrations**
2. In the **Catalog Sync** section, find the YouCan card 🇩🇿
3. Enter:
   - **Store URL**: full YouCan URL
   - **Access Token**: from Step 1
   - **Webhook Secret** (optional): for HMAC verification
4. Click **Save Credentials**

---

## Step 3: Sync Products

1. Click **Start Sync**
2. SahelFlow fetches your YouCan product catalog
3. Products matched by name — updates existing, creates new

---

## Step 4: Set Up Order Webhook

1. In SahelFlow, copy your **Webhook URL**
2. In YouCan Seller Area, go to **Settings → Webhooks** (or API settings)
3. Add a webhook:
   - **Event**: Order created
   - **URL**: paste your SahelFlow Webhook URL
4. Save

---

## How It Works

| Event               | Action                                                             |
| ------------------- | ------------------------------------------------------------------ |
| New order on YouCan | SahelFlow creates a pending order with items, total, delivery cost |
| Shipping cost       | Extracted from `shipping.price`                                    |
| Duplicate order     | Blocked by `external_id` deduplication                             |

---

## Troubleshooting

| Issue                | Solution                                                  |
| -------------------- | --------------------------------------------------------- |
| "YouCan API error"   | Verify access token is active and store URL is correct    |
| "Must use HTTPS"     | Ensure store URL starts with `https://`                   |
| Products not syncing | Check that products are published on YouCan               |
| Webhook not firing   | Verify webhook URL is reachable (use Test Webhook button) |

---

_Last updated: 2026-05-11_
