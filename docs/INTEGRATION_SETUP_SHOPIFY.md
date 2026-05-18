# Shopify Integration Setup Guide

## Overview

Connect your Shopify store to SahelFlow to automatically import products and receive order notifications via webhooks.

---

## Step 1: Get Your Shopify Credentials

1. Log in to your **Shopify Admin**
2. Go to **Settings → Apps and sales channels → Develop apps**
3. Click **Create an app** → name it "SahelFlow"
4. Go to **Configuration** and enable these API scopes:
   - `read_products`
   - `read_orders`
5. Click **Install app**
6. Copy the **Admin API access token** (starts with `shpat_`)

---

## Step 2: Connect in SahelFlow

1. Open SahelFlow → **Settings → Integrations**
2. In the **Catalog Sync** section, find the Shopify card
3. Enter:
   - **Store URL**: your `.myshopify.com` domain (e.g., `my-store.myshopify.com`)
   - **Admin API Token**: the token from Step 1
4. Click **Save Credentials**

---

## Step 3: Sync Products

1. Click **Start Sync**
2. SahelFlow will fetch up to 250 products from your Shopify catalog
3. Products are matched by name — duplicates will be updated, not recreated

---

## Step 4: Set Up Order Webhook

1. In SahelFlow Integrations, copy your **Webhook URL** and **Secret Token**
2. In Shopify Admin, go to **Settings → Notifications → Webhooks**
3. Click **Create webhook**
   - **Event**: Order creation
   - **Format**: JSON
   - **URL**: paste your SahelFlow Webhook URL
4. Save

---

## How It Works

| Event                      | Action                                        |
| -------------------------- | --------------------------------------------- |
| New order on Shopify       | SahelFlow creates a draft order automatically |
| Product updated on Shopify | Updated on next sync                          |
| Duplicate webhook sent     | Ignored via idempotency check                 |

---

## Troubleshooting

| Issue                          | Solution                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| "Invalid HMAC signature"       | Verify webhook URL matches token; check Shopify webhook secret |
| "No Shopify integration found" | Save credentials first before syncing                          |
| Sync returns 0 products        | Check Admin API token has `read_products` scope                |
| Orders not appearing           | Verify webhook is set to "Order creation" event                |

---

_Last updated: 2026-05-11_
