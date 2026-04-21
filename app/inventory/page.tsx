export default function InventoryPage() {
  return (
    <div>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory Screen</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>0</span>
        </div>

        <div className="metric">
          <span>Low Stock Items</span>
          <span>0</span>
        </div>

        <div className="metric">
          <span>Reorder Suggestions</span>
          <span>0</span>
        </div>
      </div>
    </div>
  )
}