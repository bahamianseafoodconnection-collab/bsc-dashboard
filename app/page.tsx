import Link from "next/link"

export default function DashboardPage() {
  return (
    <>
      <h2 className="page-title">Dashboard</h2>

      <div className="summary-card">
        <h2>Today&apos;s Summary</h2>

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

      <div className="summary-card">
        <h2>Quick Actions</h2>

        <div className="quick-actions">
          <Link href="/bills" className="action-btn">
            Bills
          </Link>

          <Link href="/inventory" className="action-btn">
            Inventory
          </Link>

          <Link href="/cash" className="action-btn">
            Cash
          </Link>
        </div>
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>App Status</span>
          <span>Stage 1 Active</span>
        </div>
      </div>
    </>
  )
}