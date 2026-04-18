export default function Page() {
  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  } as const

  const statStyle = {
    fontSize: "28px",
    fontWeight: 700,
    marginTop: "8px",
  } as const

  const labelStyle = {
    fontSize: "14px",
    color: "#6b7280",
    marginBottom: "6px",
  } as const

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <header
          style={{
            marginBottom: "24px",
            background: "#111827",
            color: "#ffffff",
            borderRadius: "20px",
            padding: "24px",
          }}
        >
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.8 }}>
            BSC Marketplace
          </p>
          <h1 style={{ margin: "8px 0 10px 0", fontSize: "40px" }}>
            BSC Control Dashboard
          </h1>
          <p style={{ margin: 0, fontSize: "16px", opacity: 0.9 }}>
            Live business control center for daily sales, cash, inventory, orders, and payouts
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div style={cardStyle}>
            <div style={labelStyle}>Today Sales</div>
            <div style={statStyle}>$0.00</div>
            <p style={{ margin: "10px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
              Daily revenue total
            </p>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Cash in Hand</div>
            <div style={statStyle}>$0.00</div>
            <p style={{ margin: "10px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
              Physical cash available
            </p>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Bank Position</div>
            <div style={statStyle}>$0.00</div>
            <p style={{ margin: "10px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
              Bank balance for control
            </p>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Low Stock Alerts</div>
            <div style={statStyle}>0</div>
            <p style={{ margin: "10px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
              Products needing reorder
            </p>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "22px" }}>
              Orders
            </h2>
            <div
              style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "14px",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>No active orders</p>
              <p style={{ margin: "8px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
                Marketplace and supplier-linked orders will appear here.
              </p>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "22px" }}>
              Supplier Payouts
            </h2>
            <div
              style={{
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: "12px",
                padding: "14px",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>No payouts pending</p>
              <p style={{ margin: "8px 0 0 0", color: "#6b7280", fontSize: "14px" }}>
                Supplier payments due from sold inventory will show here.
              </p>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "22px" }}>
              Inventory Alerts
            </h2>
            <ul style={{ margin: 0, paddingLeft: "18px", color: "#374151" }}>
              <li>No low-stock alerts</li>
              <li>No expired product alerts</li>
              <li>No processing shortages reported</li>
            </ul>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "22px" }}>
              Daily Closeout
            </h2>
            <div style={{ color: "#374151" }}>
              <p style={{ margin: "0 0 10px 0" }}>Sales: $0.00</p>
              <p style={{ margin: "0 0 10px 0" }}>Cash Counted: $0.00</p>
              <p style={{ margin: "0 0 10px 0" }}>Card Total: $0.00</p>
              <p style={{ margin: 0 }}>Variance: $0.00</p>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "22px" }}>
              AI Decision Panel
            </h2>
            <div
              style={{
                background: "#ecfeff",
                border: "1px solid #a5f3fc",
                borderRadius: "12px",
                padding: "14px",
              }}
            >
              <p style={{ margin: 0, fontWeight: 700 }}>System Status: Ready</p>
              <p style={{ margin: "10px 0 0 0", fontSize: "14px", color: "#155e75" }}>
                When live data is connected, this panel will recommend reorders, payout timing,
                cash protection, and priority actions for Dedrick, Ashley, and Jaquel.
              </p>
            </div>
          </div>

          <div style={cardStyle}>
            <h2 style={{ marginTop: 0, marginBottom: "16px", fontSize: "22px" }}>
              Priority Actions
            </h2>
            <ol style={{ margin: 0, paddingLeft: "18px", color: "#374151" }}>
              <li>Upload daily sales totals</li>
              <li>Count fast-moving inventory</li>
              <li>Confirm cash and bank position</li>
              <li>Review supplier obligations</li>
              <li>Close out the day with zero variance</li>
            </ol>
          </div>
        </section>
      </div>
    </main>
  )
}