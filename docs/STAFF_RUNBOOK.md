# BSC Staff Runbook — Launch Edition

**Print this. Post at Nassau Marketplace + Ceta's Variety Store (Andros).** Reach
the founder or co-founder fast. Bug or money question? Always call — never
silently work around it.

---

## ESCALATION TREE — call in this order

| # | Who | Phone | When |
|---|---|---|---|
| 1 | **Dedrick** (founder) | _____________________ | Any money issue, any system error you can't resolve in 60 seconds, any customer complaint |
| 2 | **Jaquel** (co-founder) | _____________________ | If Dedrick unreachable, OR Dedrick on rest cycle (June 30 – July 31) |
| 3 | **TJ** (manager) | _____________________ | Inventory + processing + freezer questions |

*Fill the numbers in pen before posting.*

---

## SCENARIO 1 — Customer says "I didn't get my email receipt"

1. Open `/pos/sales-history` (Nassau) or `/dashboard/cashiers` (admin) → find the order by customer name or phone.
2. Click the order → check the top-of-page toast that fired at checkout time. It says one of:
   - 📧 Email sent to `<address>` → check spam folder
   - 📱 SMS sent → email was empty/invalid; SMS went out instead
   - 🖨 Print receipt opened → no email or phone on file
   - ⚠ Receipt FAILED → see the error message; fall through to step 3
3. From the order detail, copy the URL `/receipt/<order-id>` and send it manually (WhatsApp / email / text).
4. **Never** retry by re-ringing the sale — that creates a duplicate order.

---

## SCENARIO 2 — Card terminal DECLINED after POS sale was rang

1. The POS already recorded the sale as PAID. **Do NOT hand the customer their items yet.**
2. Re-run the card with the customer:
   - If approves → write the new reference number on the customer's printed receipt. Move on.
   - If declines again → ask for another payment method (cash, wire, card-to-card transfer).
3. If customer cannot pay, **call Dedrick**. Do NOT modify or delete the order in POS.
4. End of shift: list every "card declined post-sale" event in the Close-Shift notes.

---

## SCENARIO 3 — Wire transfer reference number missing

1. At checkout, if the customer can't provide the wire ref immediately, type `PENDING <customer phone>` in the wire-ref field and complete the sale.
2. **Same day**: follow up with the customer for the wire confirmation.
3. Once received, edit the order on `/orders` → admin notes → append the real ref.
4. **End of week**: open `/dashboard/ar-aging` to verify no orders remain in PENDING status >7 days. Escalate anything older to Dedrick.

---

## SCENARIO 4 — POS shows wrong stock count (or "Sold Out" but you have it)

1. **Do not block the sale.** Ring the item normally. If POS won't let you, type the SKU manually.
2. After the sale, open `/inventory` page → search the product → adjust `cases_on_hand` / `units_on_hand` / `weight_lbs_on_hand` to the count you have physically.
3. Note the adjustment reason in the inventory edit notes.
4. The "Only X left" badge on /market has been intentionally hidden for launch — customer-facing stock numbers are not displayed.

---

## SCENARIO 5 — Inventory write failure (silent error in Vercel logs)

Symptom: the sale succeeded, receipt sent, but no `inventory_movements` row was created for that line.

1. The sale is RECORDED in `orders`. Stock-tracking lag only.
2. This is non-blocking — keep ringing sales.
3. **Email Dedrick a note**: "Inventory write didn't fire for order <id> at <time>." He'll back-fill via `/inventory` manual adjust.
4. Founder check: `/dashboard/health` page surfaces inventory-write failures in the next daily-briefing email.

---

## SCENARIO 6 — Order save error at POS ("Order failed: ...")

1. **Take a screenshot** of the error message before doing anything else.
2. Try Confirm Sale once more (single retry). Most order-save errors are network blips.
3. If it fails again: do NOT keep retrying — call Dedrick. Write down: customer name, items, payment method, total, time.
4. If the customer is in line and time-sensitive: take cash, write a manual receipt on paper, hand product. Reconcile in POS later.

---

## SCENARIO 7 — Cashier shift won't close

1. From the POS header, tap the green "🟢 Shift open" chip → Close Shift modal opens.
2. Count the cash drawer NOW (including the opening float).
3. Enter the counted total in BSD.
4. If close button errors → **screenshot, call Dedrick.** Do not start a new shift on the same register until the old one closes.
5. Variance email goes to admins automatically once closed. Check `/dashboard/cashiers` for the summary.

---

## SCENARIO 8 — POS won't load / page blank / Vercel error

1. Hard-refresh the browser (Cmd-Shift-R on Mac, Ctrl-Shift-R on Windows/Android Chrome).
2. If still blank → try a private/incognito window.
3. Still blank → use the backup tablet/phone if available.
4. Last resort: take cash, write paper receipts, ring sales into POS later when service restores. Call Dedrick.

---

## SCENARIO 9 — Customer wants their order history / refund / record

1. Open `/customers` page → search by name or phone → click the customer card.
2. Their order history is on the detail page.
3. **Refunds:** call Dedrick. Refunds are not processed by cashiers without founder approval.
4. **Data requests:** customer asks for "all my data" → forward to Dedrick. Do not export from POS directly.

---

## QUICK REFERENCE — common actions

| Task | How |
|---|---|
| Open shift | POS header → "🔴 No shift" → Open Shift → count drawer → enter float |
| Ring per-lb item | Tap product → weight modal opens → enter weight in lbs (e.g. `2.45`) |
| Save a returning customer | Checkout panel → type name (autocomplete pops) → tap match → ring sale |
| Save a new customer | Type name + phone + (optional) email → "✓ Save customer to history" |
| Email-receipt opt-in | Check the "Opt in to BSC promotions" box ONLY if customer says yes |
| Find a past sale | `/pos/sales-history` → filter by date or search by name/phone |
| Adjust inventory | `/inventory` → search product → edit cases/units/lbs → save |
| Print receipt for a past order | Open order → click "Receipt" → browser print |

---

## WHAT NOT TO DO

- ❌ Do NOT re-ring a sale because email didn't arrive (creates a duplicate order)
- ❌ Do NOT delete orders from POS — call Dedrick
- ❌ Do NOT modify pricing at the register without approval — use the ✏ price-edit button only for one-off discounts
- ❌ Do NOT close shift without counting drawer
- ❌ Do NOT process refunds without Dedrick approval
- ❌ Do NOT share your login with another staff member (every sale tracks YOUR cashier id)
- ❌ Do NOT enter card numbers into the POS — all card processing happens on the RBC terminal

---

*Last updated 2026-05-24. Reach Dedrick for any update.*
