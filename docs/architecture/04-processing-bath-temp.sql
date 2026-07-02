-- Card 5 (Deveining) logs a REQUIRED bath temperature. temp_location has no
-- deveining/processing-bath value yet — add one. Enum-first, then the card uses it.
-- (ADD VALUE cannot run inside a txn block with other statements in some tools;
--  run this line on its own.)
alter type public.temp_location add value if not exists 'processing_bath';
