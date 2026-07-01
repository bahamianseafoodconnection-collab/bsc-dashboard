-- Step 2: capture the raw-batch purchase cost at intake (processor take-in form).
alter table public.spinytails_lot_intakes
  add column if not exists purchase_cost numeric;
