-- =====================================================================
-- BSC Migration: 20260525030000_orders_customer_address.sql
--
-- Add orders.customer_address column to fix /pickup-queue's
-- "Data setup is incomplete" error.
--
-- Root cause: the pickup-queue page SELECTs 15 columns from orders
-- including customer_address (app/pickup-queue/page.tsx:110). The
-- column was never added by any prior migration — /checkout has been
-- writing customer_address into the order INSERT (line 300) since
-- the public ecommerce flow shipped, but the value was silently
-- dropped at the DB layer (or the INSERT was partially failing
-- depending on Postgres / PostgREST schema-cache state).
--
-- Fix: add the nullable text column. RLS unchanged (orders RLS
-- already covers it via is_staff() + customer-own predicates).
--
-- Applied to prod via Supabase SQL Editor on 2026-05-25 (verify
-- query returned customer_address / text / YES). This file records
-- the change in repo for migration audit trail.
-- =====================================================================

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_address TEXT;

COMMIT;
