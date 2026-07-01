-- Step 1 permissions fix. Run in the Supabase SQL editor. Idempotent.

-- 1) Restore the processing/QC staff set so processors can read/add HACCP data.
create or replace function public.is_bsc_qc_staff()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.profiles
    where id = auth.uid() and coalesce(is_active,true)=true
      and role::text in ('founder','co_founder','control_admin','basic_admin',
                         'manager','processor','receiver','operations','qc_staff'));
$$;

-- 2) suppliers: all internal staff can SEE; supplier_handler can add/edit.
drop policy if exists suppliers_select_internal_staff on public.suppliers;
create policy suppliers_select_internal_staff on public.suppliers
  for select using (public.bsc_is_internal_staff());

drop policy if exists suppliers_ins_supplier_handler on public.suppliers;
create policy suppliers_ins_supplier_handler on public.suppliers for insert
  with check (exists(select 1 from public.profiles where id=auth.uid() and role::text='supplier_handler'));

drop policy if exists suppliers_upd_supplier_handler on public.suppliers;
create policy suppliers_upd_supplier_handler on public.suppliers for update
  using      (exists(select 1 from public.profiles where id=auth.uid() and role::text='supplier_handler'))
  with check (exists(select 1 from public.profiles where id=auth.uid() and role::text='supplier_handler'));

-- 3) products: internal staff (incl supplier_handler) see extracted (pending) products.
drop policy if exists p_products_select_internal_staff on public.products;
create policy p_products_select_internal_staff on public.products
  for select using (public.bsc_is_internal_staff());
