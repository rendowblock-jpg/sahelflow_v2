-- =============================================================================
-- Seed Addition: Revert seller profile + add conversations for AI extraction testing
-- =============================================================================

BEGIN;

-- ─── 1. REVERT SELLER PROFILE TO ORIGINAL (DMR Store) ──────────────────────
-- Keeps the structural fields (shipping_rates, form_config, etc.) which are
-- improvements, but reverts the identity fields to match the auth user.
UPDATE public.sellers SET
  email = 'abdo2019hamouma@gmail.com',
  full_name = 'DMR',
  business_name = 'ecoflow',
  phone = '+213 550 123 456',
  slug = 'dmr-store',
  updated_at = now()
WHERE id = 'e7914218-25e9-48e8-9a1f-cd1e19ea289a';

-- ─── 2. ADD 5 NEW CUSTOMERS for the new conversations ──────────────────────
INSERT INTO public.customers (id, seller_id, name, phone, wilaya, commune, address, order_count, total_spent, risk_score, is_blocked, metadata) VALUES
  ('a3000001-0000-0000-0000-000000000013', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Bilal Mokrani', '0678901234', 'Alger', 'Bab El Oued', 'Rue de la Casbah, N°12', 0, 0.00, 0, false, NULL),
  ('a3000001-0000-0000-0000-000000000014', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Imene Saadi', '0561112233', 'Tizi Ouzou', 'Tizi Ouzou', 'Cité 200 logements, Bât 5, N°18', 0, 0.00, 0, false, NULL),
  ('a3000001-0000-0000-0000-000000000015', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Walid Chaouch', '0789112233', 'Oran', 'Bethioua', 'Zone d''activité, Lot 8', 0, 0.00, 0, false, NULL),
  ('a3000001-0000-0000-0000-000000000016', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Soumia Belkacem', '0552223344', 'Blida', 'Bouarfa', 'Cité AADL, Bât 3, N°27', 0, 0.00, 0, false, NULL),
  ('a3000001-0000-0000-0000-000000000017', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Reda Bouzid', '0663334455', 'Alger', 'El Harrach', 'Rue des Frères Vigouroux, N°91', 0, 0.00, 0, false, NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. ADD 8 NEW CONVERSATIONS testing diverse AI extraction scenarios ─────
-- Each conversation tests a different extraction challenge:
--   C4: Simple product + quantity
--   C5: Full order (product + wilaya + address + phone)
--   C6: Vague request ("بغيتها" — needs product inference from context)
--   C7: Franco-Arab mixed script (Latin letters + Arabic)
--   C8: Price inquiry (NOT an order — should not create draft)
--   C9: Multi-product order (2+ items)
--   C10: Spelling variation (tests fuzzy product matching)
--   C11: Customer provides phone in message (different from their stored phone)

INSERT INTO public.conversations (id, seller_id, channel_id, customer_id, platform_thread_id, status, unread_count, last_message_at, last_message_preview, is_pinned) VALUES
  -- C4: Simple product + quantity
  ('b0000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000013', '213678901234@s.whatsapp.net', 'open', 1, now() - interval '45 minutes', 'بغيت 2 حماية شاشة', false),
  -- C5: Full order (product + wilaya + address)
  ('b0000001-0000-0000-0000-000000000005', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000014', '213561112233@s.whatsapp.net', 'open', 2, now() - interval '30 minutes', 'وصلني تما تيزي وزو، العنوان: 200 مسكن عمارة 5 رقم 18', false),
  -- C6: Vague request (just "بغيتها")
  ('b0000001-0000-0000-0000-000000000006', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000015', '213789112233@s.whatsapp.net', 'open', 1, now() - interval '20 minutes', 'بغيتها، شحنها لوهران', false),
  -- C7: Franco-Arab mixed script
  ('b0000001-0000-0000-0000-000000000007', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000016', '213552223344@s.whatsapp.net', 'open', 1, now() - interval '15 minutes', 'wach kayn power bank 10000? nbghi 1', false),
  -- C8: Price inquiry (not an order)
  ('b0000001-0000-0000-0000-000000000008', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000017', '213663334455@s.whatsapp.net', 'open', 1, now() - interval '10 minutes', 'بشحال السماعات اللاسلكية؟', false),
  -- C9: Moved to existing conversation b0000001-003 (same customer, same thread)
  -- (no new conversation row — just adding messages below)
  -- C10: Spelling variation (fuzzy matching test)
  ('b0000001-0000-0000-0000-000000000010', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000002', '213770112233@s.whatsapp.net', 'open', 1, now() - interval '5 minutes', 'n7eb nchri sma3at tws', false),
  -- C11: Customer provides different phone in message
  ('b0000001-0000-0000-0000-000000000011', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000007', '213662345678@s.whatsapp.net', 'open', 1, now() - interval '2 minutes', 'عندي رقم جديد 0711223344، توصلوا عليه', false)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. ADD MESSAGES for the new conversations ─────────────────────────────
INSERT INTO public.messages (id, conversation_id, direction, content, content_type, is_ai_reply, created_at, platform_message_id) VALUES
  -- C4: Simple product + quantity (2 messages)
  ('b1000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000004', 'inbound', 'سلام', 'text', false, now() - interval '50 minutes', 'wa_msg_007'),
  ('b1000001-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000004', 'inbound', 'بغيت 2 حماية شاشة', 'text', false, now() - interval '45 minutes', 'wa_msg_008'),

  -- C5: Full order with address (3 messages — tests address + wilaya extraction)
  ('b1000001-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000005', 'inbound', 'سلام، بغيت نخدم الشاحن السريع Type-C 20W', 'text', false, now() - interval '35 minutes', 'wa_msg_009'),
  ('b1000001-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000005', 'inbound', 'وصلني تما تيزي وزو، العنوان: 200 مسكن عمارة 5 رقم 18', 'text', false, now() - interval '30 minutes', 'wa_msg_010'),
  ('b1000001-0000-0000-0000-000000000011', 'b0000001-0000-0000-0000-000000000005', 'inbound', 'اسمي إيمان، رقمي 0561112233', 'text', false, now() - interval '28 minutes', 'wa_msg_011'),

  -- C6: Vague request "بغيتها" (2 messages — tests product inference)
  ('b1000001-0000-0000-0000-000000000012', 'b0000001-0000-0000-0000-000000000006', 'inbound', 'شفت البوست تاعكم على الانستغرام', 'text', false, now() - interval '25 minutes', 'wa_msg_012'),
  ('b1000001-0000-0000-0000-000000000013', 'b0000001-0000-0000-0000-000000000006', 'inbound', 'بغيتها، شحنها لوهران', 'text', false, now() - interval '20 minutes', 'wa_msg_013'),

  -- C7: Franco-Arab (1 message — tests Latin-script Darija)
  ('b1000001-0000-0000-0000-000000000014', 'b0000001-0000-0000-0000-000000000007', 'inbound', 'wach kayn power bank 10000? nbghi 1', 'text', false, now() - interval '15 minutes', 'wa_msg_014'),

  -- C8: Price inquiry (1 message — should NOT become a draft order)
  ('b1000001-0000-0000-0000-000000000015', 'b0000001-0000-0000-0000-000000000008', 'inbound', 'بشحال السماعات اللاسلكية؟', 'text', false, now() - interval '10 minutes', 'wa_msg_015'),

  -- C9: Multi-product order (1 message — tests quantity parsing for multiple items)
  -- C9: multi-product message added to EXISTING conversation b0000001-003 (Yacine's thread — returning customer)
  ('b1000001-0000-0000-0000-000000000016', 'b0000001-0000-0000-0000-000000000003', 'inbound', 'بغيت نخدم: 3 كيس سيليكون + 2 شاحن سريع + 1 كابل USB-C', 'text', false, now() - interval '8 minutes', 'wa_msg_016'),

  -- C10: Spelling variation (2 messages — tests fuzzy product matching)
  ('b1000001-0000-0000-0000-000000000017', 'b0000001-0000-0000-0000-000000000010', 'inbound', 'salam', 'text', false, now() - interval '7 minutes', 'wa_msg_017'),
  ('b1000001-0000-0000-0000-000000000018', 'b0000001-0000-0000-0000-000000000010', 'inbound', 'n7eb nchri sma3at tws w7da noire', 'text', false, now() - interval '5 minutes', 'wa_msg_018'),

  -- C11: Phone number change (1 message — tests phone extraction from message body)
  ('b1000001-0000-0000-0000-000000000019', 'b0000001-0000-0000-0000-000000000011', 'inbound', 'سلام، عندي رقم جديد 0711223344، توصلوا عليه بلاصة القديم', 'text', false, now() - interval '2 minutes', 'wa_msg_019')
ON CONFLICT (id) DO NOTHING;

-- Bump unread_count on the existing conversation that received the multi-product message
UPDATE public.conversations SET unread_count = unread_count + 1, last_message_at = now() - interval '8 minutes', last_message_preview = '3 كيس + 2 شاحن + 1 كابل' WHERE id = 'b0000001-0000-0000-0000-000000000003';

COMMIT;

-- =============================================================================
-- Summary:
--   Seller reverted to DMR Store / ecoflow / abdo2019hamouma@gmail.com
--   +5 new customers (Bilal, Imene, Walid, Soumia, Reda)
--   +8 new conversations testing AI extraction scenarios:
--     C4:  Simple product + quantity (2 حماية شاشة)
--     C5:  Full order (product + wilaya Tizi Ouzou + address + name + phone)
--     C6:  Vague "بغيتها" (needs context inference — which product?)
--     C7:  Franco-Arab: "wach kayn power bank 10000? nbghi 1"
--     C8:  Price inquiry only (should NOT create draft)
--     C9:  Multi-product: "3 كيس + 2 شاحن + 1 كابل"
--     C10: Spelling variation: "n7eb nchri sma3at tws" (sma3at tws = سماعات TWS)
--     C11: Phone extraction from message body ("عندي رقم جديد 0711223344")
--   +13 new messages across the new conversations
-- =============================================================================
