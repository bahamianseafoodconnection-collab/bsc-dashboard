# BSC Dashboard — Full System Audit

**Date:** 2026-06-07
**Mode:** Read-only. No edits, no migrations applied, no commits, no deploys.

---

# BATCH 1 — CUSTOMER-FACING SURFACES (39 pages)

Public storefront, account, checkout, ordering, payment, post-purchase. URLs without auth or with customer-role auth.

**Landing & marketing**
- `app/page.tsx` — landing page (bscbahamas.com)
- `app/contact/page.tsx` — contact form
- `app/legal/page.tsx` — legal/privacy/terms
- `app/help/page.tsx` — help center
- `app/become-a-supplier/page.tsx` — supplier application form (public)

**Marketplace browse**
- `app/market/page.tsx` — main shopfront (online_market channel; broken on Dedrick's browser per cache)
- `app/category/[slug]/page.tsx` — category browse
- `app/product/[id]/page.tsx` — PDP (product detail)
- `app/shop/farm-fresh/page.tsx` — farm-fresh shop slice
- `app/shop/fresh-catch/page.tsx` — fresh-catch shop slice
- `app/local-wholesale/page.tsx` — local wholesale hub
- `app/local-wholesale/[wholesaler]/page.tsx` — per-wholesaler shop
- `app/wholesale-products/page.tsx` — wholesale product list (deprecated/redundant)
- `app/us-products/page.tsx` — US Pipeline products
- `app/us-shopping/[store]/page.tsx` — per-US-store catalog
- `app/vehicles/page.tsx` — vehicle classifieds
- `app/promos/page.tsx` — active promo codes

**Auth**
- `app/login/page.tsx` — customer login
- `app/staff-login/page.tsx` — staff login (separate gate)
- `app/change-password/page.tsx` — forced password change (must_change_password flag)
- `app/auth/confirmed/page.tsx` — post-confirmation landing
- `app/onboarding/page.tsx` — first-time customer onboarding

**Cart, checkout, payment**
- `app/wishlist/page.tsx` — saved items
- `app/checkout/page.tsx` — checkout form
- `app/order-confirmed/page.tsx` — post-payment success
- `app/payment-declined/page.tsx` — Plug'n Pay decline return

**Customer self-service**
- `app/account/page.tsx` — account home
- `app/account/orders/[id]/page.tsx` — order detail (customer view)
- `app/my-orders/page.tsx` — order history
- `app/customers/page.tsx` — customer index (legacy)
- `app/customers/dashboard/page.tsx` — customer dashboard (signed-in home)
- `app/utilities/page.tsx` — BSC Pay bill payments (early-access waitlist, no live processing yet)

**Order tracking & receipts**
- `app/track/[orderId]/page.tsx` — public delivery tracking (no auth)
- `app/receipt/[orderId]/page.tsx` — order receipt
- `app/invoice/page.tsx` — invoice viewer
- `app/notifications/page.tsx` — customer notifications

**Vendor public (separate from suppliers)**
- `app/vendor/dashboard/page.tsx` — vendor dashboard
- `app/vendor/listings/new/page.tsx` — vendor lists a product
- `app/vendor/signup/page.tsx` — vendor signup
- `app/test/page.tsx` — test/diagnostic page

---

# BATCH 2 — INTERNAL OPERATIONS SURFACES (60 pages)

POS, intake, supplier portal, processor, driver, captain, fisherman, farmer, role-specific landings, spinytails HACCP.

**POS (cashier)**
- `app/pos/page.tsx` — Nassau POS
- `app/pos-andros/page.tsx` — Andros POS (Ceta's Variety Store)
- `app/pos/scan/page.tsx` — barcode scan POS shell
- `app/pos/scan/scanner-client.tsx` — scan client (not a page but a route co-file)
- `app/pos/inventory/page.tsx` — POS-side inventory viewer
- `app/pos/sales-history/page.tsx` — past sales

**Intake (receiver / fisherman / captain)**
- `app/intake/page.tsx` — generic intake landing
- `app/intake/scan-invoice/page.tsx` — scan invoice → product extraction
- `app/lobster-intake/page.tsx` — spiny tail intake step 1 (vessel + GPS + raw weight)
- `app/captain/page.tsx` — captain landing
- `app/captains/page.tsx` — captains list
- `app/fisherman/page.tsx` — fisherman role landing
- `app/farmer/page.tsx` — farmer role landing
- `app/receiver/page.tsx` — receiver role landing
- `app/lobster-labels/page.tsx` — lobster label printer
- `app/labels/page.tsx` — generic label printer

**Supplier**
- `app/supplier/page.tsx` — founder supplier admin (card grid)
- `app/supplier/[id]/page.tsx` — supplier detail (inline grid; just extended with Description / VAT / Retail % / Retail $ / Whsl % / Whsl $)
- `app/supplier-portal/page.tsx` — supplier self-service portal
- `app/supplier-purchases/page.tsx` — supplier purchase history

**Processor / spinytails (HACCP)**
- `app/processor/page.tsx` — processor role landing
- `app/spinytails/page.tsx` — spiny tail hub
- `app/spinytails/intake/page.tsx` — HACCP intake
- `app/spinytails/steps/page.tsx` — processing steps
- `app/spinytails/vessels/page.tsx` — registered vessels
- `app/spinytails/lots/[lot_code]/page.tsx` — lot detail
- `app/spinytails/lots/[lot_code]/stickers/page.tsx` — lot sticker print
- `app/spinytails/documents/page.tsx` — HACCP docs
- `app/spinytails/audits/page.tsx` — audit log
- `app/spinytails/audit/[token]/page.tsx` — inspector audit view
- `app/spinytails/audit/[token]/lots/[lot_code]/page.tsx` — inspector lot view
- `app/spinytails/audit/[token]/documents/page.tsx` — inspector docs view
- `app/trace/page.tsx` — traceability home
- `app/trace/[batch_number]/page.tsx` — traceability per-batch
- `app/prep/page.tsx` — prep / kitchen
- `app/yield/page.tsx` — yield landing
- `app/yield-measure/page.tsx` — yield measurement

**Driver / fulfillment**
- `app/driver/page.tsx` — driver queue
- `app/order-fulfillment/page.tsx` — fulfillment kanban
- `app/pick-ticket/[orderId]/page.tsx` — pick ticket
- `app/pickup-queue/page.tsx` — pickup queue
- `app/shipping/page.tsx` — shipping
- `app/returns/page.tsx` — returns

**Staff role landings (named after the person)**
- `app/jaquel/page.tsx` — Jaquel (co-founder) landing
- `app/jorge/page.tsx` — Jorge (US partner) landing
- `app/johnette/page.tsx` — Johnette landing
- `app/ashley/page.tsx` — Ashley landing
- `app/manager/page.tsx` — manager landing
- `app/igloo/page.tsx` — Igloo Express US partner landing

**Staff utility**
- `app/inventory/page.tsx` — inventory list
- `app/inventory/scan/page.tsx` — inventory barcode scan
- `app/orders/page.tsx` — order list (staff)
- `app/wholesale-orders/page.tsx` — wholesale order list
- `app/purchase-orders/page.tsx` — purchase orders
- `app/accounts-payable/page.tsx` — A/P
- `app/expenses/page.tsx` — expense log
- `app/payroll/page.tsx` — payroll
- `app/bills/page.tsx` — bills list
- `app/bill/page.tsx` — bill detail
- `app/cash/page.tsx` — cash drawer
- `app/report/page.tsx` — report builder
- `app/reports/page.tsx` — reports index
- `app/landed-cost/page.tsx` — landed-cost calculator
- `app/cod-flag/page.tsx` — COD flag toggle
- `app/fleet/page.tsx` — fleet info
- `app/staff/page.tsx` — staff hub
- `app/staff/activate/page.tsx` — staff activation
- `app/staff/audit/page.tsx` — staff audit log
- `app/logs/catch/page.tsx` — catch log
- `app/logs/processing/page.tsx` — processing log
- `app/logs/traceability/page.tsx` — traceability log
- `app/partner/page.tsx` — partner landing
- `app/partner/[token]/page.tsx` — partner-token view
- `app/partner-tokens/page.tsx` — partner token admin
- `app/pulse/page.tsx` — operational pulse (live signals)

---

# BATCH 3 — FOUNDER ADMIN + DASHBOARD (47 pages + 4 founder-ai)

The `/dashboard` namespace + `/admin` + `/founder-ai`.

**Dashboard hub**
- `app/dashboard/page.tsx` — founder control center (Revenue/Profit/COGS hero; just fixed math)
- `app/dashboard/snapshot.tsx` — dashboard snapshot widget (route co-file)
- `app/dashboard-guide/page.tsx` — guided tour
- `app/dashboard/password/page.tsx` — change password
- `app/dashboard/health/page.tsx` — system health
- `app/dashboard/sql-editor/page.tsx` — gated SQL editor
- `app/dashboard/staff/invite-supplier/page.tsx` — invite supplier flow

**Dashboard — customers & A/R**
- `app/dashboard/customers/page.tsx` — customer list (with Open→ link to detail)
- `app/dashboard/customers/[id]/page.tsx` — customer detail (info / credit / points / orders / ledger)
- `app/dashboard/customer-pulse/page.tsx` — customer pulse signals
- `app/dashboard/ar-aging/page.tsx` — A/R aging
- `app/dashboard/ar-aging/statement/[customerId]/page.tsx` — A/R statement
- `app/dashboard/ar-aging/trends/page.tsx` — A/R trends

**Dashboard — sales & cash**
- `app/dashboard/daily-sales/page.tsx` — daily sales report
- `app/dashboard/daily-briefing/page.tsx` — daily briefing
- `app/dashboard/order-history/page.tsx` — order history
- `app/dashboard/reconciliation/page.tsx` — reconciliation
- `app/dashboard/cashiers/page.tsx` — cashiers list
- `app/dashboard/cashiers/trends/page.tsx` — cashier trends
- `app/dashboard/cashier-price-edits/page.tsx` — cashier price edits audit
- `app/dashboard/specials/page.tsx` — specials manager
- `app/dashboard/pricing-rules/page.tsx` — pricing rules
- `app/dashboard/cogs/page.tsx` — COGS
- `app/dashboard/supplier-cogs/page.tsx` — supplier-COGS (workaround for broken qc enum view)
- `app/dashboard/payouts/page.tsx` — payouts
- `app/dashboard/bill-payout/page.tsx` — Bill Casale payout

**Dashboard — operations**
- `app/dashboard/process-flow/page.tsx` — operations process flow
- `app/dashboard/processing-batches/page.tsx` — processing batches list
- `app/dashboard/processing-batches/[id]/labels/page.tsx` — batch labels
- `app/dashboard/quality-control/page.tsx` — QC dashboard
- `app/dashboard/fishermen/page.tsx` — fishermen admin

**Dashboard — listings + vendors**
- `app/dashboard/listings/pending/page.tsx` — pending listings
- `app/dashboard/vendors/pending/page.tsx` — pending vendors
- `app/dashboard/vendors/approved/page.tsx` — approved vendors

**Admin**
- `app/admin/inventory/page.tsx` — admin inventory spreadsheet (channel margins panel)
- `app/admin/images/page.tsx` — product image manager (site-images bucket)
- `app/admin/payment-health/page.tsx` — payment system health
- `app/products/page.tsx` — global products editor (legacy)
- `app/reviews-admin/page.tsx` — review moderation

**Founder AI**
- `app/founder-ai/page.tsx` — Founder AI chat
- `app/founder-ai/flyer-maker/page.tsx` — flyer generator
- `app/founder-ai/products/intake/page.tsx` — AI-driven product intake
- `app/founder-ai/products/pending/page.tsx` — **pending product approval queue** (filter: all 4 sell_* flags false + status='active'; this is where supplier self-uploads now land per `f1dab07`)

---

# BATCH 4 — API ROUTES (81) + LIB (32)

## API routes

**Admin**
- `app/api/admin/channel-margins/route.ts` — GET/POST channel margins; calls `bsc_apply_channel_margin` RPC
- `app/api/admin/products/[id]/route.ts` — PATCH single product; routes cost via `product_costs` INSERT and per-channel margin via `bsc_set_channel_price`. EDITABLE_FIELDS now includes `vat_code` (uncommitted).
- `app/api/admin/products/bulk/route.ts` — bulk product editor
- `app/api/admin/fishermen/invite/route.ts` — fisherman invite
- `app/api/admin/suppliers/invite/route.ts` — supplier invite
- `app/api/admin/whatsapp-test/route.ts` — WhatsApp test send

**A/R + cashiers**
- `app/api/ar/aging-alert/route.ts` — daily A/R aging cron
- `app/api/ar/send-reminder/route.ts` — per-customer A/R reminder
- `app/api/cashiers/force-close-mine/route.ts` — self-recover stuck shift
- `app/api/cashiers/variance-alert/route.ts` — drawer variance alert
- `app/api/cashiers/weekly-digest/route.ts` — weekly cashier digest cron

**Customers**
- `app/api/customers/admin/route.ts` — list/update_info/update_credit/adjust_points/record_credit_change/detail/create
- `app/api/customers/upsert/route.ts` — customer upsert

**Orders**
- `app/api/orders/[id]/route.ts` — order CRUD
- `app/api/orders/[id]/transition/route.ts` — status transitions (mark_delivered etc.)
- `app/api/orders/cancel/route.ts` — cancel order
- `app/api/orders/create/route.ts` — create order (legacy)
- `app/api/orders/place/route.ts` — server-authoritative checkout place
- `app/api/orders/mine/route.ts` — customer's own orders
- `app/api/orders/reconcile/route.ts` — reconcile
- `app/api/orders/unreconciled/route.ts` — list unreconciled

**Payment (Plug'n Pay)**
- `app/api/payment/start/route.ts` — start HPP redirect
- `app/api/payment/return/success/route.ts` — PnP success return
- `app/api/payment/return/declined/route.ts` — PnP decline return
- `app/api/payment/return/problem/route.ts` — PnP problem return
- `app/api/payment/health/route.ts` — PnP health check

**POS**
- `app/api/pos/customer-search/route.ts` — phone E.164 customer search
- `app/api/pos/save-customer/route.ts` — save customer at POS
- `app/api/pos/record-customer-purchase/route.ts` — record sale to customer
- `app/api/pos/receipt/route.ts` — render receipt
- `app/api/pos/whatsapp-receipt/route.ts` — WhatsApp click-to-chat receipt

**Products**
- `app/api/products/bulk-import/route.ts` — CSV bulk import
- `app/api/products/cashier-price-edit/route.ts` — POS price edit (cashier writes)
- `app/api/products/intake-submit/route.ts` — intake submit

**Suppliers (founder-side)**
- `app/api/supplier/add-product/route.ts` — founder adds product to a supplier
- `app/api/supplier/bulk-add-products/route.ts` — bulk add
- `app/api/supplier/extract-pricelist/route.ts` — Claude Haiku reads supplier PDF
- `app/api/suppliers/apply/route.ts` — public supplier application

**Supplier portal (supplier-side)**
- `app/api/supplier-portal/add-product/route.ts` — supplier self-listing (channels off, requested_channels stored, no pricing — per `f1dab07`)
- `app/api/supplier-portal/toggle-product/route.ts` — pause/resume own product
- `app/api/supplier-portal/update-product/route.ts` — supplier edits own product
- `app/api/supplier-portal/po-status/route.ts` — supplier sees their PO status

**Vendor (separate from suppliers)**
- `app/api/vendor-listings/create/route.ts` — vendor creates listing
- `app/api/vendors/signup/route.ts` — vendor signup

**Driver / fulfillment**
- `app/api/driver/queue/route.ts` — driver queue

**Inventory**
- `app/api/inventory/receive/route.ts` — receive into inventory
- `app/api/inventory/movements/onboard/route.ts` — onboard movements
- `app/api/inventory/movements/update/route.ts` — update movement
- `app/api/inventory-movement/route.ts` — generic movement
- `app/api/sales/inventory-write/route.ts` — sale writes inventory

**Other**
- `app/api/invoice-save/route.ts` — save invoice
- `app/api/invoice-scan/route.ts` — Claude reads invoice photos
- `app/api/landed-cost/calculate/route.ts` — landed cost
- `app/api/locations/route.ts` — store locations
- `app/api/barcode/[code]/route.ts` — barcode lookup
- `app/api/promos/redeem/route.ts` — redeem promo
- `app/api/promos/validate/route.ts` — validate promo
- `app/api/purchase-orders/receive/route.ts` — receive PO
- `app/api/processor/batches/approve/route.ts` — approve batch
- `app/api/staff/admin/route.ts` — staff admin
- `app/api/staff/activate/route.ts` — staff activate
- `app/api/health-check/route.ts` — health-check cron
- `app/api/founder-ai/route.ts` — Founder AI chat (Sonnet 4.5)
- `app/api/flyer-blast/route.ts` — flyer blast
- `app/api/dashboard/daily-briefing/test-send/route.ts` — test daily briefing
- `app/api/dashboard/daily-sales-report/route.ts` — daily sales (service-role bypass of qc enum bug)
- `app/api/email/order-status/route.ts` — order status email
- `app/api/contact/route.ts` — contact form
- `app/api/newsletter/subscribe/route.ts` — newsletter
- `app/api/unsubscribe/route.ts` — unsubscribe (signed token)
- `app/api/notifications/multi-channel/route.ts` — multi-channel notify
- `app/api/notifications/queue/route.ts` — queue notification
- `app/api/notifications/send/route.ts` — send queued notifications (cron)
- `app/api/partner-portal/admin/route.ts` — partner portal admin
- `app/api/partner-portal/data/route.ts` — partner portal data
- `app/api/sql-editor/run/route.ts` — gated SQL editor exec
- `app/api/sql-editor/schema/route.ts` — gated SQL schema browse
- `app/api/spinytails/ssop-reminder/route.ts` — SSOP reminder cron
- `app/api/cron/daily-briefing/route.ts` — daily briefing cron
- `app/api/cron/schema-integrity/route.ts` — schema integrity cron
- `app/api/cron/vendor-weekly-statements/route.ts` — vendor weekly statements cron

## lib

- `lib/pricing.ts` — canonical client-side pricing (`calculatePrice`, `BSC_PRICING_RULES`); **note: pre-formula-fix; still has VAT=0 disabled and pre-2026-06-07 channel names**
- `lib/cart.ts` — cart helper
- `lib/cart-pricing.ts` — cart price compute
- `lib/deals.ts` — special-price routing
- `lib/finance.ts` — finance helpers
- `lib/health-check.ts` — health-check suite
- `lib/invoices.ts` — invoice helpers
- `lib/order-items.ts` — order line items
- `lib/order-status.ts` — order status enum
- `lib/profit.ts` — profit math
- `lib/notify-status-change.ts` — order status notify
- `lib/notifications/` — notification senders
- `lib/email.ts` — email send
- `lib/email-templates.ts` — email templates
- `lib/resend/` — Resend client
- `lib/twilio.ts` — Twilio client
- `lib/phone.ts` — phone normalization (E.164)
- `lib/plain-error.ts` — friendly error messages
- `lib/role.ts` — `useUserRole`, `canLock`
- `lib/staff-session.ts` — staff session timestamp (auto-signout removed `83f06e3`)
- `lib/site-url.ts` — site URL resolver
- `lib/store.ts` — store metadata
- `lib/i18n.ts` — i18n helpers + `t()`
- `lib/departments.ts` — department codes
- `lib/supabase.ts` — Supabase client
- `lib/supabase/` — Supabase helper subdir
- `lib/founder-ai-tools.ts` — Founder AI tool definitions
- `lib/founder-ai-atlas.json` — Founder AI knowledge atlas
- `lib/founder-ai/` — Founder AI prompt assemblers
- `lib/founder-ai/daily-briefing-prompt.ts` — daily briefing prompt
- `lib/plugnpay/` — Plug'n Pay client + return handler
- `lib/plugnpay/return-handler.ts` — return URL parser
- `lib/traceability/` — traceability helpers
- `lib/vendors/` — vendor helpers

---

# BATCH 5 — DATABASE + CONFIG + COMPONENTS

## Migrations (80, chronological)

```
20260515120000_add_pos_kits_and_chicken_breast.sql
20260515130000_add_pig_feet_bahama_breeze.sql
20260515140000_update_pig_feet_price.sql
20260515150000_add_log_tables.sql
20260515170000_reset_payroll_and_utilities.sql
20260515180000_full_sync_locks_expenses_profit.sql      -- orders.net_profit added
20260515190000_dedupe_expense_rows.sql
20260515200000_dedupe_expenses_sweep.sql
20260515210000_staff_payroll_columns_and_audit.sql
20260515220000_enforce_lock_trigger.sql
20260516120000_ai_writes_audit.sql
20260516130000_bwa_seed_phase1.sql                       -- vat_code CHAR(1) ADDED
20260516140000_sysco_seed_phase1.sql
20260516150000_fix_sysco_binding_and_pasta_costs.sql
20260516160000_sysco_visibility_fix.sql
20260516170000_sysco_reseed_inline.sql
20260516180000_customer_email_consent.sql
20260516190000_flyers.sql
20260517100000_must_change_password.sql
20260517130000_profile_language.sql
20260517190000_daily_briefings.sql
20260517210000_vendor_marketplace.sql                    -- is_bsc_qc_staff() helper
20260517220000_vendor_public_profiles.sql
20260518010000_traceability.sql
20260518020000_batch_label_fields.sql
20260518030000_lot_code_and_label_meta.sql
20260518040000_intake_step1_step2.sql
20260518050000_supplier_vessel_registration.sql
20260518060000_fisherman_role.sql
20260519010000_pricing_and_customers.sql                 -- pricing_channel_v2; pricing_rules table
20260519020000_cash_drawer_sessions.sql                  -- open_cashier_session() created
20260519030000_ar_payment_received.sql
20260519050000_spinytails_haccp_traceability.sql         -- 14 spinytails_* tables
20260519060000_spinytails_documents.sql
20260519070000_spinytails_audit_access.sql
20260520200000_products_parent_portion.sql
20260520210000_product_specials.sql
20260520220000_order_lot_consumption.sql
20260520230000_sql_editor_audit_rpc.sql
20260520240000_sql_query_saved.sql
20260520250000_cron_schema_overview.sql
20260520260000_products_vat_category.sql
20260520270000_intake_role_and_geo.sql
20260521000000_cashier_price_edits.sql
20260521030000_fix_orders_customer_id_fk.sql
20260524000000_security_invoker_views.sql
20260525000000_orders_card_ref.sql
20260525010000_cashier_session_security_definer.sql
20260525020000_grant_select_cash_drawer_sessions.sql
20260525030000_orders_customer_address.sql
20260526133000_add_frozen_meat_category.sql
20260526190000_payment_transactions.sql
20260527130000_product_catalog_seed_v2.sql
20260527140000_cost_live_auto_update.sql                 -- channel_markups seeded
20260527160000_products_stock_count.sql
20260527180000_order_fulfillment_lifecycle.sql           -- fulfillment_status / pod_photo_urls
20260527190000_unit_type_sync_lb_decimal.sql             -- lb-decimal sync trigger
20260528090000_apply_channel_margin.sql                  -- bsc_apply_channel_margin()
20260528120000_lock_orders_rls.sql
20260528130000_block_forged_paid_orders.sql
20260528140000_backfill_missing_channel_prices.sql
20260528160000_lock_in_live_channel_pricing.sql
20260528170000_per_product_margins_stick.sql             -- margin_multiplier stickiness
20260528180000_fix_product_pricing_current_constraint.sql
20260528190000_add_categories_and_vat_toggle.sql
20260528200000_ar_view_security_invoker.sql
20260528210000_order_cogs_and_profit.sql
20260528220000_lock_cogs_tables.sql
20260528230000_lock_orders_insert_staff.sql
20260602180000_open_cashier_session_resume.sql           -- RPC resume-on-conflict
20260603110000_supplier_pricelists_bucket.sql            -- supplier-pricelists bucket + RLS
20260604000000_customer_credit_ledger.sql                -- ledger table + RLS
20260604010000_customers_address_column.sql
20260604020000_points_per_10_profit_trigger.sql          -- 4 pts per $10 profit trigger
20260607000000_products_requested_channels.sql           -- supplier intent column
20260607010000_products_vat_code_allow_f.sql             -- allow X/T/F
20260607020000_fix_bsc_set_channel_price.sql             -- gross-up + VAT + formula mode (NOT applied)
20260607030000_vat_active_switch.sql                     -- org_settings.vat_active master switch (NOT applied)
20260607040000_add_nassau_wholesale_channel.sql          -- ALTER TYPE add value (NOT applied)
20260607050000_add_price_locked.sql                      -- product_pricing.price_locked column (NOT applied)
```

## Key DB enums + functions (live)

- **pricing_channel** enum — DB rows show `online_market, nassau_pos, andros_pos, local_wholesale`. Migration `20260519010000` mentions `pricing_channel_v2` with different values; live is the working set. After `20260607040000` (not applied) adds `nassau_wholesale`.
- **user_role** enum — 22 values (founder, co_founder, manager, supervisor, processor, cashier, right_hand, strategist, supplier, partner_us, customer, receiver, qc_staff, operations, control_admin, basic_admin, andros_staff, fisherman, farmer, driver, captain, partner). **No `qc` value — stray cast somewhere in the supplier_reorder_list view chain still breaks it.**
- **product_category** enum — beverage / beverages / dry_goods / export_only / fresh_seafood / frozen_meat / frozen_seafood / grocery / household / juice_smoothie / meat / other / processed_seafood / produce / snack / spices / toiletries / toiletry / wellness_shot
- **vat_code** CHAR(1) on products with CHECK X/T/F (after `d495f38` applied)
- **bsc_set_channel_price(p_product_id, p_channel, p_margin, p_user)** — pre-fix: round(cost × (1+margin)), pricing_mode='manual_override'. Post-`20260607020000` (not applied): adds /0.96 gross-up + VAT, sets pricing_mode='formula'.
- **bsc_apply_channel_margin(p_channel, p_margin, p_user)** — repriced count returned
- **open_cashier_session(p_location, p_float_cents, p_notes)** — SECURITY DEFINER, resume on existing
- **bsc_award_points_for_order()** trigger — 4 pts per $10 net_profit

## Components (30)

- `components/AccountDrawer.tsx` — account drawer
- `components/AuditViewerShell.tsx` — audit token viewer shell
- `components/BottomNav.tsx` — mobile bottom nav
- `components/BrandLogo.tsx` — BSC logo
- `components/CardPaymentModal.tsx` — Plug'n Pay HPP card modal
- `components/CashiersNowWidget.tsx` — live cashier widget
- `components/CustomerPhoneLookup.tsx` — phone E.164 customer lookup
- `components/DailyProtocolChecklist.tsx` — role-based daily checklist
- `components/ErrorState.tsx` — error UI
- `components/FinancialSummary.tsx` — financials block
- `components/FlyerBanner.tsx` — flyer banner
- `components/HeroSection.tsx` — hero
- `components/intake/AddInventoryButton.tsx` — add inventory button
- `components/intake/GpsBadge.tsx` — GPS badge
- `components/intake/RoleDashboardShell.tsx` — role dashboard shell
- `components/InvoiceScanner.tsx` — invoice scan UI
- `components/LoadingState.tsx` — loading state
- `components/LockButton.tsx` — lock toggle
- `components/MarketHero.tsx` — market hero
- `components/MarketplaceTabs.tsx` — marketplace tabs
- `components/MarketPromoBanners.tsx` — promo banners
- `components/NewsletterSignup.tsx` — newsletter signup
- `components/pos/CustomerNameLookup.tsx` — POS name autocomplete
- `components/pos/EditPriceModal.tsx` — POS price edit modal
- `components/PublicShell.tsx` — public shell
- `components/SimpleMarkdown.tsx` — markdown renderer
- `components/SiteFooter.tsx` — site footer
- `components/SplineViewer.tsx` — Spline 3D viewer
- `components/suppliers/SupplierChatModule.tsx` — supplier chat
- `components/VendorMarketShop.tsx` — vendor shop tile

## Config + env

**Root config**: `middleware.ts`, `next.config.js`, `tailwind.config.ts`, `tsconfig.json`, `vercel.json`, `vitest.config.ts`, `postcss.config.mjs`, `package.json`, `next-env.d.ts`

**Cron jobs (Vercel)**:
- `0 1 * * *` — daily-briefing
- `30 13 * * *` — ar-aging-alert
- `0 15 * * *` — spinytails-ssop-reminder
- `0 11 * * 1` — cashiers-weekly-digest (Mondays)
- `0 10 * * *` — health-check
- `30 10 * * *` — schema-integrity
- `0 12 * * 1` — vendor-weekly-statements (Mondays)
- `*/10 * * * *` — notifications-send

**Env vars (38)**:
- Supabase: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
- Anthropic: ANTHROPIC_API_KEY
- Plug'n Pay: PNP_API_BASE_URL, PNP_GATEWAY_ACCOUNT, PNP_PUBLISHER_PASSWORD, PNP_CURRENCY, PNP_VERIFICATION_HASH_SECRET
- Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, TWILIO_PHONE_NUMBER, TWILIO_SMS_FROM, TWILIO_WHATSAPP_FROM, DEFAULT_WHATSAPP_TEST_TO
- Resend: RESEND_API_KEY, RESEND_FROM_ADDRESS
- Admin: ADMIN_SECRET, NEXT_PUBLIC_ADMIN_SECRET, CRON_SECRET, UNSUBSCRIBE_SECRET
- Notify lists: AR_AGING_ALERT_EMAILS, CASHIER_VARIANCE_ALERT_EMAILS, NEXT_PUBLIC_SPINY_TAIL_EMAILS, NEXT_PUBLIC_SPINY_TAIL_PHONES, SPINYTAILS_SSOP_ALERT_EMAILS, VENDOR_NOTIFICATION_EMAILS, VENDOR_NOTIFICATION_PHONES, SUPPLIER_APPLICATION_INBOX
- Site: NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_BUILD_VERSION, NEXT_PUBLIC_DEBUG_ERRORS, NEXT_PUBLIC_SPLINE_HERO, BETA_MODE_VENDORS
- Vercel built-ins: VERCEL_GIT_COMMIT_SHA, VERCEL_URL, NODE_ENV

## State summary

- **Local commits ahead of origin**: 3 (`f1dab07` supplier pending + `d495f38` vat F constraint + 5 staged-uncommitted migration files in working tree from today's halt-mode work)
- **Untracked migration files** (NOT committed, NOT applied to live):
  - `20260607020000_fix_bsc_set_channel_price.sql`
  - `20260607030000_vat_active_switch.sql`
  - `20260607040000_add_nassau_wholesale_channel.sql`
  - `20260607050000_add_price_locked.sql`
- **Modified files** (uncommitted edits from today's grid build):
  - `app/api/admin/products/[id]/route.ts` (vat_code added to EDITABLE_FIELDS)
  - `app/supplier/[id]/page.tsx` (Description / VAT / Retail % / Retail $ / Whsl % / Whsl $ columns + cost-save guard)

---

# DIAGRAM

```
                                       ┌──────────────────────────────────────────────┐
                                       │                CUSTOMERS                       │
                                       │   /market  /product  /checkout  /account       │
                                       │   /track   /my-orders  /utilities              │
                                       └──────┬──────────────────────────────┬─────────┘
                                              │ Plug'n Pay HPP redirect      │ orders/cart
                                              ▼                              ▼
                              ┌────────────────────────┐   ┌──────────────────────────────┐
                              │ payment/return/{ok,err}│   │   /api/orders/place           │
                              │ /payment-declined      │   │   /api/orders/[id]/transition │
                              └────────────────────────┘   │   /api/customers/admin        │
                                                           └──────────────┬───────────────┘
                                                                          │
                              ┌──────────────────┐                       │
                              │     STAFF        │   POS / Cashier       │
   ┌──────────────────┐       │ /staff-login     │   ────────────────    │
   │   FOUNDER (you)  │──────▶│ /pos /pos-andros │──────────────────────▶│
   │ /dashboard       │       │ /pos/scan        │   open shift RPC      │
   │ /dashboard/...   │       │ /pos/inventory   │   bsc_calculate_price │
   │ /admin/inventory │       │ /pos/sales-…     │   product_pricing     │
   │ /admin/images    │       └──────────────────┘                       │
   │ /founder-ai      │                                                   │
   │ /supplier        │   Supplier-side                                   │
   │ /supplier/[id]   │   ──────────────                                  │
   │ ─────────────────│   /supplier-portal ──▶ /api/supplier-portal/add-product
   │ approve pending  │                          (channels OFF + requested_channels)
   │ at /founder-ai/  │                                  │
   │ products/pending │                                  ▼
   │                  │   ◀───── lands as pending ──── products (sell_*=false, active)
   └──────┬───────────┘
          │  PATCH /api/admin/products/[id]
          │  { channel_margins: {online_market: 35}, vat_code, sell_*: true }
          ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │                       SUPABASE POSTGRES                             │
   │                                                                     │
   │  ┌─────────────┐  ┌────────────────┐  ┌──────────────────────┐    │
   │  │  products   │──│  product_costs │──│   product_pricing     │    │
   │  │ (sku, sell_*│  │  (immutable    │  │  (per channel ×       │    │
   │  │  vat_code,  │  │  cost ledger)  │  │  is_current snapshot) │    │
   │  │  requested_ │  └────────────────┘  │  channel/margin_mult/  │    │
   │  │  channels)  │                       │  manual_unit_price)   │    │
   │  └──────┬──────┘                       └──────────┬────────────┘    │
   │         │                                          │                 │
   │  ┌──────▼──────┐  ┌────────────────┐  ┌──────────▼────────────┐    │
   │  │  suppliers  │──│ supplier-      │  │  RPCs:                 │    │
   │  │  portal_    │  │ pricelists     │  │  bsc_set_channel_price │    │
   │  │  user_id    │  │  (Storage)     │  │  bsc_apply_channel_   │    │
   │  └─────────────┘  └────────────────┘  │  margin / open_cashier │    │
   │                                       │  bsc_award_points_*    │    │
   │  ┌─────────────┐  ┌────────────────┐  └────────────────────────┘    │
   │  │  customers  │──│ customer_      │                                │
   │  │ phone-E.164 │  │ credit_ledger  │  ┌──────────────────────┐    │
   │  │ credit/pts  │  │ + points_log   │  │  orders + lines      │    │
   │  └─────────────┘  └────────────────┘  │  net_profit          │    │
   │                                        │  payment_breakdown   │    │
   │  ┌─────────────┐  ┌────────────────┐  │  fulfillment_status  │    │
   │  │ profiles    │  │ cash_drawer_   │  │  pod_photo_urls      │    │
   │  │ user_role   │  │ sessions       │  └──────────────────────┘    │
   │  │ enum (22)   │  │ (shift state)  │                                │
   │  └─────────────┘  └────────────────┘  ┌──────────────────────┐    │
   │                                        │  spinytails_* (14)   │    │
   │  ┌─────────────┐  ┌────────────────┐  │  HACCP traceability  │    │
   │  │ vendors     │  │ notifications/ │  │  vessels / lots /    │    │
   │  │ + listings  │  │ ai_writes      │  │  steps / audits      │    │
   │  └─────────────┘  └────────────────┘  └──────────────────────┘    │
   └────────────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ service-role + RLS
                                  │
   ┌──────────────────────────────┴──────────────────────────────────┐
   │                       VERCEL EDGE / NODE                          │
   │  Crons (8): daily-briefing · ar-aging · spinytails-ssop ·         │
   │             cashiers-weekly · health-check · schema-integrity ·   │
   │             vendor-weekly-statements · notifications-send         │
   │  External APIs: Anthropic (Claude Sonnet 4.5 / Haiku) ·           │
   │                 Plug'n Pay HPP · Twilio (WA / SMS) · Resend       │
   └──────────────────────────────────────────────────────────────────┘
```

---

## Inventory totals

- **156** page routes
- **81** API routes
- **80** SQL migrations in repo (~107 live tables — many created via Supabase dashboard, not in repo per the schema-source-of-truth rule)
- **30** components
- **32** lib files/subdirs
- **22** user_role enum values
- **19** product_category enum values
- **8** Vercel cron jobs
- **38** environment variables

**STOPPED. Read-only. No edits, no migrations applied, no commits, no deploys.**
