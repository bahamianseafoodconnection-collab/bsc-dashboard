# BSC — Daily Task Sheet · 2026-06-20

**Focus:** Supplier → channel pricing pipeline. Server-authoritative Save standard.
**Companion docs:** `DECISIONS_2026-06-20_pricing-pipeline.md` · `PIPELINE_BUILD_CHECKLIST.md`

---

## ✅ DONE TODAY
- Verified live schema (pricing_rules, enums, trigger body, products/suppliers cols)
- Locked decisions D1–D7 (×0.93 supplier intake, server-auth Save, two-gate funnel,
  Option A enum map, pricing layer split, case-break pricing + packing gate)
- Resolved both blockers: O1 (margins = pricing_rules 40/40/35/22/19) · O2 (stay live)
- Phase 2 schema: added `products.brand` + `suppliers.operating_cost_accepted` (verified)
- **Rewrote `bulk-add-products/route.ts`** (full-file, typechecks clean, commit 8b5371b)
- **PROVED pricing math via SQL:** cost $10 → stored $9.30 (×0.93) → nassau $13.02 /
  andros $13.02 / online_market $12.56, multipliers 1.4 / 1.4 / ~1.3505, NO 1.0 footgun.
  Enum translation online_retail→online_market confirmed against live schema.
- **Preview-deployed the route** (branch fix/bulk-add-pricing-x093); auth gate confirmed
  working (rejected unauthenticated probe with route's own JSON).
- **MERGED to main** 2026-06-20 — math proven, residual route-code risk accepted by Dedrick.
- **Deployed to production** (vercel --prod, www.bscbahamas.com) — route live + reachable.

## 🔬 POST-MERGE — TEST IN REAL USE (Dedrick human check, end of build)
Merged with math proven but the *full authenticated route call* never observed green
(token-grab friction). Confirm these on the first real supplier pricelist import.
Full detail + "where to look / suggested fix" in `PIPELINE_BUILD_CHECKLIST.md` → POST-MERGE.
1. **Request parsing** — channels{} + cost_per_unit read correctly on a real POST.
2. **Enum translation in route code** — online row writes 'online_market' (not just DB-accepts).
3. **ai_writes audit row** — proven in NEITHER path; confirm it actually writes. ← highest risk
4. **Packing-incomplete flag** — blocks Enable-Live, not just flags at intake (D7).
5. **Category coercion** — coerceCategory dedupes + maps (seafood→fresh_seafood etc).

## 🔒 SECURITY — DONE 2026-06-20
- [x] Rotated founder session (logged out of BSC → refresh token retired)
- [x] Regenerated Vercel bypass secret (old exposed value killed)
- [x] Test data cleaned (suppliers 7941de03 + 25cc4ee6 removed; immutability triggers O)
- [x] `.env.local` deleted (held live prod secrets) · temp harness self-deleted

## ▶️ THEN BUILD (in order, each approved before next)
- **Phase 3b:** cart case-break wholesale pricing + dual-price card
- **Phase 4:** supplier-card switch + product management page + Enable Live
- **Phase 5:** re-approval trigger (cost/brand) + server-auth Save rollout
- **Phase 6:** JBI 71-product import test (qc enum confirm) — pairs with POST-MERGE checks
- **NEW — Operations Cockpit:** one role-based dashboard view = duties + live ops
  signals (low stock, being processed, freezer movement, finished weights) +
  communicate-to-staff/driver button. 3 clean data layers, one view. SCOPED NEXT.
- **NEW — User Management page:** add users with roles + login. Save button =
  SERVER save via Supabase Auth admin API (never browser/credentials client-side).
  Page locked to founder/co_founder/control_admin. SCOPED NEXT.

## 🚦 RULES IN FORCE TODAY
- Verify live schema before building · SQL→Supabase Editor · .ts/.tsx→Claude Code
- Full-file writes only · git fetch + behind=0 before push · per-command approval
- NO push/deploy/commit without explicit approval · legal/audit before money surface
- Never paste live tokens/keys into chat — mint server-side or use read -s in terminal

## ⏸ PARKED (not today)
- Enum migration (own workstream) · Founder AI auth fix · reefer alarm consult
- Facility agreement → attorney · conch permit number/expiry verify
- Authenticated route test via server-minted token (next session — cleaner than browser grab)
