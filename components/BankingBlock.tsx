// components/BankingBlock.tsx
//
// Reusable banking-details block for credit/commercial documents
// (statement / invoice / receipt pages). Single source of truth:
// lib/banking-info. NO bank logo/trademark, NO phone, NO website here.
//
// Usage: <BankingBlock />  — drop into a statement/invoice/receipt for
// credit customers + commercial accounts.

import { bankingLines, BANKING_TITLE } from '@/lib/banking-info';

export default function BankingBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: 8, padding: compact ? '8px 10px' : '12px 14px',
      background: '#f8fafc', color: '#1a2e5a', fontSize: compact ? 11 : 12, lineHeight: 1.5,
    }}>
      <div style={{ fontSize: compact ? 10 : 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {BANKING_TITLE}
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {bankingLines().map(({ label, value }) => (
            <tr key={label}>
              <td style={{ padding: '1px 10px 1px 0', color: '#64748b', whiteSpace: 'nowrap' }}>{label}:</td>
              <td style={{ padding: '1px 0', fontWeight: 700 }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
