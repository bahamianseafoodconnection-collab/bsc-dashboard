// /api/payment/return/problem
//
// Plug'n Pay redirects here on gateway-level errors (pb_problem_url) —
// no response from RBC, processor timeout, malformed request, etc.
// These are transient by nature, so handlePnpReturn surfaces the
// retry-friendly customer message and keeps the order in 'pending'.

import { NextRequest } from 'next/server';
import { handlePnpReturn } from '@/lib/plugnpay/return-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) { return handlePnpReturn(req, 'problem'); }
export async function GET (req: NextRequest) { return handlePnpReturn(req, 'problem'); }
