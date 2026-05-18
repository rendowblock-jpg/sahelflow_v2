# WooCommerce Integration Setup Guide

## Overview

Connect your WooCommerce store to SahelFlow to sync products and receive new orders automatically.

---

## Step 1: Enable WooCommerce REST API

1. Log in to your **WordPress Admin**
2. Go to **WooCommerce → Settings → Advanced → REST API**
3. Click **Add key**
   - **Description**: SahelFlow
   - **User**: Select your admin user
   - **Permissions**: **Read/Write**
4. Click **Generate API key**
5. Copy the **Consumer Key** (`ck_...`) and **Consumer Secret** (`cs_...`)

---

## Step 2: Connect in SahelFlow

1. Open SahelFlow → **Settings → Integrations**
2. In the **Catalog Sync** section, find the WooCommerce card
3. Enter:
   - **Store URL**: full HTTPS URL (e.g., `https://my-store.com`)
   - **Consumer Key**: from Step 1
   - **Consumer Secret**: from Step 1
   - **Webhook Secret** (optional): for verifying webhooks
4. Click **Save Credentials**

> **Security note**: SahelFlow rejects non-HTTPS WooCommerce URLs to protect your API credentials.

---

## Step 3: Sync Products

1. Click **Start Sync**
2. SahelFlow fetches published products with pagination (up to 1,000 products)
3. Products matched by name — updates existing, creates new

---

## Step 4: Set Up Order Webhook

1. In SahelFlow, copy your **Webhook URL**
2. In WordPress Admin, go to **WooCommerce → Settings → Advanced → Webhooks**
3. Click **Add webhook**
   - **Name**: SahelFlow Order
   - **Status**: Active
   - **Topic**: Order created
   - **Delivery URL**: paste your SahelFlow Webhook URL
   - **Secret**: paste your Webhook Secret (if you set one)
4. Save

---

## How It Works

| Event                    | Action                            |
| ------------------------ | --------------------------------- |
| New order on WooCommerce | SahelFlow creates a pending order |
| Shipping cost included   | Extracted to `delivery_cost`      |
| Duplicate webhook        | Blocked by event ID deduplication |

---

## Troubleshooting

| Issue                        | Solution                                                     |
| ---------------------------- | ------------------------------------------------------------ |
| "WooCommerce API error: 401" | Consumer key/secret incorrect or user lacks permissions      |
| "Must use HTTPS"             | Update store URL to include `https://`                       |
| Sync returns 0 products      | Check that products are "Published" in WooCommerce           |
| Webhook signature invalid    | Verify `webhook_secret` matches WooCommerce webhook settings |

---

_Last updated: 2026-05-11_
