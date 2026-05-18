// BSC Daily Briefing email template.
//
// A pure React function that returns the email body as JSX. The send
// helper (lib/resend/send-daily-briefing.ts) renders this with
// react-dom/server's renderToStaticMarkup() and ships the resulting
// HTML to Resend.
//
// Branding:
//   Navy   #060d1f  (header band, accents)
//   Gold   #f5c518  (CTAs, kickers)
//   Fonts  Playfair Display (serif headings), DM Sans (body)
//
// Dyslexia-friendly: short paragraphs, generous line-height, bolded
// keywords inline, never a wall of text.

import * as React from 'react';

export interface DailyBriefingNumber {
  label: string;
  value: string;     // pre-formatted (e.g. "$12,840.50", "47", "+18%")
  trend?: 'up' | 'down' | 'flat';
  hint?: string;     // small grey sub-line
}

export interface CashFlowDay {
  day:     string;   // "Mon", "Tue", ...
  date:    string;   // "May 18"
  inflow:  number;
  outflow: number;
  net:     number;
}

export interface DailyBriefingProps {
  briefingDate:           string;                      // "Saturday, May 17 2026"
  greetingName?:          string;                      // "Dedrick + Jaquel"
  yesterdaysNumbers?:     DailyBriefingNumber[];
  whatINoticed?:          string[];                    // bullet observations
  sevenDayForecast?:      CashFlowDay[];               // 7 days ahead
  whatToFocusOn?:         string[];                    // 3-5 action items
  billsNote?:             string;                      // short paragraph for Bill
  dashboardUrl?:          string;                      // CTA target
}

const NAVY = '#060d1f';
const GOLD = '#f5c518';
const SOFT = '#f7f8f8';
const BORDER = '#e7e7e7';
const TEXT  = '#1c1c1c';
const MUTED = '#565959';

const DEFAULT_NUMBERS: DailyBriefingNumber[] = [
  { label: 'Sales',         value: '—', hint: 'awaiting bank-data hookup' },
  { label: 'Orders',        value: '—' },
  { label: 'New Customers', value: '—' },
];

const DEFAULT_FORECAST: CashFlowDay[] = [
  { day: 'Sun', date: '—', inflow: 0, outflow: 0, net: 0 },
  { day: 'Mon', date: '—', inflow: 0, outflow: 0, net: 0 },
  { day: 'Tue', date: '—', inflow: 0, outflow: 0, net: 0 },
  { day: 'Wed', date: '—', inflow: 0, outflow: 0, net: 0 },
  { day: 'Thu', date: '—', inflow: 0, outflow: 0, net: 0 },
  { day: 'Fri', date: '—', inflow: 0, outflow: 0, net: 0 },
  { day: 'Sat', date: '—', inflow: 0, outflow: 0, net: 0 },
];

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export default function DailyBriefing(props: DailyBriefingProps): React.ReactElement {
  const {
    briefingDate,
    greetingName     = 'Dedrick + Jaquel',
    yesterdaysNumbers = DEFAULT_NUMBERS,
    whatINoticed     = ['Bank data aggregator not wired yet — this is a scaffold preview. Real observations land tomorrow.'],
    sevenDayForecast = DEFAULT_FORECAST,
    whatToFocusOn    = ['Confirm Resend → inbox delivery looks right.', 'Approve the email tone before we wire bank data.'],
    billsNote        = 'No bill-specific note yet.',
    dashboardUrl     = 'https://bscbahamas.com/dashboard/daily-briefing',
  } = props;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>BSC Daily Briefing — {briefingDate}</title>
      </head>
      <body style={{ margin: 0, padding: 0, background: SOFT, fontFamily: '"DM Sans", Helvetica, Arial, sans-serif', color: TEXT }}>
        <table width="100%" cellPadding={0} cellSpacing={0} border={0} role="presentation">
          <tbody>
            <tr>
              <td align="center">
                <table width={620} cellPadding={0} cellSpacing={0} border={0} role="presentation" style={{ background: '#fff', margin: '24px auto', borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDER}` }}>

                  {/* Header band */}
                  <tbody><tr>
                    <td style={{ background: NAVY, color: GOLD, padding: '20px 28px' }}>
                      <div style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', fontWeight: 700 }}>
                        BSC · Daily Briefing
                      </div>
                      <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 6, lineHeight: 1.2 }}>
                        {briefingDate}
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                        Hi {greetingName}.
                      </div>
                    </td>
                  </tr>

                  {/* Yesterday's Numbers */}
                  <tr>
                    <td style={{ padding: '20px 28px 8px' }}>
                      <Section title="Yesterday’s Numbers" />
                      <table width="100%" cellPadding={0} cellSpacing={0} border={0} role="presentation" style={{ marginTop: 8 }}>
                        <tbody><tr>
                          {yesterdaysNumbers.map((n, i) => (
                            <td key={i} valign="top" style={{ width: `${100 / Math.max(yesterdaysNumbers.length, 1)}%`, padding: '10px 8px', background: SOFT, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                              <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{n.label}</div>
                              <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 20, fontWeight: 700, color: NAVY, marginTop: 4 }}>
                                {n.value}{n.trend === 'up' ? ' ↑' : n.trend === 'down' ? ' ↓' : ''}
                              </div>
                              {n.hint && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{n.hint}</div>}
                            </td>
                          ))}
                        </tr></tbody>
                      </table>
                    </td>
                  </tr>

                  {/* What I Noticed */}
                  <tr>
                    <td style={{ padding: '14px 28px 4px' }}>
                      <Section title="What I Noticed" />
                      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
                        {whatINoticed.map((n, i) => (
                          <li key={i} style={{ marginBottom: 4 }}>{boldKeywords(n)}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>

                  {/* 7-Day Cash Flow Forecast */}
                  <tr>
                    <td style={{ padding: '14px 28px 4px' }}>
                      <Section title="7-Day Cash Flow Forecast" />
                      <table width="100%" cellPadding={0} cellSpacing={0} border={0} role="presentation" style={{ marginTop: 8, fontSize: 12, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th align="left"  style={{ padding: '6px 6px', borderBottom: `2px solid ${NAVY}`, color: NAVY, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Day</th>
                            <th align="right" style={{ padding: '6px 6px', borderBottom: `2px solid ${NAVY}`, color: NAVY, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>In</th>
                            <th align="right" style={{ padding: '6px 6px', borderBottom: `2px solid ${NAVY}`, color: NAVY, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Out</th>
                            <th align="right" style={{ padding: '6px 6px', borderBottom: `2px solid ${NAVY}`, color: NAVY, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sevenDayForecast.map((d, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : SOFT }}>
                              <td style={{ padding: '6px 6px' }}><strong>{d.day}</strong> <span style={{ color: MUTED }}>{d.date}</span></td>
                              <td align="right" style={{ padding: '6px 6px' }}>{money(d.inflow)}</td>
                              <td align="right" style={{ padding: '6px 6px' }}>{money(d.outflow)}</td>
                              <td align="right" style={{ padding: '6px 6px', fontWeight: 700, color: d.net < 0 ? '#c0392b' : NAVY }}>{money(d.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>

                  {/* What to Focus On */}
                  <tr>
                    <td style={{ padding: '14px 28px 4px' }}>
                      <Section title="What to Focus On" />
                      <ol style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 14, lineHeight: 1.7 }}>
                        {whatToFocusOn.map((n, i) => (
                          <li key={i} style={{ marginBottom: 6 }}>{boldKeywords(n)}</li>
                        ))}
                      </ol>
                    </td>
                  </tr>

                  {/* Bill's Note */}
                  <tr>
                    <td style={{ padding: '14px 28px 4px' }}>
                      <Section title="Bill’s Note" />
                      <div style={{ background: SOFT, borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.8, marginTop: 6, borderLeft: `4px solid ${GOLD}` }}>
                        {boldKeywords(billsNote)}
                      </div>
                    </td>
                  </tr>

                  {/* CTA */}
                  <tr>
                    <td align="center" style={{ padding: '22px 28px 6px' }}>
                      <a href={dashboardUrl} style={{ display: 'inline-block', background: GOLD, color: NAVY, padding: '12px 22px', borderRadius: 8, fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>
                        Open the Daily Briefing dashboard
                      </a>
                    </td>
                  </tr>

                  {/* Footer */}
                  <tr>
                    <td style={{ background: SOFT, padding: '14px 28px', fontSize: 11, color: MUTED, textAlign: 'center', lineHeight: 1.6 }}>
                      Bahamian Seafood Connection · Nassau, Bahamas<br />
                      Internal briefing — sent to founder + co-founder only.
                    </td>
                  </tr>
                </tbody></table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

function Section({ title }: { title: string }) {
  return (
    <div style={{ fontFamily: '"Playfair Display", Georgia, serif', fontSize: 16, fontWeight: 700, color: NAVY, borderBottom: `2px solid ${NAVY}`, paddingBottom: 4, marginTop: 4 }}>
      {title}
    </div>
  );
}

// Bold every word inside *asterisks* — so the AI prompt can say
// "*Salmon* sold out by 2pm" and Bill sees Salmon bolded inline,
// helping the dyslexia-friendly scan.
function boldKeywords(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) =>
    p.startsWith('*') && p.endsWith('*') && p.length > 2
      ? <strong key={i} style={{ color: NAVY }}>{p.slice(1, -1)}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}
