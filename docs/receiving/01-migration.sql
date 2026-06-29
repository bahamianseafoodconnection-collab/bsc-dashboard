-- =====================================================================
-- docs/receiving/01-migration.sql   (G4 — receiving → inventory)
--
-- Adds a "received into stock" marker to purchase_invoices so the founder
-- Receiving queue can show what still needs to be received (and not double-
-- receive). The actual stock increment is done by the record_inventory_in()
-- RPC, which writes inventory_movements (+ current_stock) with the invoice
-- number + photo attached.
--
-- Idempotent.
-- =====================================================================

alter table public.purchase_invoices
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid;

create index if not exists purchase_invoices_unreceived_idx
  on public.purchase_invoices (received_at, created_at desc);
