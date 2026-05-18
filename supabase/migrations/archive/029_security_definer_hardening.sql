-- ============================================================
-- SahelFlow Migration 029: Harden SECURITY DEFINER Functions
-- ============================================================
-- Issues fixed (flagged by Supabase security advisor):
-- 1. atomic_create_order had NO auth check — any authenticated user
--    could create orders for ANY seller by passing a different seller_id.
-- 2. atomic_update_order_status auth check was overly complex and fragile.
-- 3. All 4 SECURITY DEFINER functions were callable by the anon role.
-- 4. handle_new_user should never be called directly (trigger-only).
--
-- Applied: 2026-04-29 via full codebase audit
-- ============================================================

-- ── 1. Fix atomic_create_order: add seller_id + role auth guard ──
-- DROPPED AND RE-CREATED (PostgreSQL requires drop when replacing body)
DROP FUNCTION IF EXISTS public.atomic_create_order(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.atomic_create_order(
  p_seller_id UUID, p_customer_name TEXT, p_customer_phone TEXT,
  p_customer_wilaya TEXT, p_customer_commune TEXT, p_customer_address TEXT,
  p_items JSONB, p_total_price NUMERIC, p_delivery_cost NUMERIC,
  p_net_profit NUMERIC, p_wilaya TEXT, p_commune TEXT, p_address TEXT,
  p_source TEXT, p_external_id TEXT, p_notes TEXT, p_delivery_type TEXT,
  p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_current_stock INT;
  v_seller_wilaya TEXT;
  v_role TEXT;
BEGIN
  -- 0. Authorization: verify caller owns this seller_id OR is service_role
  BEGIN
    v_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  -- Reject anon (and any unauthenticated non-service_role caller)
  IF auth.uid() IS NULL AND COALESCE(v_role, '') != 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  -- Authenticated users must match the seller_id they claim
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_seller_id THEN
    RAISE EXCEPTION 'Unauthorized: seller_id mismatch';
  END IF;

  -- 1. Upsert customer
  IF p_customer_phone IS NOT NULL AND p_customer_phone != '' THEN
    INSERT INTO customers (seller_id, name, phone, wilaya, commune, address)
    VALUES (p_seller_id, p_customer_name, p_customer_phone, p_customer_wilaya, p_customer_commune, p_customer_address)
    ON CONFLICT (seller_id, phone) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, customers.name),
      wilaya = COALESCE(EXCLUDED.wilaya, customers.wilaya),
      commune = COALESCE(EXCLUDED.commune, customers.commune),
      address = COALESCE(EXCLUDED.address, customers.address),
      updated_at = now()
    RETURNING id INTO v_customer_id;
  END IF;

  -- 2. Verify and optionally deduct stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULL;
    v_quantity := COALESCE((v_item->>'quantity')::INT, 1);
    BEGIN
      v_product_id := (v_item->>'product_id')::UUID;
    EXCEPTION WHEN others THEN
      v_product_id := NULL;
    END;

    IF v_product_id IS NOT NULL AND v_quantity > 0 THEN
      SELECT stock INTO v_current_stock
      FROM products
      WHERE id = v_product_id AND seller_id = p_seller_id
      FOR UPDATE;

      IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
        RAISE EXCEPTION 'Insufficient stock for product %. Available: %, Requested: %', v_product_id, v_current_stock, v_quantity;
      END IF;

      IF p_status = 'confirmed' AND v_current_stock IS NOT NULL THEN
        UPDATE products SET stock = stock - v_quantity, updated_at = now()
        WHERE id = v_product_id AND seller_id = p_seller_id;
      END IF;
    END IF;
  END LOOP;

  -- 3. Generate order number
  v_order_number := 'SF-' || upper(substring(to_char(now(), 'YYYYMMDDHH24MISS'), 1, 10)) || '-' || upper(substring(md5(random()::text), 1, 4));

  -- 4. Get seller wilaya
  SELECT wilaya INTO v_seller_wilaya FROM sellers WHERE id = p_seller_id;

  -- 5. Create order
  INSERT INTO orders (
    seller_id, customer_id, order_number, status, source, external_id,
    items, total_price, delivery_cost, net_profit,
    wilaya, commune, address, notes, delivery_type, risk_score
  ) VALUES (
    p_seller_id, v_customer_id, v_order_number, p_status, p_source, p_external_id,
    p_items, p_total_price, p_delivery_cost, p_net_profit,
    p_wilaya, p_commune, p_address, p_notes, p_delivery_type, 0
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number,
    'customer_id', v_customer_id, 'status', p_status
  );
END;
$$;

-- ── 2. Fix atomic_update_order_status: simplify + robustify auth guard ──
CREATE OR REPLACE FUNCTION public.atomic_update_order_status(
  p_order_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_seller_id UUID;
  v_customer_id UUID;
  v_items JSONB;
  v_total_price NUMERIC;
  v_item JSONB;
  v_product_id UUID;
  v_quantity INT;
  v_result JSONB;
  v_role TEXT;
BEGIN
  -- 1. Lock order
  SELECT status, seller_id, customer_id, items, total_price
  INTO v_current_status, v_seller_id, v_customer_id, v_items, v_total_price
  FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- 1b. Authorization: sellers can only update their own orders; service_role bypasses
  BEGIN
    v_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  IF COALESCE(v_role, '') != 'service_role' AND auth.uid() IS DISTINCT FROM v_seller_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 2. State machine
  IF v_current_status IN ('delivered', 'returned', 'refused', 'cancelled') AND p_new_status != v_current_status THEN
    RAISE EXCEPTION 'Cannot transition from terminal state %', v_current_status;
  END IF;

  IF v_current_status = p_new_status THEN
    SELECT row_to_json(orders.*) INTO v_result FROM orders WHERE id = p_order_id;
    RETURN v_result;
  END IF;

  -- 3. Stock manipulation
  IF p_new_status = 'confirmed' AND v_current_status != 'confirmed' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;
      IF v_product_id IS NOT NULL AND v_quantity IS NOT NULL THEN
        UPDATE products SET stock = GREATEST(0, stock - v_quantity)
        WHERE id = v_product_id AND seller_id = v_seller_id;
      END IF;
    END LOOP;
  END IF;

  IF p_new_status IN ('returned', 'cancelled', 'refused') AND v_current_status IN ('confirmed', 'shipped') THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_product_id := (v_item->>'product_id')::UUID;
      v_quantity := (v_item->>'quantity')::INT;
      IF v_product_id IS NOT NULL AND v_quantity IS NOT NULL THEN
        UPDATE products SET stock = stock + v_quantity
        WHERE id = v_product_id AND seller_id = v_seller_id;
      END IF;
    END LOOP;
  END IF;

  -- 4. Update order
  UPDATE orders SET
    status = p_new_status,
    confirmed_at = CASE WHEN p_new_status = 'confirmed' THEN now() ELSE confirmed_at END,
    shipped_at = CASE WHEN p_new_status = 'shipped' THEN now() ELSE shipped_at END,
    delivered_at = CASE WHEN p_new_status = 'delivered' THEN now() ELSE delivered_at END,
    updated_at = now()
  WHERE id = p_order_id;

  -- 5. Update customer stats
  IF v_customer_id IS NOT NULL AND p_new_status = 'delivered' AND v_current_status != 'delivered' THEN
    UPDATE customers SET
      order_count = COALESCE(order_count, 0) + 1,
      total_spent = COALESCE(total_spent, 0) + COALESCE(v_total_price, 0)
    WHERE id = v_customer_id;
  END IF;

  SELECT row_to_json(orders.*) INTO v_result FROM orders WHERE id = p_order_id;
  RETURN v_result;
END;
$$;

-- ── 3. Revoke EXECUTE from anon on all SECURITY DEFINER functions ──
REVOKE EXECUTE ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.atomic_update_order_status(UUID,TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_aggregates() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;

-- ── 4. handle_new_user is trigger-only — revoke from authenticated too ──
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- ── 5. Ensure service_role retains execute on all functions ──
GRANT EXECUTE ON FUNCTION public.atomic_create_order(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,NUMERIC,NUMERIC,NUMERIC,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_update_order_status(UUID,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_aggregates() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
