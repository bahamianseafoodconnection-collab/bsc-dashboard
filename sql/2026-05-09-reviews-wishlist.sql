-- BSC Dashboard — product reviews + wishlists
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Two tables:
--   product_reviews — star rating + body + author per (product, customer)
--   wishlists       — saved products per (customer, product)
--
-- Customer identity is stored on TWO fields so both online (auth.users)
-- and POS-tracked customers can leave reviews / save wishlists later:
--   - auth_user_id  (uuid, indexed) — set when an authenticated customer reviews
--   - customer_id   (uuid, indexed) — links to public.customers.id
--
-- Reviews are auto-approved on insert (status='approved'). A future
-- moderation flow can flip status to 'rejected' to hide a review without
-- deleting the row.

-- ─── product_reviews ───────────────────────────────────────────────
drop table if exists public.product_reviews cascade;

create table public.product_reviews (
  id              uuid          primary key default gen_random_uuid(),
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  product_id      uuid          not null
                  references public.products(id) on delete cascade,

  -- Author — at least one of these must be set
  auth_user_id    uuid,
  customer_id     uuid,

  -- Display name + rating + body
  author_name     text          not null,
  rating          integer       not null check (rating between 1 and 5),
  title           text,
  body            text,

  -- Moderation status — future-proofing
  status          text          not null default 'approved'
                  check (status in ('approved','pending','rejected')),

  -- Did this author actually buy this product? (set by app code on insert)
  is_verified_purchase boolean  not null default false
);

create index reviews_product_idx     on public.product_reviews (product_id, created_at desc);
create index reviews_auth_user_idx   on public.product_reviews (auth_user_id) where auth_user_id is not null;
create index reviews_customer_idx    on public.product_reviews (customer_id)  where customer_id  is not null;
create index reviews_status_idx      on public.product_reviews (status, created_at desc);

-- One review per (auth_user_id, product_id) — duplicate insert errors out.
create unique index reviews_unique_user_product
  on public.product_reviews (auth_user_id, product_id)
  where auth_user_id is not null;

alter table public.product_reviews enable row level security;

drop policy if exists "reviews_select_anyone" on public.product_reviews;
drop policy if exists "reviews_insert_authed" on public.product_reviews;
drop policy if exists "reviews_update_own"    on public.product_reviews;
drop policy if exists "reviews_delete_own"    on public.product_reviews;

-- Anyone can read approved reviews (public ratings on the product page)
create policy "reviews_select_anyone"
  on public.product_reviews for select
  using (status = 'approved');

-- Authenticated users can insert reviews tagged to their auth_user_id
create policy "reviews_insert_authed"
  on public.product_reviews for insert
  with check (auth.uid() is not null and auth.uid() = auth_user_id);

-- Author can update their own review
create policy "reviews_update_own"
  on public.product_reviews for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

-- Author can delete their own review
create policy "reviews_delete_own"
  on public.product_reviews for delete
  using (auth.uid() = auth_user_id);

-- ─── wishlists ─────────────────────────────────────────────────────
drop table if exists public.wishlists cascade;

create table public.wishlists (
  id            uuid          primary key default gen_random_uuid(),
  created_at    timestamptz   not null default now(),

  product_id    uuid          not null
                references public.products(id) on delete cascade,
  auth_user_id  uuid          not null,
  customer_id   uuid
);

create index wishlists_user_idx    on public.wishlists (auth_user_id, created_at desc);
create index wishlists_product_idx on public.wishlists (product_id);

-- A user can save a product once (idempotent toggle).
create unique index wishlists_unique_user_product
  on public.wishlists (auth_user_id, product_id);

alter table public.wishlists enable row level security;

drop policy if exists "wishlists_select_own" on public.wishlists;
drop policy if exists "wishlists_insert_own" on public.wishlists;
drop policy if exists "wishlists_delete_own" on public.wishlists;

-- Wishlists are private — only the owner can see/touch theirs
create policy "wishlists_select_own"
  on public.wishlists for select
  using (auth.uid() = auth_user_id);

create policy "wishlists_insert_own"
  on public.wishlists for insert
  with check (auth.uid() is not null and auth.uid() = auth_user_id);

create policy "wishlists_delete_own"
  on public.wishlists for delete
  using (auth.uid() = auth_user_id);
