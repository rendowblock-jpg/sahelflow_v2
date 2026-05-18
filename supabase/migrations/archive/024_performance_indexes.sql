-- Migration 024: Performance Indexes
-- Phase 64E: Optimizes high-frequency query paths identified in the codebase analysis.
--
-- These indexes target the most common WHERE/ORDER BY combinations used by
-- the decomposed service modules and AI agent tool queries.

-- Orders: status filter + created_at sort (used by getOrders, agent dashboard_stats)
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders (seller_id, status, created_at DESC);

-- Orders: customer lookup (used by getOrdersByCustomer, risk score calc)
CREATE INDEX IF NOT EXISTS idx_orders_customer
  ON orders (customer_id, created_at DESC);

-- Products: category filter + sort (used by getProducts with category filter)
CREATE INDEX IF NOT EXISTS idx_products_category
  ON products (seller_id, category_id, created_at DESC);

-- Customers: phone lookup for atomic upsert (used by findOrCreateCustomer)
CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON customers (seller_id, phone);

-- Messages: conversation lookup + time sort (used by inbox, AI conversation history)
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, created_at DESC);

-- Agent Activity: seller + time sort (used by getAgentActivity, dashboard)
CREATE INDEX IF NOT EXISTS idx_agent_activity_seller
  ON agent_activity (seller_id, created_at DESC);

-- Webhook Retry Queue: pending events for cron processor
CREATE INDEX IF NOT EXISTS idx_retry_queue_pending
  ON webhook_retry_queue (status, next_retry_at ASC)
  WHERE status IN ('pending', 'processing');

-- Deliveries: order lookup (used by delivery service joins)
CREATE INDEX IF NOT EXISTS idx_deliveries_order
  ON deliveries (order_id);

-- Automations: active recipes for trigger matching (used by executeRecipes)
CREATE INDEX IF NOT EXISTS idx_automations_active
  ON automations (seller_id, active, trigger_type)
  WHERE active = true;
