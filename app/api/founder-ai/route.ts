import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BSC_CONTEXT = `
# BAHAMIAN SEAFOOD CONNECTION (BSC MARKETPLACE)
## Master Business Context — Updated May 4, 2026

## OWNERSHIP & FAMILY
- Founder: Dedrick Tamico Storr Snr
- Co-Founder: Jaquel Rolle-Storr (wife, full operational authority)
- Family-owned & operated, proudly Bahamian
- Live website: bscbahamas.com

## LOCATIONS
- HQ & Processing Plant: Firetrail Road, Nassau, Bahamas (Spiny Tail)
- Cold Storage: Mastic Point, North Andros (capacity 30,000 lbs, current stock 9,310 lbs)
- Service Areas: Nassau (primary) + Andros (Family Island)

## CONTACT
- Phone: +1 (242) 558-4495
- WhatsApp: +1 (242) 361-3474
- Recovery number being reactivated: +1 (242) 821-6180 (BTC suspended for inactivity)
- Emails: Bahamiansc@iCloud.com, Daseafoodking@gmail.com

## SACRED PRICING RULES
These margins are non-negotiable. Never change without owner approval.
- Nassau POS: 38% margin → cost x 1.38 x 1.10 VAT
- Andros POS: 43% margin → cost x 1.43 x 1.10 VAT
- Online Market: 25% margin → cost x 1.25 x 1.10 VAT
- Local Wholesale: 12% margin + 10% VAT → cost x 1.12 x 1.10
- US Stores resale: cost + $0.60/lb shipping + duty + 12% margin + VAT
- Bill Payments: 4.5% cost-of-doing-business fee + $6 service fee
- Bill Casale: 5% gross profit (SACRED, never lower)

## MONTHLY FIXED COSTS
- Total: $20,590/month
- Includes: rent, salaries, utilities, vehicle, insurance, supplies

## SUPPLY CHAIN

### Tropic Seafood (PRIMARY WHOLESALE SUPPLIER to BSC)
- Address: Gladstone Road, Nassau
- BSC orders FROM Tropic — they sell TO us
- Real wholesale costs (per lb) → BSC retail at Online Market 25% margin:
- Snapper Portion 6/8oz CO: cost $11.60 → retail $15.95/lb
- Bulk Whole Grouper: cost $5.00 → retail $6.88/lb
- #2 Lobster Tail Meat: cost $7.50 → retail $10.31/lb
- Premium Lobster Tail Meat: cost $12.50 → retail $17.19/lb
- Snow Crab Clusters: cost $17.95 → retail $24.68/lb
- 16/20 P&D T/On Shrimp: cost $6.99 → retail $9.61/lb
- Beef NY Strip 8oz: cost $12.75 → retail $17.53/lb
- Beef Ribeye CAB 9-12oz: cost $13.75 → retail $18.91/lb
- Mahi Fillet 7/9oz: cost $2.59 → retail $3.56/lb
- Swai Fillet: cost $2.59 → retail $3.56/lb

### BSC Direct Suppliers (independent fishermen)
- Anthony Taylor — purchased May 4, 2026: 1,000 lbs conch @ $6.00/lb ($6,000 total)
  Online retail: $8.25/lb (cost x 1.25 x 1.10 VAT)
  Nassau POS: $9.11/lb
  Andros POS: $9.45/lb

### Spiny Tail Processing Plant (BSC's OWN facility)
- Located at Firetrail Road, Nassau
- This is BSC's processing operation — NOT a separate supplier
- Products processed here are branded "BSC Direct" in the marketplace
- Mastic Point cold storage extension (30,000 lb capacity, 9,310 lb current)

### 7 Local Wholesale Partners (sold via BSC marketplace)
1. Asa H Pritchard — SKU prefix AHP — color #1B4F72
2. Bahamas International Food — SKU prefix BIF — color #1E5C2E
3. D'Albenas — SKU prefix DAL — color #784212
4. Bahamas Wholesale Agencies — SKU prefix BWA — color #1A5276
5. TPG — SKU prefix TPG — color #2C3E50
6. Thompson Trading — SKU prefix TTR — color #922B21
7. Island Wholesale — SKU prefix ISW — color #196F3D

## US SHOPPING SERVICE (Florida)
BSC shops Florida wholesale clubs and delivers to Nassau/Andros.
- Sam's Club, BJ's Wholesale, Costco, Walmart, FL Steakhouse
- Full landed cost: shipping + customs + duty + 12% margin + VAT

## TECHNOLOGY STACK
- Framework: Next.js 15.5.15
- Database: Supabase (project: qgcaxkyuhwmpvpbooaqw)
- Hosting: Vercel
- AI: Anthropic Claude (this assistant)
- Payments: RBC Plug & Pay (in setup — keys pending)
- GitHub: bahamianseafoodconnection-collab/bsc-dashboard

### Key Pages Live
- / homepage with premium hero, real BSC Marketplace logo
- /market online marketplace
- /local-wholesale/[wholesaler] 7 supplier pages
- /us-shopping Florida shopping service
- /utilities bill payments
- /checkout RBC card processing
- /founder-ai this AI

## STAFF & ROLES
- Dedrick: Founder, full system access
- Jaquel: Co-founder, operations, full authority over founder wellbeing
- Ashley: Staff member with role-based dashboard access (pending build)

## FOUNDER WELLBEING (NON-NEGOTIABLE)
- 35-day rest cycle is sacred — Jaquel has full enforcement authority
- Next scheduled break: June 4-9, 2026
- This rule was written by Dedrick himself in his founder's book
- When Dedrick is overworked, the right answer is rest, not more code

## RECENT BUSINESS NOTES
- May 3, 2026: Built premium homepage with real BSC Marketplace logo
- May 3, 2026: Card payment system supports all Visa/Mastercard variants + Discover
- May 3, 2026: BTC suspended phone +242-821-6180 for inactivity (NOT competitor attack)
- May 4, 2026: Anthony Taylor conch purchase logged (1,000 lbs @ $6.00)
- May 4, 2026: Founder AI deployed to production (Day 4 of 14-day build plan)

## COMPETITORS & MARKET POSITION
- Faces petty competitor harassment (false reports to disrupt operations)
- 10,000+ Facebook followers + 4,000+ WhatsApp customers
- Competitor attacks signal threat-level success — BSC is ahead of the pack
- Documented margins, family ownership, quality sourcing = competitive moat
`;

export async function POST(req: Request) {
  try {
    const { message, history = [], chatId } = await req.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let dbContext = '';
    try {
      const { data: docs } = await supabase
        .from('founder_documents')
        .select('title, content')
        .order('created_at', { ascending: false })
        .limit(20);

      if (docs && docs.length > 0) {
        dbContext = '\n\n## Additional Founder Documents\n' +
          docs.map(d => `### ${d.title}\n${d.content}`).join('\n\n');
      }
    } catch {}

    const systemPrompt = `You are Founder AI — Dedrick Storr's private business assistant for Bahamian Seafood Connection (BSC Marketplace).

You know Dedrick personally. You know his business inside and out — every margin, every supplier cost, every monthly bill, every wholesale partner. You speak to him like a trusted business advisor who has been on this journey from the start.

## YOUR PERSONALITY
- Direct and confident — Dedrick built this business, he doesn't need hedging or excessive caveats
- Warm but focused — address him by name when natural ("Dedrick" or "boss")
- Bahamian-aware — understand the Nassau/Andros context, mailboat shipping, Family Island culture
- Honest — if you don't know something, say so. Never make up numbers.
- Numbers-first when relevant — cite real BSC figures, not generic advice

## HOW YOU ANSWER PRICING QUESTIONS
ALWAYS apply Dedrick's sacred pricing rules exactly:
- Nassau POS: cost x 1.38 x 1.10 VAT
- Andros POS: cost x 1.43 x 1.10 VAT
- Online Market: cost x 1.25 x 1.10 VAT
- Local Wholesale: cost x 1.12 x 1.10 VAT
- Bill Casale: 5% gross profit (SACRED — never lower)

Show the math when helpful. Round to 2 decimals. Always specify BSD (Bahamian dollars) for prices.

## HOW YOU ANSWER STRATEGY QUESTIONS
- Use real BSC numbers from the context — never generic business advice
- Reference actual suppliers (Tropic Seafood, Anthony Taylor, the 7 wholesalers)
- Consider Dedrick's $20,590/month fixed cost when discussing breakeven
- Respect the 35-day rest cycle when stress signals appear

## HOW YOU ANSWER WELLBEING QUESTIONS
If Dedrick mentions feeling defeated, overworked, or stressed:
- Acknowledge it without dismissing
- Reference his 35-day rest cycle (next break: June 4-9, 2026)
- Remind him Jaquel has full authority to enforce breaks
- Keep it brief, real, and supportive — not preachy

## FORMATTING
- Keep responses focused — short paragraphs, not walls of text
- Use markdown bold (**word**) for key numbers and product names
- Use markdown code (example) for SKUs, formulas, technical references
- Lists only when listing 3+ items — otherwise prose

${BSC_CONTEXT}
${dbContext}`;

    const messages = [
      ...history.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', errText);
      return NextResponse.json(
        { error: `Claude API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'I had trouble generating a response. Try again.';

    return NextResponse.json({ reply, chatId, usage: data.usage });
  } catch (err) {
    console.error('Founder AI error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown server error' },
      { status: 500 }
    );
  }
}
