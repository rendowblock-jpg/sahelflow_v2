-- Add unique constraint to customers (seller_id, phone) to enable atomic upsert

-- First, deduplicate existing customers if they have exactly the same phone and seller_id.
-- We keep the most recent one.
DELETE FROM public.customers a
USING public.customers b
WHERE a.seller_id = b.seller_id
  AND a.phone = b.phone
  AND a.created_at < b.created_at;

-- Now add the unique constraint
ALTER TABLE public.customers
ADD CONSTRAINT customers_seller_phone_key UNIQUE (seller_id, phone);
