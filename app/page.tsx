NEXT PHASE FOR BSC CONTROL DASHBOARD

Upgrade the current BSC Control Dashboard by ADDING an Inventory Alerts + Reorder Control section under the existing dashboard.

DO NOT remove:
- Sales
- Gross Profit
- Expenses
- Net Profit
- Cash in Hand
- Bank
- Total Position
- AI Insight
- Saved Daily History

ADD inventory control with React useState and localStorage.

REQUIREMENTS:

1. Create an inventory item type:
type InventoryItem = {
  id: string
  name: string
  stock: number
  reorderLevel: number
  reorderQty: number
  unitCost: number
}

2. Add inventory state:
const [itemName, setItemName] = useState("")
const [stock, setStock] = useState(0)
const [reorderLevel, setReorderLevel] = useState(0)
const [reorderQty, setReorderQty] = useState(0)
const [unitCost, setUnitCost] = useState(0)
const [inventory, setInventory] = useState<InventoryItem[]>([])

3. Save inventory in localStorage with key:
"bsc-dashboard-inventory"

4. Load inventory from localStorage on page load.

5. Add function to save item:
- item must have name
- create unique id using Date.now()
- save item into inventory list
- newest on top
- clear the input fields after save

6. Add function to delete inventory item by id.

7. Add inventory summary calculations using useMemo:
- lowStockItems = items where stock <= reorderLevel
- totalInventoryValue = sum of stock * unitCost
- totalReorderValue = sum of reorderQty * unitCost only for low stock items

8. Add a dashboard summary row/cards for:
- Inventory Value
- Low Stock Items count
- Reorder Value

9. Add section:
"Inventory Input"
Fields:
- Item Name
- Current Stock
- Reorder Level
- Reorder Quantity
- Unit Cost

Buttons:
- Save Item
- Clear Inventory Inputs

10. Add section:
"Inventory Alerts"
If no low stock items:
show green text:
"✅ No low-stock items"
If there are low stock items:
show each low stock item in a card with:
- Item Name
- Current Stock
- Reorder Level
- Reorder Quantity
- Estimated reorder cost = reorderQty * unitCost

11. Add section:
"Inventory List"
Show all items in cards with:
- Item Name
- Stock
- Reorder Level
- Reorder Quantity
- Unit Cost
- Total Stock Value = stock * unitCost
- Status:
   "LOW STOCK" in red if stock <= reorderLevel
   "OK" in green otherwise
- Delete button

12. Add AI inventory insight using useMemo:
Rules:
- if inventory is empty:
  "⚠️ No inventory items entered"
- if 3 or more low stock items:
  "⚠️ Multiple items need reorder now"
- if low stock items exist:
  "⚠️ Reorder low stock items before they affect sales"
- otherwise:
  "📦 Inventory levels look healthy"

13. Match the current dashboard style:
- light gray page background
- white cards
- rounded corners
- bold headings
- soft shadows
- mobile friendly
- keep same clean style already on screen

14. Keep everything in one file: app/page.tsx

15. Make the build safe for Vercel and Next.js 14 app router.

16. Do not use any external packages.

Goal:
Turn BSC Control Dashboard into a working mobile-first control system with sales, cash, profit, history, and inventory reorder alerts all on one page.