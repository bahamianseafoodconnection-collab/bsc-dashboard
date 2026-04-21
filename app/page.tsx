import Link from "next/link"

export default function DashboardPage() {
  return (
    <>
      <h2 className="page-title">BSC Dashboard</h2>

      {/* ===== TODAY SUMMARY ===== */}
      <div className="summary-card">
        <h2>Today’s Summary</h2>

        <div className="metric">
          <span>Bills Collected</span>
          <span>$0</span>
        </div>

        <div className="metric">
          <span>Bill Count</span>
          <span>0</span>
        </div>

        <div className="metric">
          <span>Cash In</span>
          <span>$0</span>
        </div>

        <div className="metric">
          <span>Cash Out</span>
          <span>$0</span>
        </div>

        <div className="metric">
          <strong>Net Cash</strong>
          <strong>$0</strong>
        </div>
      </div>

      {/* ===== BUSINESS CONTROL ===== */}
      <div className="summary-card">
        <h2>Control Center</h2>

        <div className="quick-actions">
          <Link href="/bills" className="action-btn">
            💡 Bills
          </Link>

          <Link href="/inventory" className="action-btn">
            📦 Inventory
          </Link>

          <Link href="/cash" className="action-btn">
            💰 Cash
          </Link>
        </div>
      </div>

      {/* ===== DECISION ENGINE ===== */}
      <div className="summary-card">
        <h2>AI Decision Status</h2>

        <div className="metric">
          <span>System Mode</span>
          <span>Monitoring</span>
        </div>

        <div className="metric">
          <span>Alerts</span>
          <span>0</span>
        </div>

        <div className="metric">
          <span>Recommendations</span>
          <span>Ready</span>
        </div>
      </div>

      {/* ===== SYSTEM STATUS ===== */}
      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Backend</span>
          <span>Connected</span>
        </div>

        <div className="metric">
          <span>Database</span>
          <span>Ready</span>
        </div>

        <div className="metric">
          <span>Version</span>
          <span>Stage 2</span>
        </div>
      </div>
    </>
  )
}