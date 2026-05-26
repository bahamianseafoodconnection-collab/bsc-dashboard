// /api/payment/return/success
//
// Plug'n Pay redirects the customer's browser here when their hosted
// payment page reports an approved transaction. The actual outcome is
// re-verified in handlePnpReturn — we never trust the URL alone.
//
// Both POST (script-style URL per PnP docs) and GET (in case the
// rewrite middleware ever surfaces this as a static path) are accepted.

import { NextRequest } from 'next/server';
import { handlePnpReturn } from '@/lib/plugnpay/return-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) { return handlePnpReturn(req, 'success'); }
export async function GET (req: NextRequest) { return handlePnpReturn(req, 'success'); }
