ALTER TABLE public.product_pricing ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false;
