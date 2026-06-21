-- BSC migration 2026-06-21 — durable pricelist-extract drafts (D2 / Phase 5)
-- Persists a supplier's REVIEWED extract set so edits survive closing the modal
-- (they used to live only in browser state and were lost on close). Written
-- only via the service-role route /api/supplier/save-extract-draft (RLS on, no
-- policy → no anon/auth direct access; service-role bypasses RLS).

CREATE TABLE IF NOT EXISTS public.supplier_extract_drafts (
  supplier_id uuid PRIMARY KEY REFERENCES public.suppliers(id) ON DELETE CASCADE,
  rows        jsonb       NOT NULL DEFAULT '[]'::jsonb,  -- the reviewed/edited extract rows
  locked      boolean     NOT NULL DEFAULT false,        -- founder "lock" — set true on Save+Lock
  locked_at   timestamptz,
  locked_by   uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

COMMENT ON TABLE public.supplier_extract_drafts IS
  'Durable store for a supplier''s reviewed pricelist-extract rows (server-authoritative Save / D2). One row per supplier.';

ALTER TABLE public.supplier_extract_drafts ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service-role route may read/write this table.
