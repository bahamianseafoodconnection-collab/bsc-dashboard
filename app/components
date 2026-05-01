export default function FinancialSummary({
  sales,
  grossProfit,
  expenses,
  netProfit,
}: any) {
  const box = {
    background: "#fff",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "12px",
  }

  return (
    <div style={box}>
      <p>Sales: ${sales}</p>
      <p>Gross Profit: ${grossProfit}</p>
      <p>Expenses: ${expenses}</p>
      <p style={{ color: netProfit >= 0 ? "green" : "red" }}>
        Net Profit: ${netProfit}
      </p>
    </div>
  )
}
