"use client"

export default function POSPage() {
  return (
    <>
      <h2 className="page-title">POS</h2>

      <div className="summary-card">
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Register Status</span>
          <span>Ready</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>0</span>
        </div>

        <div className="metric">
          <span>Sales Today</span>
          <span>$0.00</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Quick Actions</h2>

        <div className="metric">
          <span>New Sale</span>
          <span>Coming Next</span>
        </div>

        <div className="metric">
          <span>Open Register</span>
          <span>Coming Next</span>
        </div>

        <div className="metric">
          <span>Close Out</span>
          <span>Coming Next</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Status</span>
          <span>POS Route Live</span>
        </div>
      </div>
    </>
  )
}