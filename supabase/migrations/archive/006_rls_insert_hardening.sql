-- Migration 006: Harden INSERT RLS policies with WITH CHECK constraints
-- Problem: Several INSERT policies had no WITH CHECK, allowing any authenticated
-- user to insert rows with a forged seller_id. Safe in per-client deployment,
-- but defense-in-depth matters for production hardening.
--
-- Tables affected: categories, products, notifications, whatsapp_templates, import_batches
-- NOT changed: agent_activity (intentionally open for service_role system inserts)

-- 1. Categories: Drop and recreate INSERT policy with WITH CHECK
DROP POLICY IF EXISTS "categories_seller_write" ON categories;
CREATE POLICY "categories_seller_write" ON categories
  FOR INSERT
  WITH CHECK (seller_id = (SELECT auth.uid()));

-- 2. Products: Drop and recreate INSERT policy with WITH CHECK
DROP POLICY IF EXISTS "products_seller_write" ON products;
CREATE POLICY "products_seller_write" ON products
  FOR INSERT
  WITH CHECK (seller_id = (SELECT auth.uid()));

-- 3. Notifications: Drop and recreate INSERT policy with WITH CHECK
DROP POLICY IF EXISTS "notifications_seller_insert" ON notifications;
CREATE POLICY "notifications_seller_insert" ON notifications
  FOR INSERT
  WITH CHECK (seller_id = (SELECT auth.uid()));

-- 4. WhatsApp Templates: Drop and recreate INSERT policy with WITH CHECK
DROP POLICY IF EXISTS "Sellers can insert own templates" ON whatsapp_templates;
CREATE POLICY "Sellers can insert own templates" ON whatsapp_templates
  FOR INSERT
  WITH CHECK (seller_id = (SELECT auth.uid()));

-- 5. Import Batches: Drop and recreate INSERT policy with WITH CHECK
DROP POLICY IF EXISTS "import_batches_seller_insert" ON import_batches;
CREATE POLICY "import_batches_seller_insert" ON import_batches
  FOR INSERT
  WITH CHECK (seller_id = (SELECT auth.uid()));

-- Note: agent_activity INSERT policy is left as-is because the system
-- (via service_role) inserts activity records on behalf of sellers.
-- Restricting it would break the agent activity logging flow.
