export default function Page() {
  return (
    <main style={{ padding: '20px' }}>
      <h1>BSC Control Dashboard</h1>
      <p>Live business control center for BSC Marketplace</p>

      <section style={{ marginTop: '20px' }}>
        <h2>Today&apos;s Sales</h2>
        <p>$0.00</p>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>Cash Position</h2>
        <p>Cash in Hand: $0.00</p>
        <p>Bank: $0.00</p>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>Inventory Alerts</h2>
        <p>No low-stock alerts</p>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>Orders</h2>
        <p>No active orders</p>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>Supplier Payouts</h2>
        <p>No payouts pending</p>
      </section>

      <section style={{ marginTop: '20px' }}>
        <h2>Daily Closeout</h2>
        <p>Not entered yet</p>
      </section>
    </main>
  )
}