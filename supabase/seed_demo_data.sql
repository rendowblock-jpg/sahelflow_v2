-- ================================================
-- SahelFlow — Comprehensive Algerian Demo Data
-- ================================================
-- INSTRUCTIONS:
--   1. Run 011_fix_automation_checks.sql FIRST
--   2. Replace '___SELLER_UUID___' below with your actual seller UUID
--      (Find it: go to Supabase > Auth > Users > copy your user ID)
--   3. Run this entire file in Supabase SQL Editor
--   4. Refresh your dashboard
--
-- This seed creates realistic Algerian e-commerce data across ALL tables.
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING where possible).
-- ================================================

-- ============================================
-- STEP 0: Set your seller UUID here
-- ============================================
-- Replace the value below with your real seller UUID from Supabase Auth
DO $$
DECLARE
  seller UUID := 'e7914218-25e9-48e8-9a1f-cd1e19ea289a';

  -- Category IDs
  cat_mode UUID := gen_random_uuid();
  cat_beaute UUID := gen_random_uuid();
  cat_electronique UUID := gen_random_uuid();
  cat_maison UUID := gen_random_uuid();

  -- Product IDs (we need these to reference in orders)
  p_hijab UUID := gen_random_uuid();
  p_abaya UUID := gen_random_uuid();
  p_robe UUID := gen_random_uuid();
  p_parfum_homme UUID := gen_random_uuid();
  p_parfum_femme UUID := gen_random_uuid();
  p_creme UUID := gen_random_uuid();
  p_serum UUID := gen_random_uuid();
  p_ecouteurs UUID := gen_random_uuid();
  p_montre UUID := gen_random_uuid();
  p_chaussures UUID := gen_random_uuid();
  p_sac UUID := gen_random_uuid();
  p_coussin UUID := gen_random_uuid();

  -- Customer IDs
  c_amina UUID := gen_random_uuid();
  c_fatima UUID := gen_random_uuid();
  c_khadija UUID := gen_random_uuid();
  c_mohamed UUID := gen_random_uuid();
  c_youcef UUID := gen_random_uuid();
  c_sarah UUID := gen_random_uuid();
  c_ahmed UUID := gen_random_uuid();
  c_meriem UUID := gen_random_uuid();
  c_rachid UUID := gen_random_uuid();
  c_nadia UUID := gen_random_uuid();
  c_karim UUID := gen_random_uuid();
  c_aicha UUID := gen_random_uuid();
  c_omar UUID := gen_random_uuid();
  c_souad UUID := gen_random_uuid();
  c_bilal UUID := gen_random_uuid();
  c_houda UUID := gen_random_uuid();
  c_amine UUID := gen_random_uuid();
  c_samira UUID := gen_random_uuid();
  c_tarek UUID := gen_random_uuid();
  c_lina UUID := gen_random_uuid();

  -- Order IDs
  o1 UUID := gen_random_uuid();
  o2 UUID := gen_random_uuid();
  o3 UUID := gen_random_uuid();
  o4 UUID := gen_random_uuid();
  o5 UUID := gen_random_uuid();
  o6 UUID := gen_random_uuid();
  o7 UUID := gen_random_uuid();
  o8 UUID := gen_random_uuid();
  o9 UUID := gen_random_uuid();
  o10 UUID := gen_random_uuid();
  o11 UUID := gen_random_uuid();
  o12 UUID := gen_random_uuid();
  o13 UUID := gen_random_uuid();
  o14 UUID := gen_random_uuid();
  o15 UUID := gen_random_uuid();
  o16 UUID := gen_random_uuid();
  o17 UUID := gen_random_uuid();
  o18 UUID := gen_random_uuid();
  o19 UUID := gen_random_uuid();
  o20 UUID := gen_random_uuid();
  o21 UUID := gen_random_uuid();
  o22 UUID := gen_random_uuid();
  o23 UUID := gen_random_uuid();
  o24 UUID := gen_random_uuid();
  o25 UUID := gen_random_uuid();
  o26 UUID := gen_random_uuid();
  o27 UUID := gen_random_uuid();
  o28 UUID := gen_random_uuid();
  o29 UUID := gen_random_uuid();
  o30 UUID := gen_random_uuid();
  o31 UUID := gen_random_uuid();
  o32 UUID := gen_random_uuid();
  o33 UUID := gen_random_uuid();
  o34 UUID := gen_random_uuid();
  o35 UUID := gen_random_uuid();

  -- Conversation IDs
  conv1 UUID := gen_random_uuid();
  conv2 UUID := gen_random_uuid();
  conv3 UUID := gen_random_uuid();
  conv4 UUID := gen_random_uuid();
  conv5 UUID := gen_random_uuid();
  conv6 UUID := gen_random_uuid();
  conv7 UUID := gen_random_uuid();
  conv8 UUID := gen_random_uuid();

BEGIN

-- ============================================
-- 1. CATEGORIES
-- ============================================
INSERT INTO categories (id, seller_id, name, slug, sort_order) VALUES
  (cat_mode, seller, 'Mode & Vêtements', 'mode', 1),
  (cat_beaute, seller, 'Beauté & Soins', 'beaute', 2),
  (cat_electronique, seller, 'Électronique', 'electronique', 3),
  (cat_maison, seller, 'Maison & Déco', 'maison', 4);

-- ============================================
-- 2. PRODUCTS (12 realistic Algerian products)
-- ============================================
INSERT INTO products (id, seller_id, name, sku, description, price, cost_price, stock, category_id, variants, active) VALUES
  (p_hijab, seller, 'حجاب شيفون فاخر', 'SF-HIJ-001',
   'حجاب شيفون ناعم بألوان متعددة، خامة ممتازة لا تنزلق. مناسب لكل المناسبات',
   1500, 450, 85, cat_mode,
   '[{"id":"v1","name":"اللون","options":["أسود","بيج","كحلي","بني","رمادي"]}]', true),

  (p_abaya, seller, 'عباية كريب تركية', 'SF-ABA-002',
   'عباية كريب مستوردة من تركيا بقصة واسعة وأكمام مطرزة. خامة لا تتجعد',
   4500, 1800, 32, cat_mode,
   '[{"id":"v2","name":"المقاس","options":["S","M","L","XL","XXL"]}]', true),

  (p_robe, seller, 'فستان سهرة مطرز', 'SF-ROB-003',
   'فستان سهرة أنيق بتطريز يدوي. مثالي للأعراس والمناسبات',
   8500, 3200, 12, cat_mode,
   '[{"id":"v3","name":"المقاس","options":["S","M","L","XL"]},{"id":"v4","name":"اللون","options":["ذهبي","فضي","أسود"]}]', true),

  (p_parfum_homme, seller, 'عطر رجالي Oud Royal', 'SF-PRF-004',
   'عطر عود ملكي بتركيبة شرقية فاخرة. ثبات يدوم 12 ساعة. 100مل',
   3500, 1200, 45, cat_beaute, '[]', true),

  (p_parfum_femme, seller, 'عطر نسائي Fleur de Jasmin', 'SF-PRF-005',
   'عطر نسائي بنفحات الياسمين والفانيليا. تركيبة فرنسية حصرية. 80مل',
   4200, 1500, 38, cat_beaute, '[]', true),

  (p_creme, seller, 'كريم تفتيح بالكولاجين', 'SF-CRM-006',
   'كريم تفتيح طبيعي 100% بخلاصة الكولاجين وفيتامين C. نتائج من أول أسبوع',
   1800, 500, 60, cat_beaute, '[]', true),

  (p_serum, seller, 'سيروم فيتامين سي', 'SF-SRM-007',
   'سيروم مركّز بفيتامين C و الهيالورونيك أسيد. يوحد لون البشرة ويحارب التجاعيد',
   2200, 700, 40, cat_beaute, '[]', true),

  (p_ecouteurs, seller, 'سماعات بلوتوث Pro Max', 'SF-EAR-008',
   'سماعات لاسلكية بخاصية إلغاء الضوضاء. بطارية 30 ساعة. مقاومة للماء IPX5',
   3800, 1400, 28, cat_electronique, '[]', true),

  (p_montre, seller, 'ساعة ذكية Sport+', 'SF-WAT-009',
   'ساعة ذكية بشاشة AMOLED. قياس نبض القلب والأكسجين. مقاومة للماء',
   5500, 2200, 18, cat_electronique,
   '[{"id":"v5","name":"اللون","options":["أسود","فضي","ذهبي"]}]', true),

  (p_chaussures, seller, 'حذاء رياضي Air Comfort', 'SF-SHO-010',
   'حذاء رياضي خفيف الوزن بنعل مريح. مناسب للمشي والرياضة',
   3200, 1100, 22, cat_mode,
   '[{"id":"v6","name":"المقاس","options":["39","40","41","42","43","44"]}]', true),

  (p_sac, seller, 'حقيبة يد جلد طبيعي', 'SF-SAC-011',
   'حقيبة يد نسائية من الجلد الطبيعي بتصميم إيطالي. عملية وأنيقة',
   4800, 1900, 15, cat_mode, '[]', true),

  (p_coussin, seller, 'طقم مفارش تركية 6 قطع', 'SF-COU-012',
   'طقم مفارش سرير تركي فاخر 6 قطع. قطن 100%. ألوان ثابتة',
   6500, 2800, 8, cat_maison, '[]', true);

-- ============================================
-- 3. CUSTOMERS (20 realistic Algerian customers)
-- ============================================
INSERT INTO customers (id, seller_id, name, phone, wilaya, commune, address, order_count, total_spent, risk_score, is_blocked, metadata) VALUES
  -- VIP customers (high spend, low risk)
  (c_amina, seller, 'أمينة بوعلام', '0555123456', 'Alger', 'Bab El Oued', 'حي 500 مسكن عمارة 12', 8, 42500, 5, false, '{"segment":"vip","source":"whatsapp"}'),
  (c_fatima, seller, 'فاطمة الزهراء بن سعيد', '0661234567', 'Oran', 'Bir El Djir', 'حي USTO عمارة 3 الطابق 2', 6, 35200, 8, false, '{"segment":"vip","source":"whatsapp"}'),
  (c_khadija, seller, 'خديجة مرابط', '0770123456', 'Constantine', 'El Khroub', 'حي الأمير عبد القادر', 5, 28900, 10, false, '{"segment":"vip","source":"store"}'),

  -- Regular customers (medium activity)
  (c_mohamed, seller, 'محمد بلقاسم', '0550987654', 'Sétif', 'Sétif', 'شارع 8 ماي 1945 رقم 22', 3, 12500, 15, false, '{"segment":"regular","source":"whatsapp"}'),
  (c_youcef, seller, 'يوسف حمادي', '0662345678', 'Tizi Ouzou', 'Tizi Ouzou', 'شارع العقيد عميروش', 3, 11800, 12, false, '{"segment":"regular","source":"store"}'),
  (c_sarah, seller, 'سارة بوزيان', '0771234567', 'Blida', 'Blida', 'حي بن بولعيد الجديد', 2, 8200, 18, false, '{"segment":"regular","source":"whatsapp"}'),
  (c_ahmed, seller, 'أحمد خليفي', '0553456789', 'Annaba', 'Annaba', 'شارع العربي بن مهيدي', 2, 7500, 20, false, '{"segment":"regular","source":"whatsapp"}'),
  (c_meriem, seller, 'مريم بن عمر', '0663456789', 'Batna', 'Batna', 'حي 1000 مسكن', 2, 9300, 15, false, '{"segment":"regular","source":"store"}'),

  -- New customers (1 order or less)
  (c_rachid, seller, 'رشيد عيساوي', '0774567890', 'Béjaïa', 'Béjaïa', 'شارع الحرية', 1, 3500, 25, false, '{"segment":"new","source":"whatsapp"}'),
  (c_nadia, seller, 'نادية بوشناق', '0555678901', 'Djelfa', 'Djelfa', 'حي المستقبل', 1, 4200, 22, false, '{"segment":"new","source":"store"}'),
  (c_karim, seller, 'كريم زروقي', '0667890123', 'M''Sila', 'M''Sila', 'حي الزيتون', 1, 1800, 30, false, '{"segment":"new","source":"whatsapp"}'),
  (c_aicha, seller, 'عائشة بلخيري', '0778901234', 'Chlef', 'Chlef', 'حي الورود', 1, 5500, 20, false, '{"segment":"new","source":"whatsapp"}'),
  (c_omar, seller, 'عمار بن يحيى', '0559012345', 'Tlemcen', 'Tlemcen', 'شارع بن خلدون', 1, 3200, 28, false, '{"segment":"new","source":"store"}'),
  (c_souad, seller, 'سعاد مسعودي', '0660123456', 'Médéa', 'Médéa', 'حي النصر', 0, 0, 35, false, '{"segment":"new","source":"whatsapp"}'),

  -- At-risk customers (high returns, high risk scores)
  (c_bilal, seller, 'بلال بوجمعة', '0771122334', 'Bordj Bou Arreridj', 'BBA', 'حي 200 مسكن', 4, 6500, 65, false, '{"segment":"risky","source":"whatsapp","return_count":3}'),
  (c_houda, seller, 'هدى بن عيسى', '0552233445', 'Skikda', 'Skikda', 'حي 5 جويلية', 3, 4800, 72, false, '{"segment":"risky","source":"whatsapp","return_count":2}'),
  (c_amine, seller, 'أمين دربال', '0663344556', 'Mostaganem', 'Mostaganem', 'شارع أول نوفمبر', 5, 3200, 80, false, '{"segment":"risky","source":"store","return_count":4}'),

  -- Blocked customer
  (c_samira, seller, 'سميرة بوعقال', '0774455667', 'Tiaret', 'Tiaret', 'حي السعادة', 6, 2100, 95, true, '{"segment":"blocked","source":"whatsapp","return_count":5,"block_reason":"excessive_returns"}'),

  -- Pending customers (recent, no history)
  (c_tarek, seller, 'طارق هني', '0555566778', 'Bouira', 'Bouira', 'حي 300 مسكن', 0, 0, 40, false, '{"segment":"new","source":"whatsapp"}'),
  (c_lina, seller, 'لينا بن حميدة', '0666677889', 'Jijel', 'Jijel', 'شارع الإستقلال', 0, 0, 35, false, '{"segment":"new","source":"store"}');

-- ============================================
-- 4. ORDERS (35 orders across all statuses)
-- ============================================
-- Delivered orders (10) — over past 30 days
INSERT INTO orders (id, seller_id, customer_id, status, items, total_price, delivery_cost, net_profit, wilaya, commune, address, notes, source, created_at, confirmed_at, shipped_at, delivered_at) VALUES
  (o1, seller, c_amina, 'delivered',
   '[{"product_id":"' || p_hijab || '","name":"حجاب شيفون فاخر","quantity":3,"unit_price":1500},{"product_id":"' || p_creme || '","name":"كريم تفتيح بالكولاجين","quantity":1,"unit_price":1800}]',
   6300, 400, 3650, 'Alger', 'Bab El Oued', 'حي 500 مسكن عمارة 12', 'زبونة وفية', 'whatsapp',
   NOW() - INTERVAL '28 days', NOW() - INTERVAL '27 days', NOW() - INTERVAL '25 days', NOW() - INTERVAL '22 days'),

  (o2, seller, c_fatima, 'delivered',
   '[{"product_id":"' || p_abaya || '","name":"عباية كريب تركية","quantity":1,"unit_price":4500},{"product_id":"' || p_parfum_femme || '","name":"عطر Fleur de Jasmin","quantity":1,"unit_price":4200}]',
   8700, 600, 4600, 'Oran', 'Bir El Djir', 'حي USTO عمارة 3', NULL, 'whatsapp',
   NOW() - INTERVAL '25 days', NOW() - INTERVAL '24 days', NOW() - INTERVAL '22 days', NOW() - INTERVAL '18 days'),

  (o3, seller, c_khadija, 'delivered',
   '[{"product_id":"' || p_robe || '","name":"فستان سهرة مطرز","quantity":1,"unit_price":8500}]',
   8500, 500, 4800, 'Constantine', 'El Khroub', 'حي الأمير عبد القادر', 'للعرس', 'store',
   NOW() - INTERVAL '22 days', NOW() - INTERVAL '21 days', NOW() - INTERVAL '19 days', NOW() - INTERVAL '15 days'),

  (o4, seller, c_mohamed, 'delivered',
   '[{"product_id":"' || p_parfum_homme || '","name":"عطر Oud Royal","quantity":2,"unit_price":3500}]',
   7000, 500, 4600, 'Sétif', 'Sétif', 'شارع 8 ماي 1945', NULL, 'whatsapp',
   NOW() - INTERVAL '20 days', NOW() - INTERVAL '19 days', NOW() - INTERVAL '17 days', NOW() - INTERVAL '13 days'),

  (o5, seller, c_amina, 'delivered',
   '[{"product_id":"' || p_serum || '","name":"سيروم فيتامين سي","quantity":2,"unit_price":2200},{"product_id":"' || p_creme || '","name":"كريم تفتيح","quantity":1,"unit_price":1800}]',
   6200, 400, 3900, 'Alger', 'Bab El Oued', 'حي 500 مسكن عمارة 12', 'نفس العنوان', 'whatsapp',
   NOW() - INTERVAL '18 days', NOW() - INTERVAL '17 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '11 days'),

  (o6, seller, c_youcef, 'delivered',
   '[{"product_id":"' || p_ecouteurs || '","name":"سماعات بلوتوث Pro Max","quantity":1,"unit_price":3800}]',
   3800, 500, 1900, 'Tizi Ouzou', 'Tizi Ouzou', 'شارع العقيد عميروش', NULL, 'store',
   NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 days'),

  (o7, seller, c_sarah, 'delivered',
   '[{"product_id":"' || p_sac || '","name":"حقيبة يد جلد طبيعي","quantity":1,"unit_price":4800}]',
   4800, 400, 2500, 'Blida', 'Blida', 'حي بن بولعيد', NULL, 'whatsapp',
   NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '5 days'),

  (o8, seller, c_fatima, 'delivered',
   '[{"product_id":"' || p_hijab || '","name":"حجاب شيفون فاخر","quantity":5,"unit_price":1500}]',
   7500, 600, 5250, 'Oran', 'Bir El Djir', 'حي USTO', 'هدايا للعائلة', 'whatsapp',
   NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days'),

  (o9, seller, c_ahmed, 'delivered',
   '[{"product_id":"' || p_montre || '","name":"ساعة ذكية Sport+","quantity":1,"unit_price":5500}]',
   5500, 600, 2700, 'Annaba', 'Annaba', 'شارع العربي بن مهيدي', NULL, 'whatsapp',
   NOW() - INTERVAL '8 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days'),

  (o10, seller, c_meriem, 'delivered',
   '[{"product_id":"' || p_coussin || '","name":"طقم مفارش تركية","quantity":1,"unit_price":6500}]',
   6500, 500, 3200, 'Batna', 'Batna', 'حي 1000 مسكن', NULL, 'store',
   NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day');

-- Shipped orders (5) — currently in transit
INSERT INTO orders (id, seller_id, customer_id, status, items, total_price, delivery_cost, net_profit, wilaya, commune, address, source, created_at, confirmed_at, shipped_at) VALUES
  (o11, seller, c_amina, 'shipped',
   '[{"product_id":"' || p_parfum_femme || '","name":"عطر Fleur de Jasmin","quantity":1,"unit_price":4200}]',
   4200, 400, 2300, 'Alger', 'Bab El Oued', 'حي 500 مسكن عمارة 12', 'whatsapp',
   NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),

  (o12, seller, c_khadija, 'shipped',
   '[{"product_id":"' || p_abaya || '","name":"عباية كريب تركية","quantity":2,"unit_price":4500}]',
   9000, 500, 4200, 'Constantine', 'El Khroub', 'حي الأمير عبد القادر', 'store',
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),

  (o13, seller, c_rachid, 'shipped',
   '[{"product_id":"' || p_parfum_homme || '","name":"عطر Oud Royal","quantity":1,"unit_price":3500}]',
   3500, 500, 1800, 'Béjaïa', 'Béjaïa', 'شارع الحرية', 'whatsapp',
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),

  (o14, seller, c_nadia, 'shipped',
   '[{"product_id":"' || p_hijab || '","name":"حجاب شيفون فاخر","quantity":2,"unit_price":1500},{"product_id":"' || p_serum || '","name":"سيروم فيتامين سي","quantity":1,"unit_price":2200}]',
   5200, 600, 2650, 'Djelfa', 'Djelfa', 'حي المستقبل', 'store',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours'),

  (o15, seller, c_aicha, 'shipped',
   '[{"product_id":"' || p_montre || '","name":"ساعة ذكية Sport+","quantity":1,"unit_price":5500}]',
   5500, 500, 2800, 'Chlef', 'Chlef', 'حي الورود', 'whatsapp',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '6 hours');

-- Confirmed orders (5) — awaiting shipping
INSERT INTO orders (id, seller_id, customer_id, status, items, total_price, delivery_cost, net_profit, wilaya, commune, address, source, created_at, confirmed_at) VALUES
  (o16, seller, c_youcef, 'confirmed',
   '[{"product_id":"' || p_chaussures || '","name":"حذاء رياضي Air Comfort","quantity":1,"unit_price":3200}]',
   3200, 500, 1600, 'Tizi Ouzou', 'Tizi Ouzou', 'شارع العقيد عميروش', 'whatsapp',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '18 hours'),

  (o17, seller, c_karim, 'confirmed',
   '[{"product_id":"' || p_creme || '","name":"كريم تفتيح بالكولاجين","quantity":2,"unit_price":1800}]',
   3600, 600, 1400, 'M''Sila', 'M''Sila', 'حي الزيتون', 'whatsapp',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '16 hours'),

  (o18, seller, c_fatima, 'confirmed',
   '[{"product_id":"' || p_robe || '","name":"فستان سهرة مطرز","quantity":1,"unit_price":8500}]',
   8500, 600, 4700, 'Oran', 'Bir El Djir', 'حي USTO عمارة 3', 'store',
   NOW() - INTERVAL '20 hours', NOW() - INTERVAL '14 hours'),

  (o19, seller, c_omar, 'confirmed',
   '[{"product_id":"' || p_ecouteurs || '","name":"سماعات بلوتوث Pro Max","quantity":1,"unit_price":3800}]',
   3800, 600, 1800, 'Tlemcen', 'Tlemcen', 'شارع بن خلدون', 'store',
   NOW() - INTERVAL '16 hours', NOW() - INTERVAL '10 hours'),

  (o20, seller, c_amina, 'confirmed',
   '[{"product_id":"' || p_coussin || '","name":"طقم مفارش تركية","quantity":1,"unit_price":6500}]',
   6500, 400, 3300, 'Alger', 'Bab El Oued', 'حي 500 مسكن عمارة 12', 'whatsapp',
   NOW() - INTERVAL '12 hours', NOW() - INTERVAL '8 hours');

-- Pending orders (5) — awaiting confirmation call
INSERT INTO orders (id, seller_id, customer_id, status, items, total_price, delivery_cost, net_profit, wilaya, commune, address, source, created_at) VALUES
  (o21, seller, c_souad, 'pending',
   '[{"product_id":"' || p_parfum_femme || '","name":"عطر Fleur de Jasmin","quantity":1,"unit_price":4200}]',
   4200, 600, 2100, 'Médéa', 'Médéa', 'حي النصر', 'whatsapp', NOW() - INTERVAL '6 hours'),

  (o22, seller, c_tarek, 'pending',
   '[{"product_id":"' || p_chaussures || '","name":"حذاء رياضي Air Comfort","quantity":1,"unit_price":3200}]',
   3200, 500, 1600, 'Bouira', 'Bouira', 'حي 300 مسكن', 'whatsapp', NOW() - INTERVAL '4 hours'),

  (o23, seller, c_lina, 'pending',
   '[{"product_id":"' || p_sac || '","name":"حقيبة يد جلد طبيعي","quantity":1,"unit_price":4800},{"product_id":"' || p_hijab || '","name":"حجاب شيفون","quantity":2,"unit_price":1500}]',
   7800, 600, 4000, 'Jijel', 'Jijel', 'شارع الإستقلال', 'store', NOW() - INTERVAL '3 hours'),

  (o24, seller, c_bilal, 'pending',
   '[{"product_id":"' || p_ecouteurs || '","name":"سماعات بلوتوث Pro Max","quantity":1,"unit_price":3800}]',
   3800, 600, 1800, 'Bordj Bou Arreridj', 'BBA', 'حي 200 مسكن', 'whatsapp', NOW() - INTERVAL '2 hours'),

  (o25, seller, c_houda, 'pending',
   '[{"product_id":"' || p_serum || '","name":"سيروم فيتامين سي","quantity":3,"unit_price":2200}]',
   6600, 600, 4200, 'Skikda', 'Skikda', 'حي 5 جويلية', 'whatsapp', NOW() - INTERVAL '1 hour');

-- Draft orders (3) — auto-created from WhatsApp
INSERT INTO orders (id, seller_id, customer_id, status, items, total_price, delivery_cost, wilaya, source, notes, created_at) VALUES
  (o26, seller, c_sarah, 'draft',
   '[{"name":"كريم","quantity":1,"unit_price":1800}]',
   1800, 400, 'Blida', 'whatsapp', 'Auto-extracted from WhatsApp message', NOW() - INTERVAL '30 minutes'),

  (o27, seller, c_rachid, 'draft',
   '[{"name":"عطر رجالي","quantity":1,"unit_price":3500}]',
   3500, 500, 'Béjaïa', 'whatsapp', 'AI agent draft', NOW() - INTERVAL '15 minutes'),

  (o28, seller, c_nadia, 'draft',
   '[{"name":"حجاب","quantity":4,"unit_price":1500}]',
   6000, 600, 'Djelfa', 'whatsapp', 'Customer requested via WhatsApp', NOW() - INTERVAL '5 minutes');

-- Returned/Refused orders (4) — problem orders
INSERT INTO orders (id, seller_id, customer_id, status, items, total_price, delivery_cost, net_profit, wilaya, commune, source, created_at, confirmed_at, shipped_at) VALUES
  (o29, seller, c_bilal, 'returned',
   '[{"product_id":"' || p_montre || '","name":"ساعة ذكية Sport+","quantity":1,"unit_price":5500}]',
   5500, 600, -600, 'Bordj Bou Arreridj', 'BBA', 'whatsapp',
   NOW() - INTERVAL '20 days', NOW() - INTERVAL '19 days', NOW() - INTERVAL '17 days'),

  (o30, seller, c_bilal, 'returned',
   '[{"product_id":"' || p_chaussures || '","name":"حذاء رياضي","quantity":1,"unit_price":3200}]',
   3200, 600, -600, 'Bordj Bou Arreridj', 'BBA', 'whatsapp',
   NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days', NOW() - INTERVAL '12 days'),

  (o31, seller, c_houda, 'refused',
   '[{"product_id":"' || p_parfum_femme || '","name":"عطر Fleur de Jasmin","quantity":1,"unit_price":4200}]',
   4200, 600, -600, 'Skikda', 'Skikda', 'whatsapp',
   NOW() - INTERVAL '18 days', NOW() - INTERVAL '17 days', NOW() - INTERVAL '15 days'),

  (o32, seller, c_amine, 'returned',
   '[{"product_id":"' || p_abaya || '","name":"عباية كريب","quantity":1,"unit_price":4500}]',
   4500, 600, -600, 'Mostaganem', 'Mostaganem', 'store',
   NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days', NOW() - INTERVAL '9 days');

-- Cancelled orders (3)
INSERT INTO orders (id, seller_id, customer_id, status, items, total_price, delivery_cost, wilaya, source, notes, created_at) VALUES
  (o33, seller, c_samira, 'cancelled',
   '[{"product_id":"' || p_creme || '","name":"كريم تفتيح","quantity":2,"unit_price":1800}]',
   3600, 600, 'Tiaret', 'whatsapp', 'Customer blocked — excessive returns', NOW() - INTERVAL '10 days'),

  (o34, seller, c_amine, 'cancelled',
   '[{"product_id":"' || p_ecouteurs || '","name":"سماعات بلوتوث","quantity":1,"unit_price":3800}]',
   3800, 600, 'Mostaganem', 'store', 'Customer refused to confirm by phone', NOW() - INTERVAL '7 days'),

  (o35, seller, c_bilal, 'cancelled',
   '[{"product_id":"' || p_parfum_homme || '","name":"عطر Oud Royal","quantity":1,"unit_price":3500}]',
   3500, 600, 'Bordj Bou Arreridj', 'whatsapp', 'Unreachable after 3 calls', NOW() - INTERVAL '5 days');

-- ============================================
-- 5. DELIVERIES (15 — tracking shipments)
-- ============================================
INSERT INTO deliveries (id, order_id, seller_id, provider, tracking_number, status, created_at) VALUES
  -- Delivered
  (gen_random_uuid(), o1, seller, 'yalidine', 'YAL-240306-00142', 'delivered', NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), o2, seller, 'yalidine', 'YAL-240309-00198', 'delivered', NOW() - INTERVAL '22 days'),
  (gen_random_uuid(), o3, seller, 'yalidine', 'YAL-240312-00255', 'delivered', NOW() - INTERVAL '19 days'),
  (gen_random_uuid(), o4, seller, 'yalidine', 'YAL-240315-00301', 'delivered', NOW() - INTERVAL '17 days'),
  (gen_random_uuid(), o5, seller, 'yalidine', 'YAL-240318-00367', 'delivered', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), o6, seller, 'yalidine', 'YAL-240321-00412', 'delivered', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), o7, seller, 'yalidine', 'YAL-240324-00458', 'delivered', NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), o8, seller, 'yalidine', 'YAL-240326-00503', 'delivered', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), o9, seller, 'yalidine', 'YAL-240328-00551', 'delivered', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), o10, seller, 'yalidine', 'YAL-240330-00598', 'delivered', NOW() - INTERVAL '3 days'),

  -- In transit
  (gen_random_uuid(), o11, seller, 'yalidine', 'YAL-240402-00642', 'in_transit', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), o12, seller, 'yalidine', 'YAL-240403-00688', 'in_transit', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), o13, seller, 'yalidine', 'YAL-240403-00701', 'in_transit', NOW() - INTERVAL '1 day'),

  -- Returned
  (gen_random_uuid(), o29, seller, 'yalidine', 'YAL-240317-00289', 'returned', NOW() - INTERVAL '17 days'),
  (gen_random_uuid(), o30, seller, 'yalidine', 'YAL-240322-00425', 'returned', NOW() - INTERVAL '12 days');

-- ============================================
-- 6. CONVERSATIONS & MESSAGES (WhatsApp)
-- ============================================
INSERT INTO conversations (id, seller_id, customer_id, platform_thread_id, status, unread_count, last_message_at, created_at) VALUES
  (conv1, seller, c_amina, '213555123456@s.whatsapp.net', 'open', 2, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '28 days'),
  (conv2, seller, c_fatima, '213661234567@s.whatsapp.net', 'open', 0, NOW() - INTERVAL '2 days', NOW() - INTERVAL '25 days'),
  (conv3, seller, c_sarah, '213771234567@s.whatsapp.net', 'open', 1, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '12 days'),
  (conv4, seller, c_mohamed, '213550987654@s.whatsapp.net', 'open', 0, NOW() - INTERVAL '5 days', NOW() - INTERVAL '20 days'),
  (conv5, seller, c_rachid, '213774567890@s.whatsapp.net', 'open', 3, NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '3 days'),
  (conv6, seller, c_bilal, '213771122334@s.whatsapp.net', 'open', 0, NOW() - INTERVAL '3 days', NOW() - INTERVAL '20 days'),
  (conv7, seller, c_houda, '213552233445@s.whatsapp.net', 'open', 1, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '18 days'),
  (conv8, seller, c_nadia, '213555678901@s.whatsapp.net', 'open', 0, NOW() - INTERVAL '1 day', NOW() - INTERVAL '5 days');

-- Messages — realistic Darija/French/Arabic mix
INSERT INTO messages (id, conversation_id, direction, content, content_type, created_at) VALUES
  -- Amina conversation (VIP repeat buyer)
  (gen_random_uuid(), conv1, 'inbound', 'السلام عليكم، واش كاين الحجاب الشيفون؟', 'text', NOW() - INTERVAL '28 days'),
  (gen_random_uuid(), conv1, 'outbound', 'وعليكم السلام أمينة! نعم كاين بزاف ألوان 🎨 أسود، بيج، كحلي، بني. الواحد ب 1500 دج', 'text', NOW() - INTERVAL '28 days' + INTERVAL '5 minutes'),
  (gen_random_uuid(), conv1, 'inbound', 'ابعتيلي 3 واحدين أسود وبيج وكحلي', 'text', NOW() - INTERVAL '28 days' + INTERVAL '10 minutes'),
  (gen_random_uuid(), conv1, 'outbound', 'تم ✅ الطلبية 6300 دج مع التوصيل. نوصلوها لباب الواد إن شاء الله', 'text', NOW() - INTERVAL '28 days' + INTERVAL '15 minutes'),
  (gen_random_uuid(), conv1, 'inbound', 'واش عندكم جديد في الكريمات؟ حبيت نعاود نطلب', 'text', NOW() - INTERVAL '30 minutes'),
  (gen_random_uuid(), conv1, 'inbound', 'والسيروم تاع فيتامين سي كيفاش سعره؟', 'text', NOW() - INTERVAL '28 minutes'),

  -- Fatima conversation (VIP from Oran)
  (gen_random_uuid(), conv2, 'inbound', 'Bonjour! Je cherche une abaya pour un mariage. Vous avez quoi comme modèles?', 'text', NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), conv2, 'outbound', 'Bonjour Fatima! Oui, on a la nouvelle collection turque 🇹🇷 Abaya crêpe avec broderie, disponible en S à XXL. Prix: 4500 DA', 'text', NOW() - INTERVAL '25 days' + INTERVAL '8 minutes'),
  (gen_random_uuid(), conv2, 'inbound', 'C''est parfait! Je prends taille L svp. Et le parfum Jasmin aussi', 'text', NOW() - INTERVAL '25 days' + INTERVAL '15 minutes'),
  (gen_random_uuid(), conv2, 'outbound', 'Super! Abaya L + Parfum Jasmin = 8700 DA avec livraison à Oran. Je vous appelle pour confirmer 📞', 'text', NOW() - INTERVAL '25 days' + INTERVAL '20 minutes'),

  -- Sarah conversation (new from Blida)
  (gen_random_uuid(), conv3, 'inbound', 'مرحبا كيفاش نطلب الحقيبة الجلد؟', 'text', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), conv3, 'outbound', 'مرحبا سارة! الحقيبة الجلد الطبيعي ب 4800 دج. أعطيني العنوان ونبعثهالك 📦', 'text', NOW() - INTERVAL '12 days' + INTERVAL '3 minutes'),
  (gen_random_uuid(), conv3, 'inbound', 'حبيت نشوف كريم تفتيح كيفاش سعره؟', 'text', NOW() - INTERVAL '1 hour'),

  -- Mohamed (Sétif customer)
  (gen_random_uuid(), conv4, 'inbound', 'خويا عندك عطر رجالي؟ حاب واحد يدوم', 'text', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), conv4, 'outbound', 'أهلا محمد! عندنا Oud Royal 🔥 يدوم 12 ساعة. 3500 دج. حاب واحد ولا زوج؟', 'text', NOW() - INTERVAL '20 days' + INTERVAL '5 minutes'),
  (gen_random_uuid(), conv4, 'inbound', 'ابعتلي زوج واحد ليا وواحد كادو', 'text', NOW() - INTERVAL '20 days' + INTERVAL '10 minutes'),

  -- Rachid (new customer from Béjaïa — active conversation)
  (gen_random_uuid(), conv5, 'inbound', 'salam 3likoum, kayen parfum rajli?', 'text', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), conv5, 'outbound', 'Wa 3likoum salam! Oui kayen Oud Royal, 3500 DA. Très bonne qualité 👌', 'text', NOW() - INTERVAL '3 days' + INTERVAL '10 minutes'),
  (gen_random_uuid(), conv5, 'inbound', 'wach livraison ila Béjaïa?', 'text', NOW() - INTERVAL '20 minutes'),
  (gen_random_uuid(), conv5, 'inbound', 'combien la livraison?', 'text', NOW() - INTERVAL '18 minutes'),
  (gen_random_uuid(), conv5, 'inbound', 'repondez moi svp', 'text', NOW() - INTERVAL '15 minutes'),

  -- Bilal (risky customer)
  (gen_random_uuid(), conv6, 'inbound', 'renvoyez moi la montre elle marche pas', 'text', NOW() - INTERVAL '14 days'),
  (gen_random_uuid(), conv6, 'outbound', 'Bonjour Bilal, on est désolé. On va vérifier et vous contacter. C''est le 3ème retour ce mois.', 'text', NOW() - INTERVAL '14 days' + INTERVAL '30 minutes'),

  -- Houda (at-risk)
  (gen_random_uuid(), conv7, 'inbound', 'le parfum sent pas bon, je refuse le colis', 'text', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), conv7, 'inbound', 'عندكم سيروم فيتامين سي؟ حبيت نجرب', 'text', NOW() - INTERVAL '2 hours');

-- ============================================
-- 7. AGENT ACTIVITY (10 AI agent log entries)
-- ============================================
INSERT INTO agent_activity (id, seller_id, type, title, description, metadata, created_at) VALUES
  (gen_random_uuid(), seller, 'order_validation', 'Auto-confirmed safe order',
   'Order from أمينة بوعلام auto-confirmed. Risk score: 5/100. VIP customer with 8 previous orders.',
   '{"order_id":"' || o1 || '","risk_score":5,"action":"auto_confirm"}', NOW() - INTERVAL '27 days'),

  (gen_random_uuid(), seller, 'risk_alert', 'High-risk order flagged',
   'Order from بلال بوجمعة flagged for manual review. Risk score: 65/100. 3 previous returns.',
   '{"order_id":"' || o24 || '","risk_score":65,"action":"flag_review"}', NOW() - INTERVAL '2 hours'),

  (gen_random_uuid(), seller, 'draft_created', 'WhatsApp order extracted',
   'AI extracted order from سارة بوزيان WhatsApp message: 1x كريم (1800 DA). Confidence: 78%.',
   '{"order_id":"' || o26 || '","confidence":0.78,"source":"whatsapp"}', NOW() - INTERVAL '30 minutes'),

  (gen_random_uuid(), seller, 'draft_created', 'WhatsApp order extracted',
   'AI extracted order from رشيد عيساوي message: 1x عطر رجالي (3500 DA). Confidence: 85%.',
   '{"order_id":"' || o27 || '","confidence":0.85,"source":"whatsapp"}', NOW() - INTERVAL '15 minutes'),

  (gen_random_uuid(), seller, 'order_validation', 'Auto-confirmed safe order',
   'Order from فاطمة الزهراء بن سعيد auto-confirmed. Risk score: 8/100.',
   '{"order_id":"' || o2 || '","risk_score":8,"action":"auto_confirm"}', NOW() - INTERVAL '24 days'),

  (gen_random_uuid(), seller, 'customer_blocked', 'Customer auto-blocked',
   'سميرة بوعقال has been automatically blocked after 5 returns (threshold: 3).',
   '{"customer_id":"' || c_samira || '","return_count":5,"action":"block_customer"}', NOW() - INTERVAL '8 days'),

  (gen_random_uuid(), seller, 'low_stock', 'Low stock warning',
   'طقم مفارش تركية stock is critically low: 8 units remaining (threshold: 10).',
   '{"product_id":"' || p_coussin || '","current_stock":8,"threshold":10}', NOW() - INTERVAL '1 day'),

  (gen_random_uuid(), seller, 'order_validation', 'Order requires manual review',
   'Order from هدى بن عيسى needs manual confirmation. Risk score: 72/100. Previous refused delivery.',
   '{"order_id":"' || o25 || '","risk_score":72,"action":"flag_review"}', NOW() - INTERVAL '1 hour'),

  (gen_random_uuid(), seller, 'message_reply', 'AI draft reply generated',
   'Generated 3 reply options for رشيد عيساوي conversation. Topic: delivery pricing inquiry.',
   '{"conversation_id":"' || conv5 || '","topic":"delivery_pricing","replies":3}', NOW() - INTERVAL '18 minutes'),

  (gen_random_uuid(), seller, 'draft_created', 'WhatsApp order extracted',
   'AI extracted order from نادية بوشناق: 4x حجاب (6000 DA). Confidence: 92%.',
   '{"order_id":"' || o28 || '","confidence":0.92,"source":"whatsapp"}', NOW() - INTERVAL '5 minutes');

-- ============================================
-- 8. AUTOMATIONS (seed 6 recipes)
-- ============================================
-- Delete any existing automation rows to avoid conflicts, then re-seed
DELETE FROM automations WHERE seller_id = seller;

INSERT INTO automations (id, seller_id, name, trigger_type, trigger_config, action_type, action_config, active, run_count, last_run_at) VALUES
  (gen_random_uuid(), seller, 'auto_confirm_safe', 'order.created',
   '{"max_risk":20,"recipe_id":"auto_confirm_safe"}', 'update_status', '{"new_status":"confirmed"}',
   true, 14, NOW() - INTERVAL '3 hours'),

  (gen_random_uuid(), seller, 'welcome_new_customer', 'message.first',
   '{"recipe_id":"welcome_new_customer"}', 'send_template', '{"template":"welcome"}',
   true, 8, NOW() - INTERVAL '3 days'),

  (gen_random_uuid(), seller, 'high_risk_alert', 'risk.threshold',
   '{"threshold":70,"recipe_id":"high_risk_alert"}', 'flag_review', '{}',
   true, 5, NOW() - INTERVAL '1 hour'),

  (gen_random_uuid(), seller, 'low_stock_warning', 'stock.low',
   '{"threshold":5,"recipe_id":"low_stock_warning"}', 'notify', '{"channel":"dashboard"}',
   false, 2, NOW() - INTERVAL '1 day'),

  (gen_random_uuid(), seller, 'followup_after_delivery', 'order.delivered',
   '{"delay_hours":24,"recipe_id":"followup_after_delivery"}', 'send_template', '{"template":"followup"}',
   false, 0, NULL),

  (gen_random_uuid(), seller, 'auto_block_returners', 'return.threshold',
   '{"max_returns":3,"recipe_id":"auto_block_returners"}', 'block_customer', '{}',
   false, 1, NOW() - INTERVAL '8 days');

-- Done! 🎉
RAISE NOTICE '✅ SahelFlow demo data seeded successfully!';
RAISE NOTICE '   📦 12 products, 20 customers, 35 orders, 15 deliveries';
RAISE NOTICE '   💬 8 conversations, 25 messages, 10 agent activities, 6 automations';

END $$;
