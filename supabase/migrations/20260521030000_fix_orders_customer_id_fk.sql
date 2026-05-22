-- =====================================================================
-- 20260521030000_fix_orders_customer_id_fk.sql
--
-- BUG: orders_customer_id_fkey was REFERENCES users(id) — a legacy
--      misroute from when "customer" meant "logged-in user", before
--      the dedicated customers table existed. Every cashier-driven
--      customer save quietly fell off the cliff: the inline
--      supabase.from('customers').insert(...) in handleCheckout was
--      blocked by RLS, customerId stayed null, and orders saved with
--      customer_id = null. The bug surfaced on 2026-05-21 when
--      Patricia Rolle was the first customer ever rung up with a
--      real (service-role-created) customers.id — Postgres tried to
--      validate that UUID against users(id), failed FK, and the order
--      crashed with 23503.
--
-- DIAGNOSTIC EVIDENCE before this migration ran:
--   - SELECT pg_get_constraintdef on orders_customer_id_fkey showed
--     REFERENCES users(id), not customers(id).
--   - Dry-run INSERT in a ROLLBACK transaction returned:
--       ERROR: 23503: insert or update on table "orders" violates
--       foreign key constraint "orders_customer_id_fkey"
--       DETAIL: Key (customer_id)=(1b1e314f-...) is not present in
--       table "users".
--   - Orphan check across orders showed 0 non-null customer_id values
--     that were missing from customers (because none of them were
--     ever populated — the bug masked itself for years).
--
-- FIX: drop the wrong FK, add the correct one pointing to customers.
-- ON DELETE SET NULL preserves order history if a customer row is
-- ever removed.
--
-- ROLLBACK PLAN: if this needs to be reverted, run the inverse:
--   ALTER TABLE orders DROP CONSTRAINT orders_customer_id_fkey;
--   ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey
--     FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL;
--   NOTIFY pgrst, 'reload schema';
-- (Note: reverting restores the broken state — only do this if the new
-- FK is causing some unforeseen issue. Customer history is unaffected
-- by the rollback because customer_name + customer_phone live on orders.)
-- =====================================================================

BEGIN;

ALTER TABLE public.orders
  DROP CONSTRAINT orders_customer_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id)
  REFERENCES public.customers(id)
  ON DELETE SET NULL;

COMMIT;

-- Refresh PostgREST schema cache so the new FK is visible immediately
-- without restarting the service.
NOTIFY pgrst, 'reload schema';
