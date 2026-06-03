-- 20260603110000_supplier_pricelists_bucket.sql
--
-- Captures in repo the supplier-pricelists Storage bucket + RLS that
-- shipped live on 2026-06-03 to unblock "Upload failed: Bucket not
-- found" on /supplier admin. Public bucket (so the pricelist link
-- works without auth in a browser tab), 20MB cap, PDF + image MIME
-- types only.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'supplier-pricelists',
  'supplier-pricelists',
  TRUE,
  20971520,  -- 20 MB
  ARRAY['application/pdf','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS p_supplier_pricelists_public_read   ON storage.objects;
DROP POLICY IF EXISTS p_supplier_pricelists_staff_write   ON storage.objects;
DROP POLICY IF EXISTS p_supplier_pricelists_staff_update  ON storage.objects;
DROP POLICY IF EXISTS p_supplier_pricelists_staff_delete  ON storage.objects;

CREATE POLICY p_supplier_pricelists_public_read
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'supplier-pricelists');

CREATE POLICY p_supplier_pricelists_staff_write
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'supplier-pricelists');

CREATE POLICY p_supplier_pricelists_staff_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'supplier-pricelists')
  WITH CHECK (bucket_id = 'supplier-pricelists');

CREATE POLICY p_supplier_pricelists_staff_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'supplier-pricelists');

-- suppliers columns (idempotent — the upload UI writes to these)
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS pricelist_url         TEXT,
  ADD COLUMN IF NOT EXISTS pricelist_filename    TEXT,
  ADD COLUMN IF NOT EXISTS pricelist_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pricelist_uploaded_by UUID;

DO $$
BEGIN
  RAISE NOTICE '✅ supplier-pricelists bucket + RLS + suppliers columns synced.';
END $$;
