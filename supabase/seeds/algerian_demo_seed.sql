-- =============================================================================
-- SahelFlow · Algerian Professional Demo Seed (v3 — realistic, focused niche)
-- Seller: Smart DZ — Phone Accessories & Gadgets (Alger)
-- 
-- This seed creates a realistic Algerian COD e-commerce dataset:
--   1 seller (phone accessories niche), 5 categories, 15 products,
--   12 customers, 20 orders (various statuses), 8 expenses, 7 automations,
--   3 team members, 1 WhatsApp channel, 4 conversations with messages.
--
-- Safe to re-run: clears all child data then re-inserts inside a transaction.
-- The seller row is UPDATED (not deleted) to preserve the auth.users link.
-- =============================================================================

BEGIN;

-- ─── SELLER ID (fixed, matches auth.users) ─────────────────────────────────
-- Using the existing seller UUID so the login still works.
-- 'e7914218-25e9-48e8-9a1f-cd1e19ea289a' is the demo auth user.

-- ─── 1. CLEAR EXISTING DEMO DATA (FK-safe order) ───────────────────────────
-- Children first, parent last. Seller row is kept (updated below).
DELETE FROM public.messages;
DELETE FROM public.conversations;
DELETE FROM public.deliveries;
DELETE FROM public.return_notes;
DELETE FROM public.returns;
DELETE FROM public.orders;
DELETE FROM public.customers;
DELETE FROM public.expenses;
DELETE FROM public.automations;
DELETE FROM public.ai_chat_messages;
DELETE FROM public.ai_chat_sessions;
DELETE FROM public.agent_activity;
DELETE FROM public.notifications;
DELETE FROM public.webhook_retry_queue;
DELETE FROM public.webhook_events;
DELETE FROM public.import_batches;
DELETE FROM public.daily_analytics_reports;
DELETE FROM public.wilaya_risk_profiles;
DELETE FROM public.team_members;
DELETE FROM public.channels;
DELETE FROM public.integrations;
DELETE FROM public.products;
DELETE FROM public.categories;
DELETE FROM public.whatsapp_templates;

-- ─── 2. UPDATE SELLER PROFILE (keep same id for auth) ───────────────────────
UPDATE public.sellers SET
  email = 'karim.smartdz@gmail.com',
  full_name = 'Karim Benali',
  business_name = 'Smart DZ',
  phone = '0550 12 34 56',
  wilaya = 'Alger',
  plan = 'pro',
  slug = 'smart-dz',
  form_enabled = true,
  form_config = '{"title": "Smart DZ — Accessoires Téléphone", "primaryColor": "#1a56db"}'::jsonb,
  onboarding_completed = true,
  default_locale = 'ar',
  categories = '{"هواتف", "شواحن", "سماعات", "سيارة", "إكسسوارات"}'::text[],
  delivery_partners = '{"yalidine"}'::text[],
  order_sources = '{"whatsapp", "form", "manual", "store"}'::text[],
  shipping_rates = '{"home": {"Alger": 400, "Oran": 600, "Constantine": 700, "Blida": 450, "Setif": 650}, "desk": {"Alger": 250, "Oran": 400, "Constantine": 500, "Blida": 300, "Setif": 450}}'::jsonb,
  notification_settings = '{"order_created": true, "low_stock": true, "high_risk": true, "daily_report": true}'::jsonb,
  settings = '{"agent_config": {"order_agent": {"enabled": true, "auto_confirm_threshold": 25, "auto_reject_threshold": 70}, "communication_agent": {"enabled": true, "auto_reply": false}}}'::jsonb,
  webhook_orders_count = 0,
  updated_at = now()
WHERE id = 'e7914218-25e9-48e8-9a1f-cd1e19ea289a';

-- ─── 3. CATEGORIES (5) ─────────────────────────────────────────────────────
INSERT INTO public.categories (id, seller_id, name, slug, sort_order) VALUES
  ('a1000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'حماية الهاتف', 'phone-protection', 1),
  ('a1000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'شواحن وكابلات', 'chargers-cables', 2),
  ('a1000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'سماعات بلوتوث', 'earphones', 3),
  ('a1000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'ملحقات السيارة', 'car-accessories', 4),
  ('a1000001-0000-0000-0000-000000000005', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'إكسسوارات متنوعة', 'gadgets', 5);

-- ─── 4. PRODUCTS (15) — realistic phone accessories with DA prices ─────────
INSERT INTO public.products (id, seller_id, category_id, name, sku, description, price, cost_price, stock, image_url, active, variants) VALUES
  ('a2000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000001',
   'حماية شاشة زجاج مقوى iPhone 15 Pro', 'SKU-PROT-001', 'حماية شاشة 9H زجاج مقوى شفاف', 600.00, 200.00, 150, NULL, true, '[{"name": "iPhone 15 Pro", "stock": 80}, {"name": "iPhone 15 Pro Max", "stock": 70}]'::jsonb),
  ('a2000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000001',
   'حماية شاشة Samsung S24 Ultra', 'SKU-PROT-002', 'حماية شاشة زجاج مقوى لسامسونج', 500.00, 150.00, 100, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000001',
   'كيس سيليكون iPhone 15', 'SKU-CASE-001', 'كيس سيليكون ناعم متعدد الألوان', 800.00, 350.00, 120, NULL, true, '[{"name": "أزرق", "stock": 40}, {"name": "أسود", "stock": 50}, {"name": "أحمر", "stock": 30}]'::jsonb),
  ('a2000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000002',
   'شاحن سريع Type-C 20W', 'SKU-CHRG-001', 'شاحن سريع 20W مع كابل Type-C', 1200.00, 500.00, 80, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000005', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000002',
   'كابل USB-C مغطى 1 متر', 'SKU-CABL-001', 'كابل Type-C سريع نقل بيانات 1م', 400.00, 120.00, 200, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000006', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000002',
   'شاحن سيارة مزدوج USB', 'SKU-CHRG-002', 'شاحن سيارة 2 منافذ USB سريع', 700.00, 280.00, 90, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000007', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000003',
   'سماعات بلوتوث TWS Pro', 'SKU-EARP-001', 'سماعات لاسلكية TWS مع علبة شحن', 2500.00, 1100.00, 60, NULL, true, '[{"name": "أبيض", "stock": 30}, {"name": "أسود", "stock": 30}]'::jsonb),
  ('a2000001-0000-0000-0000-000000000008', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000003',
   'سماعات سلكية Type-C', 'SKU-EARP-002', 'سماعات سلكية Type-C بميكروفون', 800.00, 300.00, 110, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000009', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000004',
   'حامل هاتف مغناطيسي للسيارة', 'SKU-CAR-001', 'حامل مغناطيسي قوي 360 درجة', 900.00, 350.00, 75, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000010', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000004',
   'حامل هاتف سيارة_griffe', 'SKU-CAR-002', 'حامل هوائي قابل للتعديل', 650.00, 250.00, 50, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000011', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000005',
   'بطارية متنقلة Power Bank 10000mAh', 'SKU-PWRB-001', 'بطارية متنقلة سريعة الشحن', 3500.00, 1600.00, 40, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000012', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000005',
   'شاحن لاسلكي 15W', 'SKU-WCHG-001', 'شاحن لاسلكي سريع Qi 15W', 1800.00, 800.00, 55, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000013', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000005',
   'حامل هاتف ألمنيوم للمكتب', 'SKU-STND-001', 'حامل ألمنيوم قابل للتعديل', 1000.00, 450.00, 65, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000014', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000005',
   'حلقة معدنية لقبضة الهاتف', 'SKU-RING-001', 'حلقة معدنية 360 درجة لقبضة أفضل', 300.00, 80.00, 180, NULL, true, '[]'::jsonb),
  ('a2000001-0000-0000-0000-000000000015', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a1000001-0000-0000-0000-000000000005',
   'عصا سيلفي بلوتوث', 'SKU-SLFI-001', 'عصا سيلفي بلوتوث قابلة للطي', 1200.00, 500.00, 45, NULL, true, '[]'::jsonb);

-- ─── 5. CUSTOMERS (12) — realistic Algerian names + phones + wilayas ────────
INSERT INTO public.customers (id, seller_id, name, phone, wilaya, commune, address, order_count, total_spent, risk_score, is_blocked, metadata) VALUES
  ('a3000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Yacine Hamidi', '0661234567', 'Alger', 'Bab Ezzouar', 'Cité 1000 logements, Bât B, N°15', 5, 12500.00, 15, false, '{"first_order": "2026-05-15"}'::jsonb),
  ('a3000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Amine Brahimi', '0770112233', 'Oran', 'Es Senia', 'Rue des Frères Bouadou, N°42', 3, 7800.00, 10, false, NULL),
  ('a3000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Fatima Zohra Benali', '0555443322', 'Constantine', 'El Khroub', 'Cité Boussouf, Bloc 3, N°8', 2, 4300.00, 35, false, '{"notes": "عميل منتظم"}'::jsonb),
  ('a3000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Mohamed Larbi', '0660554433', 'Blida', 'Boufarik', 'Rue de la Liberté, N°17', 4, 9200.00, 45, false, '{"return_count": 1}'::jsonb),
  ('a3000001-0000-0000-0000-000000000005', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Sara Mansouri', '0775665544', 'Alger', 'Hydra', 'Rue des Jasmins, Villa 12', 6, 15800.00, 5, false, '{"vip": true}'::jsonb),
  ('a3000001-0000-0000-0000-000000000006', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Riad Cherif', '0551789012', 'Setif', 'Setif', 'Cité 8 Mai 1945, Bât 4, N°22', 1, 2500.00, 20, false, NULL),
  ('a3000001-0000-0000-0000-000000000007', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Nabila Khelifi', '0662345678', 'Alger', 'Birkhadem', 'Rue de la République, N°55', 3, 6700.00, 10, false, NULL),
  ('a3000001-0000-0000-0000-000000000008', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Omar Saidi', '0780456789', 'Oran', 'Arzew', 'Zone industrielle, Lot 12', 2, 4800.00, 25, false, NULL),
  ('a3000001-0000-0000-0000-000000000009', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Lina Boudiaf', '0556123456', 'Constantine', 'Constantine', 'Rue Larbi Ben M''hidi, N°33', 4, 11200.00, 8, false, NULL),
  ('a3000001-0000-0000-0000-000000000010', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Karim Touati', '0663890123', 'Blida', 'Blida', 'Cité Aïn Romana, Bât 2, N°9', 2, 3600.00, 30, false, NULL),
  ('a3000001-0000-0000-0000-000000000011', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Amina Haddad', '0771234567', 'Alger', 'Kouba', 'Rue de la Gare, N°78', 5, 13400.00, 40, false, '{"return_count": 1, "notes": "ترجع بعض الطلبات"}'::jsonb),
  ('a3000001-0000-0000-0000-000000000012', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'Sofiane Mimouni', '0557567890', 'Setif', 'El Eulma', 'Marché de gros, N°45', 0, 0.00, 85, true, '{"blocked_reason": "نسبة إرجاع عالية 60%", "blocked_at": "2026-06-01"}'::jsonb);

-- ─── 6. ORDERS (20) — various statuses, sources, spread over 30 days ───────
INSERT INTO public.orders (id, seller_id, customer_id, order_number, status, items, total_price, delivery_cost, net_profit, wilaya, commune, address, source, delivery_type, confirmation_status, confirmation_attempts, risk_score, notes, confirmed_at, shipped_at, delivered_at, created_at, tracking_id, delivery_company) VALUES
  -- Delivered (8)
  ('a4000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000001', 'SF-100001', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000003", "product_name": "كيس سيليكون iPhone 15", "quantity": 1, "unit_price": 800}]'::jsonb,
   800.00, 400.00, 250.00, 'Alger', 'Bab Ezzouar', 'Cité 1000 logements, Bât B, N°15', 'whatsapp', 'home', 'confirmed', 1, 10, NULL, now() - interval '25 days', now() - interval '24 days', now() - interval '22 days', now() - interval '26 days', 'YZ123456789', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000005', 'SF-100002', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000007", "product_name": "سماعات بلوتوث TWS Pro", "quantity": 1, "unit_price": 2500}, {"product_id": "a2000001-0000-0000-0000-000000000014", "product_name": "حلقة معدنية", "quantity": 1, "unit_price": 300}]'::jsonb,
   2800.00, 400.00, 1350.00, 'Alger', 'Hydra', 'Rue des Jasmins, Villa 12', 'whatsapp', 'home', 'confirmed', 1, 5, NULL, now() - interval '20 days', now() - interval '19 days', now() - interval '17 days', now() - interval '21 days', 'YZ123456790', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000002', 'SF-100003', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000004", "product_name": "شاحن سريع Type-C 20W", "quantity": 1, "unit_price": 1200}]'::jsonb,
   1200.00, 600.00, 500.00, 'Oran', 'Es Senia', 'Rue des Frères Bouadou, N°42', 'form', 'home', 'confirmed', 1, 10, NULL, now() - interval '18 days', now() - interval '17 days', now() - interval '15 days', now() - interval '19 days', 'YZ123456791', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000009', 'SF-100004', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000011", "product_name": "بطارية متنقلة Power Bank", "quantity": 1, "unit_price": 3500}]'::jsonb,
   3500.00, 700.00, 1200.00, 'Constantine', 'Constantine', 'Rue Larbi Ben M''hidi, N°33', 'whatsapp', 'home', 'confirmed', 1, 8, NULL, now() - interval '15 days', now() - interval '14 days', now() - interval '12 days', now() - interval '16 days', 'YZ123456792', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000005', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000001', 'SF-100005', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000001", "product_name": "حماية شاشة iPhone 15 Pro", "quantity": 2, "unit_price": 600}]'::jsonb,
   1200.00, 400.00, 600.00, 'Alger', 'Bab Ezzouar', 'Cité 1000 logements, Bât B, N°15', 'manual', 'desk', 'confirmed', 0, 10, NULL, now() - interval '12 days', now() - interval '11 days', now() - interval '9 days', now() - interval '13 days', 'YZ123456793', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000006', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000007', 'SF-100006', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000013", "product_name": "حامل هاتف ألمنيوم", "quantity": 1, "unit_price": 1000}, {"product_id": "a2000001-0000-0000-0000-000000000014", "product_name": "حلقة معدنية", "quantity": 2, "unit_price": 300}]'::jsonb,
   1600.00, 400.00, 790.00, 'Alger', 'Birkhadem', 'Rue de la République, N°55', 'whatsapp', 'home', 'confirmed', 1, 10, NULL, now() - interval '10 days', now() - interval '9 days', now() - interval '7 days', now() - interval '11 days', 'YZ123456794', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000007', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000009', 'SF-100007', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000005", "product_name": "كابل USB-C", "quantity": 2, "unit_price": 400}]'::jsonb,
   800.00, 700.00, 360.00, 'Constantine', 'Constantine', 'Rue Larbi Ben M''hidi, N°33', 'store', 'home', 'confirmed', 1, 8, NULL, now() - interval '8 days', now() - interval '7 days', now() - interval '5 days', now() - interval '9 days', 'YZ123456795', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000008', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000005', 'SF-100008', 'delivered',
   '[{"product_id": "a2000001-0000-0000-0000-000000000012", "product_name": "شاحن لاسلكي 15W", "quantity": 1, "unit_price": 1800}]'::jsonb,
   1800.00, 400.00, 600.00, 'Alger', 'Hydra', 'Rue des Jasmins, Villa 12', 'whatsapp', 'home', 'confirmed', 0, 5, NULL, now() - interval '5 days', now() - interval '4 days', now() - interval '2 days', now() - interval '6 days', 'YZ123456796', 'Yalidine'),

  -- Shipped (2)
  ('a4000001-0000-0000-0000-000000000009', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000010', 'SF-100009', 'shipped',
   '[{"product_id": "a2000001-0000-0000-0000-000000000009", "product_name": "حامل هاتف مغناطيسي للسيارة", "quantity": 1, "unit_price": 900}]'::jsonb,
   900.00, 450.00, 300.00, 'Blida', 'Blida', 'Cité Aïn Romana, Bât 2, N°9', 'whatsapp', 'home', 'confirmed', 1, 15, NULL, now() - interval '2 days', now() - interval '1 day', NULL, now() - interval '3 days', 'YZ123456797', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000010', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000008', 'SF-100010', 'shipped',
   '[{"product_id": "a2000001-0000-0000-0000-000000000006", "product_name": "شاحن سيارة مزدوج USB", "quantity": 1, "unit_price": 700}, {"product_id": "a2000001-0000-0000-0000-000000000010", "product_name": "حامل هاتف سيارة", "quantity": 1, "unit_price": 650}]'::jsonb,
   1350.00, 600.00, 520.00, 'Oran', 'Arzew', 'Zone industrielle, Lot 12', 'form', 'home', 'confirmed', 1, 25, NULL, now() - interval '1 day', NULL, NULL, now() - interval '2 days', NULL, NULL),

  -- Confirmed (4)
  ('a4000001-0000-0000-0000-000000000011', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000003', 'SF-100011', 'confirmed',
   '[{"product_id": "a2000001-0000-0000-0000-000000000008", "product_name": "سماعات سلكية Type-C", "quantity": 1, "unit_price": 800}]'::jsonb,
   800.00, 700.00, 300.00, 'Constantine', 'El Khroub', 'Cité Boussouf, Bloc 3, N°8', 'whatsapp', 'home', 'confirmed', 1, 35, NULL, now() - interval '1 day', NULL, NULL, now() - interval '2 days', NULL, NULL),
  ('a4000001-0000-0000-0000-000000000012', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000001', 'SF-100012', 'confirmed',
   '[{"product_id": "a2000001-0000-0000-0000-000000000015", "product_name": "عصا سيلفي بلوتوث", "quantity": 1, "unit_price": 1200}]'::jsonb,
   1200.00, 400.00, 300.00, 'Alger', 'Bab Ezzouar', 'Cité 1000 logements, Bât B, N°15', 'manual', 'home', 'confirmed', 0, 10, NULL, now() - interval '12 hours', NULL, NULL, now() - interval '1 day', NULL, NULL),
  ('a4000001-0000-0000-0000-000000000013', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000007', 'SF-100013', 'confirmed',
   '[{"product_id": "a2000001-0000-0000-0000-000000000011", "product_name": "بطارية متنقلة Power Bank", "quantity": 1, "unit_price": 3500}, {"product_id": "a2000001-0000-0000-0000-000000000005", "product_name": "كابل USB-C", "quantity": 1, "unit_price": 400}]'::jsonb,
   3900.00, 400.00, 1380.00, 'Alger', 'Birkhadem', 'Rue de la République, N°55', 'whatsapp', 'desk', 'confirmed', 1, 10, NULL, now() - interval '6 hours', NULL, NULL, now() - interval '1 day', NULL, NULL),
  ('a4000001-0000-0000-0000-000000000014', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000011', 'SF-100014', 'confirmed',
   '[{"product_id": "a2000001-0000-0000-0000-000000000003", "product_name": "كيس سيليكون iPhone 15", "quantity": 2, "unit_price": 800}, {"product_id": "a2000001-0000-0000-0000-000000000001", "product_name": "حماية شاشة iPhone 15 Pro", "quantity": 2, "unit_price": 600}]'::jsonb,
   2800.00, 400.00, 1200.00, 'Alger', 'Kouba', 'Rue de la Gare, N°78', 'whatsapp', 'home', 'confirmed', 1, 40, NULL, now() - interval '3 hours', NULL, NULL, now() - interval '1 day', NULL, NULL),

  -- Pending (3)
  ('a4000001-0000-0000-0000-000000000015', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000006', 'SF-100015', 'pending',
   '[{"product_id": "a2000001-0000-0000-0000-000000000007", "product_name": "سماعات بلوتوث TWS Pro", "quantity": 1, "unit_price": 2500}]'::jsonb,
   2500.00, 650.00, 800.00, 'Setif', 'Setif', 'Cité 8 Mai 1945, Bât 4, N°22', 'whatsapp', 'home', 'en_attente', 0, 20, NULL, NULL, NULL, NULL, now() - interval '5 hours', NULL, NULL),
  ('a4000001-0000-0000-0000-000000000016', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000002', 'SF-100016', 'pending',
   '[{"product_id": "a2000001-0000-0000-0000-000000000002", "product_name": "حماية شاشة Samsung S24 Ultra", "quantity": 1, "unit_price": 500}]'::jsonb,
   500.00, 600.00, 150.00, 'Oran', 'Es Senia', 'Rue des Frères Bouadou, N°42', 'form', 'home', 'rappel', 1, 25, 'العميل لم يرد على المكالمة الأولى', NULL, NULL, NULL, now() - interval '8 hours', NULL, NULL),
  ('a4000001-0000-0000-0000-000000000017', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000001', 'SF-100017', 'pending',
   '[{"product_id": "a2000001-0000-0000-0000-000000000004", "product_name": "شاحن سريع Type-C 20W", "quantity": 1, "unit_price": 1200}, {"product_id": "a2000001-0000-0000-0000-000000000005", "product_name": "كابل USB-C", "quantity": 1, "unit_price": 400}]'::jsonb,
   1600.00, 400.00, 580.00, 'Alger', 'Bab Ezzouar', 'Cité 1000 logements, Bât B, N°15', 'whatsapp', 'home', 'doublon', 0, 10, 'طلب مكرر — نفس العميل لديه طلب آخر اليوم', NULL, NULL, NULL, now() - interval '2 hours', NULL, NULL),

  -- Returned (2)
  ('a4000001-0000-0000-0000-000000000018', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000004', 'SF-100018', 'returned',
   '[{"product_id": "a2000001-0000-0000-0000-000000000007", "product_name": "سماعات بلوتوث TWS Pro", "quantity": 1, "unit_price": 2500}]'::jsonb,
   2500.00, 600.00, -1100.00, 'Blida', 'Boufarik', 'Rue de la Liberté, N°17', 'whatsapp', 'home', 'confirmed', 1, 45, 'العميل رفض الاستلام', now() - interval '14 days', now() - interval '13 days', now() - interval '11 days', now() - interval '15 days', 'YZ123456798', 'Yalidine'),
  ('a4000001-0000-0000-0000-000000000019', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000011', 'SF-100019', 'returned',
   '[{"product_id": "a2000001-0000-0000-0000-000000000013", "product_name": "حامل هاتف ألمنيوم", "quantity": 1, "unit_price": 1000}]'::jsonb,
   1000.00, 400.00, -50.00, 'Alger', 'Kouba', 'Rue de la Gare, N°78', 'whatsapp', 'home', 'confirmed', 1, 40, 'العميل لم يكن موجوداً', now() - interval '9 days', now() - interval '8 days', now() - interval '6 days', now() - interval '10 days', 'YZ123456799', 'Yalidine'),

  -- Cancelled (1)
  ('a4000001-0000-0000-0000-000000000020', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a3000001-0000-0000-0000-000000000003', 'SF-100020', 'cancelled',
   '[{"product_id": "a2000001-0000-0000-0000-000000000015", "product_name": "عصا سيلفي بلوتوث", "quantity": 1, "unit_price": 1200}]'::jsonb,
   1200.00, 0.00, 0.00, 'Constantine', 'El Khroub', 'Cité Boussouf, Bloc 3, N°8', 'whatsapp', 'home', 'annule', 2, 35, 'العميل ألغى الطلب — وجد سعراً أفضل', NULL, NULL, NULL, now() - interval '4 days', NULL, NULL);

-- ─── 7. EXPENSES (8) — realistic monthly expenses ──────────────────────────
INSERT INTO public.expenses (id, seller_id, category, amount, description, expense_date) VALUES
  ('a5000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'ads', 12000.00, 'إعلانات فيسبوك وانستغرام - حملة يونيو', (now() - interval '15 days')::date),
  ('a5000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'packaging', 3000.00, 'علب كرتون للتغليف + شريط لاصق (500 وحدة)', (now() - interval '12 days')::date),
  ('a5000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'delivery_fees', 8500.00, 'رسوم شركة التوصيل Yalidine (30 طلب)', (now() - interval '10 days')::date),
  ('a5000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'supplies', 18000.00, 'إعادة تخزين المنتجات (شواحن + سماعات + حمايات)', (now() - interval '8 days')::date),
  ('a5000001-0000-0000-0000-000000000005', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'salary', 20000.00, 'راتب مساعد التأكيد والتغليف', (now() - interval '5 days')::date),
  ('a5000001-0000-0000-0000-000000000006', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'rent', 10000.00, 'إيجار المكتب (نصف شهر)', (now() - interval '3 days')::date),
  ('a5000001-0000-0000-0000-000000000007', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'other', 1000.00, 'رصيد هاتف للاتصال بالعملاء', (now() - interval '2 days')::date),
  ('a5000001-0000-0000-0000-000000000008', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'other', 800.00, 'اشتراك Canva Pro شهري', (now() - interval '1 day')::date);

-- ─── 8. AUTOMATIONS (7) — the built-in recipes ─────────────────────────────
INSERT INTO public.automations (id, seller_id, name, description, trigger_type, trigger_config, action_type, action_config, active, run_count) VALUES
  ('a6000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'auto_confirm_safe', 'تأكيد تلقائي للطلبات منخفضة المخاطر', 'order.created', '{"recipe_id": "auto_confirm_safe", "max_risk": 25}'::jsonb, 'update_status', '{"status": "confirmed"}'::jsonb, true, 12),
  ('a6000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'welcome_new_customer', 'رسالة ترحيب للعملاء الجدد', 'message.first', '{"recipe_id": "welcome_new_customer"}'::jsonb, 'send_template', '{"template": "welcome"}'::jsonb, true, 8),
  ('a6000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'high_risk_alert', 'تنبيه الطلبات عالية المخاطر', 'risk.threshold', '{"recipe_id": "high_risk_alert", "threshold": 60}'::jsonb, 'flag_review', '{}'::jsonb, true, 3),
  ('a6000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'low_stock_warning', 'تنبيه انخفاض المخزون', 'stock.low', '{"recipe_id": "low_stock_warning", "threshold": 10}'::jsonb, 'notify', '{}'::jsonb, true, 2),
  ('a6000001-0000-0000-0000-000000000005', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'followup_after_delivery', 'متابعة بعد التوصيل', 'order.delivered', '{"recipe_id": "followup_after_delivery", "delay_hours": 24}'::jsonb, 'send_template', '{"template": "followup"}'::jsonb, true, 8),
  ('a6000001-0000-0000-0000-000000000006', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'auto_block_returners', 'حظر تلقائي للعملاء كثيري الإرجاع', 'return.threshold', '{"recipe_id": "auto_block_returners", "max_return_rate": 0.4}'::jsonb, 'block_customer', '{}'::jsonb, false, 1),
  ('a6000001-0000-0000-0000-000000000007', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'auto_create_shipment', 'إنشاء شحنة تلقائي عند التأكيد', 'order.confirmed', '{"recipe_id": "auto_create_shipment", "provider": "yalidine"}'::jsonb, 'create_shipment', '{}'::jsonb, true, 10);

-- ─── 9. WHATSAPP TEMPLATES (4) ─────────────────────────────────────────────
INSERT INTO public.whatsapp_templates (id, seller_id, name, slug, content, category, language, active) VALUES
  ('a7000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'ترحيب', 'welcome', 'مرحباً {{customer_name}}! 🎉\nشكراً لثقتك في Smart DZ.\nطلبك رقم {{order_number}} قيد المعالجة.\nسنتصل بك قريباً للتأكيد.', 'welcome', 'ar', true),
  ('a7000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'تأكيد الطلب', 'confirmation', 'عذراً {{customer_name}}، نتواصل معك بخصوص طلبك {{order_number}}.\nالمنتج: {{product_name}}\nالمبلغ: {{total_price}} دج (دفع عند الاستلام)\nهل تؤكد طلبك؟', 'confirmation', 'ar', true),
  ('a7000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'متابعة بعد التوصيل', 'followup', 'مرحباً {{customer_name}}! 📦\nتم توصيل طلبك {{order_number}} بنجاح.\nنتمنى أن يعجبك المنتج. شاركنا رأيك! ⭐', 'followup', 'ar', true),
  ('a7000001-0000-0000-0000-000000000004', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'اقتراح منتج', 'upsell', 'مرحباً {{customer_name}}! 💡\nبناءً على طلبك السابق، قد يعجبك هذا المنتج أيضاً.\nعرض خاص لعملائنا المميزين.', 'upsell', 'ar', true);

-- ─── 10. CHANNELS (1) — WhatsApp only (Instagram killed per design system) ─
INSERT INTO public.channels (id, seller_id, type, name, credentials, active) VALUES
  ('a8000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'whatsapp', 'Smart DZ WhatsApp',
   '{"instance_id": "demo-instance", "phone": "213550123456", "connected": true}'::jsonb, true);

-- ─── 11. TEAM MEMBERS (3) ──────────────────────────────────────────────────
INSERT INTO public.team_members (id, seller_id, user_id, email, role, status, invited_at, accepted_at) VALUES
  ('a9000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'karim.smartdz@gmail.com', 'owner', 'active', now() - interval '30 days', now() - interval '30 days'),
  ('a9000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'sofiane.confirmer@gmail.com', 'confirmer', 'invited', now() - interval '5 days', NULL),
  ('a9000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'lina.packer@gmail.com', 'packer', 'invited', now() - interval '2 days', NULL);

-- ─── 12. CONVERSATIONS (3) + MESSAGES (6) — WhatsApp inbox demo ────────────
INSERT INTO public.conversations (id, seller_id, channel_id, customer_id, platform_thread_id, status, unread_count, last_message_at, last_message_preview, is_pinned) VALUES
  ('b0000001-0000-0000-0000-000000000001', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000006', '213551789012@s.whatsapp.net', 'open', 0, now() - interval '5 hours', 'بغيت نخدم السماعات اللاسلكية', false),
  ('b0000001-0000-0000-0000-000000000002', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000003', '213555443322@s.whatsapp.net', 'open', 2, now() - interval '2 hours', 'شحن السامسونج S24 كم؟', true),
  ('b0000001-0000-0000-0000-000000000003', 'e7914218-25e9-48e8-9a1f-cd1e19ea289a', 'a8000001-0000-0000-0000-000000000001', 'a3000001-0000-0000-0000-000000000001', '213661234567@s.whatsapp.net', 'open', 0, now() - interval '1 day', 'شكراً على التوصيل السريع 🙏', false);

INSERT INTO public.messages (id, conversation_id, direction, content, content_type, is_ai_reply, created_at, platform_message_id) VALUES
  ('b1000001-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000001', 'inbound', 'سلام، بغيت نخدم السماعات اللاسلكية TWS Pro', 'text', false, now() - interval '5 hours', 'wa_msg_001'),
  ('b1000001-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000001', 'inbound', 'شحال ثمنها؟ ووصل تما سطيف', 'text', false, now() - interval '4 hours', 'wa_msg_002'),
  ('b1000001-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000002', 'inbound', 'سلام، شحن السامسونج S24 Ultra كم؟', 'text', false, now() - interval '3 hours', 'wa_msg_003'),
  ('b1000001-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000002', 'inbound', 'ووصل لقسنطينة؟', 'text', false, now() - interval '2 hours', 'wa_msg_004'),
  ('b1000001-0000-0000-0000-000000000005', 'b0000001-0000-0000-0000-000000000003', 'inbound', 'وصلني الطلب شكراً على التوصيل السريع 🙏', 'text', false, now() - interval '1 day', 'wa_msg_005'),
  ('b1000001-0000-0000-0000-000000000006', 'b0000001-0000-0000-0000-000000000003', 'outbound', 'العفو أختي! نتمنى يعجبك المنتج. لا تنسي تشاركينا رأيك 🌟', 'text', true, now() - interval '23 hours', 'wa_msg_006');

COMMIT;

-- =============================================================================
-- Seed complete. Summary:
--   1 seller (Smart DZ — phone accessories, Alger)
--   5 categories (protection, chargers, earphones, car, gadgets)
--   15 products (realistic DA prices, margins, stock, variants)
--   12 customers (real Algerian names, phones, wilayas — 1 blocked)
--   20 orders (8 delivered, 2 shipped, 4 confirmed, 3 pending, 2 returned, 1 cancelled)
--   8 expenses (ads, packaging, delivery, supplies, salary, rent, etc.)
--   7 automations (the built-in recipes)
--   4 WhatsApp templates (ar locale)
--   1 WhatsApp channel (Instagram removed — killed feature)
--   3 team members (owner + confirmer + packer)
--   3 conversations + 6 messages (real Darija WhatsApp exchanges)
-- =============================================================================
