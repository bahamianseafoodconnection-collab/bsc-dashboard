NEXT PHASE FOR BSC CONTROL DASHBOARD

Upgrade the current BSC Control Dashboard.

DO NOT remove existing working sections:
- Sales
- Gross Profit
- Expenses
- Net Profit
- Cash in Hand
- Bank
- Total Position
- Inventory Alerts
- Inventory List
- AI Insight
- Saved Daily History

ADD THIS NEW PHASE:

1. CREATE A NEW TYPE:
type ObligationItem = {
  id: string
  name: string
  category: "supplier" | "rent" | "utility" | "payroll" | "loan" | "other"
  amount: number
  dueDate: string
  status: "pending" | "paid"
  priority: "high" | "medium" | "low"
}

2. ADD STATE:
const [obligationName, setObligationName] = useState("")
const [obligationCategory, setObligationCategory] = useState<"supplier" | "rent" | "utility" | "payroll" | "loan" | "other">("supplier")
const [obligationAmount, setObligationAmount] = useState(0)
const [obligationDueDate, setObligationDueDate] = useState("")
const [obligationPriority, setObligationPriority] = useState<"high" | "medium" | "low">("medium")
const [obligations, setObligations] = useState<ObligationItem[]>([])

3. SAVE OBLIGATIONS TO LOCAL STORAGE
Use useEffect just like history/inventory so obligations remain saved after refresh.

4. ADD CALCULATIONS WITH useMemo:
- totalObligations = sum of all pending obligations
- overdueObligations = obligations where status is pending and dueDate is before today
- dueSoonObligations = obligations where status is pending and dueDate is within 3 days
- highPriorityObligations = obligations where priority is high and status is pending
- lowStockItems = inventory items where stock <= reorderLevel
- reorderCostEstimate = sum of lowStockItems using reorderQty * unitCost

5. ADD NEW DASHBOARD CARDS:
- Pending Obligations
- Overdue Bills
- Due Soon
- Reorder Cost Estimate

6. ADD NEW SECTION:
SECTION TITLE: "Obligations Input"

Include inputs:
- Obligation Name
- Category dropdown
- Amount
- Due Date
- Priority dropdown

Buttons:
- Add Obligation
- Clear Obligation Inputs

When "Add Obligation" is pressed:
- validate required fields
- create new obligation item
- add to obligations array
- clear the obligation input fields

7. ADD NEW SECTION:
SECTION TITLE: "Pending Obligations"

Display all pending obligations in clean card rows showing:
- Name
- Category
- Amount
- Due date
- Priority
- Status

Each obligation row must have:
- Mark Paid button
- Delete button

If Mark Paid is pressed:
- status changes from pending to paid

8. ADD NEW SECTION:
SECTION TITLE: "Paid Obligations History"

Show paid items separately.

9. ADD NEW SECTION:
SECTION TITLE: "Reorder Recommendations"

For every inventory item where stock <= reorderLevel, show:
- Item name
- Current stock
- Reorder level
- Suggested reorder quantity
- Unit cost
- Total reorder cost

If there are no low-stock items, show:
✅ No reorder items needed

10. IMPROVE AI INSIGHT LOGIC

Keep existing AI insight and ADD these rules:
- If overdueObligations.length > 0:
  return "🚨 Overdue obligations need immediate attention"
- If dueSoonObligations.length > 0:
  return "⚠️ Bills are due soon — prepare cash now"
- If lowStockItems.length > 0:
  return "📦 Low stock items need reorder planning"
- If totalPosition < totalObligations:
  return "❌ Cash position is below pending obligations"
- If totalPosition > totalObligations && lowStockItems.length === 0 && netProfit > 0:
  return "✅ Cash flow is stronger than current obligations"

11. ADD NEW SECTION:
SECTION TITLE: "Control Summary"

Show:
- Total Position
- Total Pending Obligations
- Cash After Obligations = totalPosition - totalObligations
- Estimated Reorder Cost
- Cash After Reorders = totalPosition - totalObligations - reorderCostEstimate

12. STYLING RULES:
- Keep same current clean premium dashboard style
- Same card design
- Same spacing
- Same navy/gray/white look
- Red for danger
- Green for good
- Orange/yellow for warnings

13. IMPORTANT:
- Do not break any current working code
- Keep all current features working
- Extend the current app only
- Make the full page mobile friendly first
- Keep this as one single app/page.tsx file

OUTPUT:
Return the FULL COMPLETE updated page.tsx file only.
Do not explain.
Do not summarize.
Do not shorten.