# BSC Dashboard Guide

**Last updated:** May 9, 2026
**Source of truth:** mirrored at `/dashboard-guide` (live, searchable, in-app).
**Audience tags:** founder · staff · cashier · customer

---

## Strategic + Daily Pulse

| Page | What | When | Key Actions |
|---|---|---|---|
| `/dashboard` 🏠 BSC Control | Main sidebar nav. Every link to every page. | Start of every session. | Click into any page · See revenue stream tiles · See wholesalers |
| `/founder-ai` 🤖 Founder AI | Strategic assistant. Knows full BSC context (V7). | Any time you need a decision sanity-checked. | Ask "what should I work on this week" · Ask "where do we stand financially" |
| `/pulse` 🫀 Pulse | Live ops cockpit. Auto-refreshes every 30 seconds. | Quick health check anytime during the day. | Glance at today numbers · Click Open Orders → /pickup-queue · Click Promos → /promos |

---

## Sales — POS Registers

| Page | What | When | Key Actions |
|---|---|---|---|
| `/pos` 🟡 Nassau Register | Main retail register for Nassau. | Every retail sale at Nassau. | Search product · Add to cart · Customer name + phone · Complete sale |
| `/pos/scan` 📷 Barcode Scanner | Onboard new product or update price/cost/channel/status. | New supply arrives needing add or repricing. | Point camera · Fill product details · Update existing |
| `/pos/inventory` 📦 POS Inventory | Live inventory levels with inline editing. | Daily stock review; before reorder. | Edit cost/price/channel/status inline · Filter |
| `/pos/sales-history` 🧾 Sales History | Every Nassau + Andros POS sale. | Reconcile end-of-day cash; look up specific sale. | Filter Today/7d/30d/All · Filter Nassau vs Andros · Open receipt |
| `/pos-andros` 🟣 Andros Register | Andros POS. PIN-gated (CETA2024). | Every retail sale at Andros / Cetas. | Enter PIN · Same flow as Nassau |

---

## Sales — Orders + Fulfillment

| Page | What | When | Key Actions |
|---|---|---|---|
| `/orders` 📦 Order Management | Every order across channels. | Manage online + wholesale fulfillment. | Filter by status · Move to next status · Cancel order |
| `/pickup-queue` 🚚 Pickup Queue | All orders last 48h grouped by destination. | Daily packing + dispatch. | Print pick tickets · Advance status (notifies customer) · Hide delivered |
| `/order-fulfillment` 📋 Order Fulfillment Detail | Detailed per-order packing view. | Per-order packing details. | Mark items packed · Set delivery method |

---

## Lobster Pipeline (Aug–March season)

**Run in this order: intake → yield → labels → igloo.**

| Page | What | When | Key Actions |
|---|---|---|---|
| `/lobster-intake` 🦞 Lobster Intake | Boat receive form. Auto-generates lot #. | Every boat / supplier delivery. | Pick supplier · Source island · Weight + cost/lb · Tail size breakdown · Save |
| `/yield-measure` ⚖️ Yield Measurement | Record real measured yield. Computes yield % + true cost/lb. | After processing finishes. | Pick pending lot · Enter finished weight · Enter waste · Per-grade output · Save |
| `/lobster-labels` 🏷️ Lobster Labels | Trilingual export labels. P1 (Zebra 4×6), P2 (Avery 5163 4×2), P3 (Avery 8163 4×3). | Before shipping a batch to Igloo / USA. | Pick lot · Pick format · Set tail size + copies + weight + pieces · Print Preview |
| `/igloo` 🧊 Igloo Integration | Shipments out + sales + per-shipment P&L. | After shipping cooler; when Igloo confirms sale; reconciling profit. | Tab Shipments · Tab Sales · Tab Shipment P&L |

---

## Inventory + Supply

| Page | What | When | Key Actions |
|---|---|---|---|
| `/products` 🍤 Product Catalog | Master product list. Bulk CSV import button. | Add new product, edit, change prices, upload photos, bulk update. | + Add Product · 📥 Import CSV · Edit inline · Toggle in_stock + featured |
| `/inventory` 📊 Inventory | Inventory levels across locations. | Stock reconciliation, reorder. | Filter by category · Edit qty inline |
| `/supplier` 🚢 Supplier Admin | Add + manage supplier records. | Onboard new supplier; approve products. | + Add supplier · Approve / pending · Edit |
| `/supplier-purchases` 📥 Buy Next (Auto) | Auto-generated purchase queue. | Daily buy planning. | + Draft PO · Confirm qty · Send PO |
| `/purchase-orders` 🧾 Purchase Orders | PO management — drafts, sent, received, paid. | Track supplier purchases. | + New PO · Mark received · Add payment · Print + send |
| `/landed-cost` 🧮 Landed-cost Calc | Bahamas import calculator. | Before quoting USA supplier or sourcing through Igloo. | Pick duty category · Enter FOB + freight · See landed + per-channel sell |
| `/yield` 📐 Yield Calculator | Calculator-only (no batch tracking). | One-off "what if" calculations. | Enter weights · See yield % + cost basis |
| `/labels` 🏷️ Print Labels | Generic product labels (non-export). | In-store retail tagging. | Pick product + qty · Print |
| `/captains` 🎣 Captains | Roster of fishermen relationships. | Track per-captain history. | + Add captain · Edit contact |
| `/wholesale-orders` 🇧🇸 Wholesale Orders | Wholesale-side orders + approvals. | Wholesale buyer placed order requiring approval. | Review pending · Approve / reject · Confirm shipping |
| `/wholesale-products` 📦 Wholesale Products | Wholesale-only catalog with B2B pricing. | Manage what shows in /local-wholesale. | + Add wholesale SKU · Edit price |

---

## Money + People

| Page | What | When | Key Actions |
|---|---|---|---|
| `/expenses` 💸 Expenses | Operational expense entry + list. | Every non-POS expense. Mark paid when wired. | + Add expense · Mark paid · Filter unpaid |
| `/accounts-payable` 📋 Accounts Payable | Unpaid + overdue sorted by due date. | Daily cash-flow planning; before paying anyone. | See aging · Mark paid · Open per-vendor history |
| `/payroll` 💼 Payroll | Per-staff hours + pay tracking. | Weekly / bi-weekly payroll runs. | Log hours · Pay run → mirrors to expenses |
| `/customers` 👥 Customers | Customer tracking. Auto-tracks every name from POS or online. | Outreach, lifetime-value review, loyalty. | Filter by source/channel · Open detail aggregate |
| `/staff` 🪪 Staff Admin | Founder/co-founder only. Add/remove, change roles. | Onboard cashier; password reset; role change. | + Add staff (auto-generates activation URL) · Change role · Regenerate link · Reset password |
| `/partner-tokens` 🔗 Partner Links | Generate per-partner shareable URLs. | Onboard a new partner like Bob @ Jomara. | Pick supplier · Set label + expiry · Generate · WhatsApp it |
| `/promos` 🎟️ Promo Codes | Manage discount codes. | Marketing campaign; first-customer discount. | + New code · Activate / Deactivate · See redemptions |
| `/reviews-admin` ⭐ Reviews Moderation | Approve / hide / delete customer reviews. | New reviews come in; spam needs hiding. | Filter status · Approve / Hide / Delete |
| `/reports` 📈 Reports + CSV | 5 reports: sales-by-day, sales-by-channel, expenses-by-category, customer LTV, COGS. | Tax prep, accountant requests, monthly review. | Set date range · Pick report · Download CSV |
| `/notifications` 🔔 Notifications Queue | Outbound message queue. | See what's queued; process queue manually. | Process queue · Filter by status |

---

## Services, Fleet, Bills

| Page | What | When | Key Actions |
|---|---|---|---|
| `/fleet` 🚛 Fleet (Internal) | Internal vehicle tracking. | Manage BSC delivery vehicles. | + Add vehicle · Log maintenance / fuel |
| `/vehicles` 🚗 Vehicles + Parts | Public-facing vehicle sales + parts catalog. | Manage vehicle marketplace. | + Add vehicle for sale · Manage parts |
| `/utilities` ⚡ Bill Payments | Customer-facing bill payment service (4.5% + $6 fee). | Customer pays utility bill through BSC. | Take payment · Issue receipt |
| `/bills` 📄 Bills | Internal bill tracking. | Track BSC own bills. | + Add bill · Mark paid |

---

## Customer-facing (review only)

| Page | What | When |
|---|---|---|
| `/` 🏝️ Public Home | Marketing landing. | Verify customer-facing presentation. |
| `/market` 🛒 Online Market | Main shop. | Spot-check what customers see. |
| `/category/[slug]` 🦐 Category Landing | SEO landing pages per category. | Verify SEO copy + listings. |
| `/help` ❓ Customer FAQ | Customer FAQ accordion + WhatsApp CTA. | Verify FAQ content. |
| `/shipping` 🚚 Shipping Policy | Nassau pickup / delivery / mailboat policy. | Verify wording matches reality. |
| `/returns` ↩️ Returns Policy | Seafood freshness guarantee + cancellation. | Verify wording. |
| `/contact` 💬 Contact Form | Public contact form. Submissions land in /notifications. | Verify form works. |

---

## How to use this guide with Founder AI

Ask Founder AI any of these and it will explain in detail:

- "How do I add a new cashier?"
- "Walk me through the lobster pipeline pages in order."
- "What page shows me money owed to suppliers?"
- "Where do I print export labels?"
- "How do I send Bob a Partner Portal link?"
- "Teach me how to use my dashboard, one section at a time."

The Founder AI consults this same guide when answering and will give exact URLs.
