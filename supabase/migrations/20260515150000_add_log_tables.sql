-- Creates the three logging tables the new staff-facing log pages depend on:
--   catch_logs           — TJ / right_hand log every supplier delivery
--   processing_logs      — Nicholson / Dashnelle log every Spiny Tail batch
--   traceability_records — joins catch → processing → sale for audit / QR
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS so it is safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS catch_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name   text,
  species         text NOT NULL,
  catch_location  text,
  catch_date      date NOT NULL,
  raw_weight_lb   numeric(12, 2) NOT NULL CHECK (raw_weight_lb > 0),
  condition       text,
  notes           text,
  logged_by       uuid,
  created_at      timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processing_logs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catch_log_id       uuid REFERENCES catch_logs(id) ON DELETE SET NULL,
  species            text,
  raw_weight_lb      numeric(12, 2),
  finished_weight_lb numeric(12, 2) NOT NULL CHECK (finished_weight_lb >= 0),
  yield_pct          numeric(6, 2),
  loss_pct           numeric(6, 2),
  process_type       text,
  quality_grade      text,
  notes              text,
  logged_by          uuid,
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS traceability_records (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catch_log_id       uuid REFERENCES catch_logs(id) ON DELETE SET NULL,
  processing_log_id  uuid REFERENCES processing_logs(id) ON DELETE SET NULL,
  order_id           uuid REFERENCES orders(id) ON DELETE SET NULL,
  species            text,
  qr_payload         text,
  export_status      text NOT NULL DEFAULT 'pending',
  created_at         timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catch_logs_created_at         ON catch_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_logs_created_at    ON processing_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_processing_logs_catch         ON processing_logs(catch_log_id);
CREATE INDEX IF NOT EXISTS idx_traceability_records_created  ON traceability_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traceability_records_species  ON traceability_records(species);
CREATE INDEX IF NOT EXISTS idx_traceability_records_export   ON traceability_records(export_status);

COMMIT;
