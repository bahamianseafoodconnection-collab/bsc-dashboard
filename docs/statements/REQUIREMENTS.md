# Weekly Customer Statement Generator — Requirements & Sequence

> Status: **VERIFIED + SCOPED** (not built). Founder asked to verify live tables,
> confirm matching logic, confirm credit-line table, then log requirements +
> dependencies + execution sequence. This is that log.

## A. Live schema — VERIFIED (what's already there)

| Table / asset | Columns / note | Role in this build |
|---|---|---|
| `credit_invoices` | id, customer_id, invoice_number, order_id, **invoice_date, due_date, amount_total, amount_paid**, status, notes | **Invoices source** (per-customer, has due_date) |
| `credit_payments` | id, **invoice_id, customer_id, payment_date, amount, payment_method, reference**, notes, created_by | **Payments-received source** (date/amount/method/ref) |
| `credit_statements` | id, customer_id, generated_by, statement_date, total_outstanding, transactions (jsonb) | **Statement save** — needs columns added (see C) |
| `customers` | id, full_name, phone, email, address, **is_credit_customer, credit_limit, credit_terms**, credit_approved_by/at | Header contact + **credit line** (DUE/OVERDUE) |
| `ar_unpaid_orders` (view) | id, created_at, total, customer_id, age_days, bucket | Existing aging view (used by current statement page) |
| `app/dashboard/ar-aging/statement/[customerId]/page.tsx` | HTML statement, `window.print()` → Save as PDF, reads `ar_unpaid_orders` | **Visual baseline** to upgrade (does NOT use credit ledger or payments yet) |
| `app/api/cron/vendor-weekly-statements/route.ts` | Mon 12:00 UTC, per-vendor email statement, `CRON_SECRET` gated, service-role | **Pattern to mirror** for customers |
| `pdf-lib@^1.17.1` | installed | PDF generation engine (no puppeteer/react-pdf) |
| `public/brand/bsc-marketplace-logo.png` | exists | BSC logo for header. **RBC logo: NOT present — founder must provide + see B5** |
| `vercel.json` crons | weekly slot precedent `0 12 * * 1` (Mon) | Add customer-statement cron here |

Row counts read 0 for credit_invoices/payments/statements — **likely RLS-masked to the
read-only role** (financial tables), not proof of empty. `customers` shows 1 credit customer.

## B. Payment-matching logic — CONFIRMED (founder-locked) + the one open threshold

1. **Allocation:** sort a customer's `credit_invoices` by `invoice_date` ASC. Sort
   `credit_payments` by `payment_date` ASC. Apply payments to the **oldest unpaid
   invoice first, cascade down**. All methods (wire/card/cash) follow the same rule.
2. **Source of truth:** the generator re-derives allocation from `credit_payments`
   (don't trust `amount_paid` drift). `amount_paid` may be optionally re-synced.
3. **Outstanding balance** = Σ`amount_total` − Σ`credit_payments.amount`.
4. **Status labels (no "Suspended"):**
   - `DUE` = today > `due_date`, account still within credit line.
   - `OVERDUE` = past `due_date` **AND** eating the credit line.
   - ⚠️ **OPEN DECISION (B5):** exact OVERDUE threshold — proposed:
     OVERDUE when past due AND `total_outstanding >= customers.credit_limit`.
     Confirm or give the rule.
5. Statement shows per payment: **date, amount, payment_method, reference**, plus
   total payments received + current outstanding.

## C. Schema change needed (one migration — founder runs)

`credit_statements` must carry approval + send + PDF state:
```
period_start date, period_end date,
status text default 'pending' check (status in ('pending','approved','sent','void')),
pdf_path text,                 -- storage path in the statements bucket
total_invoiced numeric, total_paid numeric,
customer_snapshot jsonb,       -- name/phone/email/address at generation time
approved_by uuid, approved_at timestamptz,
sent_at timestamptz, sent_channel text
```
Plus a **private Supabase storage bucket `statements`** (is_staff RLS) for the PDFs,
and signed URLs for WhatsApp/email attachment.

## D. Build plan (after decisions resolved) — files

1. `lib/statements/allocate.ts` — pure oldest-first cascade + DUE/OVERDUE labeling (unit-testable).
2. `lib/statements/pdf.ts` — pdf-lib branded layout (navy #1a2e5a + light blue, BSC logo,
   contact block, payments-received table, outstanding summary, banking info, payment
   instructions, WhatsApp 242-361-3474, bscbahamas.com).
3. `app/api/cron/customer-weekly-statements/route.ts` — Mon, per credit customer:
   allocate → render PDF → upload to bucket → insert `credit_statements` (status `pending`).
   **Generates only — never auto-sends.**
4. `app/founder/statements/page.tsx` + `app/api/founder/statements/route.ts` — approval
   queue: list pending → preview PDF → **Approve** → then **Send** (WhatsApp / email / print).
5. `lib/statements/send.ts` — reuse `lib/twilio` (WhatsApp/SMS) + `lib/email` (Resend);
   print = signed PDF URL. Marks `sent_at` / `sent_channel`.
6. `vercel.json` — add `{ "path": "/api/cron/customer-weekly-statements", "schedule": "0 12 * * 1" }`.

## E. Dependencies / blockers (founder must provide / decide)

- **B5** OVERDUE threshold (above).
- **RBC logo** — file + **confirm it's OK to display RBC's mark on BSC statements**
  (⚠️ legal/brand — using a bank's logo may need their consent; flag before shipping).
- **Banking info block** — exact receiving-bank details + payment instructions text
  (sensitive — provide as content; not committed as secrets).
- **Storage bucket `statements`** — founder runs the bucket SQL (provided at build time).
- **Cadence confirm** — Monday 12:00 UTC (8:00 AST) like vendor statements? Or another day/time.
- **Send channels at launch** — all three (WhatsApp + email + print) or start with one.
