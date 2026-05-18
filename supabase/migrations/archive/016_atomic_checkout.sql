-- Atomic Checkout RPC
-- Single-transaction order creation: customer upsert, stock verification, optional stock deduction, order insert.
-- Eliminates race conditions and fire-and-forget overselling.

CREATE OR REPLACE FUNCTION atomic_create_order(
  p_seller_id UUID,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_wilaya TEXT DEFAULT NULL,
  p_customer_commune TEXT DEFAULT NULL,
  p_customer_address TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]',
  p_total_price NUMERIC DEFAULT 0,
  p_delivery_cost NUMERIC DEFAULT 0,
  p_net_profit NUMERIC DEFAULT 0,
  p_wilaya TEXT DEFAULT NULL,
  p_commune TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'webstore',
  p_external_id TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_delivery_type TEXT DEFAULT 'home',
  p_status TEXT DEFAULT 'pending'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  -- 1. Upsert customer (by phone if provided)
  IF p_customer_phone IS NOT NULL AND p_customer_phone != '' THEN
    INSERT INTO customers (seller_id, name, phone, wilaya, commune, address)
    VALUES (
      p_seller_id,
      p_customer_name,
      p_customer_phone,
      p_customer_wilaya,
      p_customer_commune,
      p_customer_address
    )
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

      -- Conditional deduction: only deduct if status is 'confirmed'
      IF p_status = 'confirmed' AND v_current_stock IS NOT NULL THEN
        UPDATE products SET stock = stock - v_quantity, updated_at = now()
        WHERE id = v_product_id AND seller_id = p_seller_id;
      END IF;
    END IF;
  END LOOP;

  -- 3. Generate order number
  v_order_number := 'SF-' || upper(substring(to_char(now(), 'YYYYMMDDHH24MISS'), 1, 10)) || '-' || upper(substring(md5(random()::text), 1, 4));

  -- 4. Get seller's wilaya for shipping rate lookups
  SELECT wilaya INTO v_seller_wilaya FROM sellers WHERE id = p_seller_id;

  -- 5. Create the order
  INSERT INTO orders (
    seller_id, customer_id, order_number, status, source, external_id,
    items, total_price, delivery_cost, net_profit,
    wilaya, commune, address, notes, delivery_type,
    risk_score
  )
  VALUES (
    p_seller_id, v_customer_id, v_order_number, p_status, p_source, p_external_id,
    p_items, p_total_price, p_delivery_cost, p_net_profit,
    p_wilaya, p_commune, p_address, p_notes, p_delivery_type,
    0
  )
  RETURNING id INTO v_order_id;

  -- 6. Return the created order
  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'customer_id', v_customer_id,
    'status', p_status
  );
END;
$$;
