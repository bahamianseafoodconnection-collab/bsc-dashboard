// /api/payment/return/declined
//
// Plug'n Pay redirects here on bad-card responses (pb_bad_card_url).
// The order stays in 'pending' so the customer can retry; the
// payment_transactions row captures the decline reason for ops + the
// founder's daily reconciliation.

import { NextRequest } from 'next/server';
import { handlePnpReturn } from '@/lib/plugnpay/return-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) { return handlePnpReturn(req, 'declined'); }
export async function GET (req: NextRequest) { return handlePnpReturn(req, 'declined'); }
