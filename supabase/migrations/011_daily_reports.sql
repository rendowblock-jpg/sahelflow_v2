-- Create daily analytics reports table
CREATE TABLE IF NOT EXISTS public.daily_analytics_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.sellers(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    total_orders INTEGER NOT NULL DEFAULT 0,
    confirmed_orders INTEGER NOT NULL DEFAULT 0,
    shipped_orders INTEGER NOT NULL DEFAULT 0,
    delivered_orders INTEGER NOT NULL DEFAULT 0,
    returned_orders INTEGER NOT NULL DEFAULT 0,
    refused_orders INTEGER NOT NULL DEFAULT 0,
    revenue NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    top_products JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_seller_date UNIQUE(seller_id, report_date)
);

-- Enable RLS
ALTER TABLE public.daily_analytics_reports ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists and create select policy
DROP POLICY IF EXISTS "view_own_reports" ON public.daily_analytics_reports;
CREATE POLICY "view_own_reports" ON public.daily_analytics_reports
    FOR SELECT TO authenticated
    USING (public.check_user_seller_access(seller_id));

-- Allow service role to do everything
DROP POLICY IF EXISTS "service_role_all" ON public.daily_analytics_reports;
CREATE POLICY "service_role_all" ON public.daily_analytics_reports
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
