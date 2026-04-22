return (
  <>
    <h2 className="page-title">Inventory</h2>

    <div className="summary-card">
      <h2>Inventory Summary</h2>

      <div className="metric">
        <span>Items Tracked</span>
        <span>{items.length}</span>
      </div>

      <div className="metric">
        <span>Total Inventory Value</span>
        <span>${totalValue.toFixed(2)}</span>
      </div>

      <div className="metric">
        <span>Status</span>
        <span>{status}</span>
      </div>
    </div>

    <div className="summary-card">
      <h2>Inventory List</h2>

      {items.length === 0 ? (
        <p>No inventory found</p>
      ) : (
        items.map((item) => {
          const name =
            item.products && item.products.length > 0
              ? item.products[0].name
              : "⚠️ Missing Product Link"

          return (
            <div key={item.id} className="metric">
              <span>{name}</span>
              <span>{item.quantity}</span>
            </div>
          )
        })
      )}
    </div>
  </>
)