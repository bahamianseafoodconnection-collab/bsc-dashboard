// =====================================================================
// lib/banking-info.ts
//
// SINGLE SOURCE OF TRUTH for BSC's receiving-bank details.
// (Founder decision 2026-06-28.) Printed on every credit/commercial
// statement, invoice, and receipt. NO bank logo/trademark, NO phone, NO
// website in this block — those belong elsewhere on the document.
//
// Consumed by:
//   - lib/statements/pdf.ts          (statement PDF)
//   - components/BankingBlock.tsx     (React: statement/invoice/receipt pages)
//   - lib/star-markup.ts (future)     (thermal receipt for credit/commercial)
//
// Change the numbers in ONE place — here.
// =====================================================================

export interface BankingInfo {
  bank: string;
  branch: string;
  account: string;
  accountName: string;
  type: string;
}

export const BANKING_INFO: BankingInfo = {
  bank:        'Royal Bank of Canada',
  branch:      '05135',
  account:     '2417798',
  accountName: 'Bahamian Seafood Connection',
  type:        'Checking',
};

export const BANKING_TITLE = 'Banking / Payment Details';

// Ordered label/value pairs — render the same everywhere.
export function bankingLines(b: BankingInfo = BANKING_INFO): Array<{ label: string; value: string }> {
  return [
    { label: 'Bank',         value: b.bank },
    { label: 'Branch',       value: b.branch },
    { label: 'Account',      value: b.account },
    { label: 'Account Name', value: b.accountName },
    { label: 'Type',         value: b.type },
  ];
}

// Plain-text form (thermal receipts, SMS/WhatsApp bodies).
export function bankingText(b: BankingInfo = BANKING_INFO): string {
  return bankingLines(b).map(({ label, value }) => `${label}: ${value}`).join('\n');
}
