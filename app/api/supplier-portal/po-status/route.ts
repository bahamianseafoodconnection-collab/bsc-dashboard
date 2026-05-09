// app/api/supplier-portal/po-status/route.ts
//
// Lets a signed-in supplier advance the status on a purchase_orders row
// THAT BELONGS TO THEM. Auth flow:
//   1. Resolve auth.uid() → users.role (must be supplier or partner_us)
//   2. Resolve user → suppliers.portal_user_id
//   3. Verify the PO's supplier_name matches the supplier's name
//      (case-insensitive, trimmed; contact_name as fallback)
//   4. Allow only forward-progression: allocated → preparing → ready
//      → delivered (or cancelled at any point)
//   5. Service-role admin client does the update so RLS can't block it

import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const SUPPLIER_ROLES = new Set(['supplier', 'partner_us']);

// Allowed transitions. Forward only — no rollback from supplier side.
const ALLOWED_NEXT: Record<string, string[]> = {
  allocated:  ['preparing', 'cancelled'],
  preparing:  ['ready', 'cancelled'],
  ready:      ['delivered', 'cancelled'],
  delivered:  [],
  cancelled:  [],
  // Default fallback — many of the older PO rows are status='allocated'
  // but some flows use processed/etc. Treat unknown current statuses
  // as if they were 'allocated'.
};

type Body = {
  purchase_order_id?: string;
  next_status?: string;
  note?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const poId = (body.purchase_order_id || '').trim();
  const next = (body.next_status || '').trim().toLowerCase();
  const note = (body.note || '').trim();

  if (!poId || !next) {
    return NextResponse.json(
      { error: 'purchase_order_id and next_status are required' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Auth: try Bearer first, fall back to SSR cookies.
  let userId: string | null = null;
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  if (bearer) {
    try {
      const c = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await c.auth.getUser(bearer);
      userId = data?.user?.id ?? null;
    } catch { /* fall through */ }
  }
  if (!userId) {
    try {
      const cookieStore = await cookies();
      const ssr = createServerClient(url, anon, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet: CookieToSet[]) =>
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      });
      const { data } = await ssr.auth.getUser();
      userId = data?.user?.id ?? null;
    } catch { /* userId stays null */ }
  }
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized — please sign in.' }, { status: 401 });
  }

  // Service-role admin client.
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userRow } = await admin
    .from('users')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle();
  if (!userRow || !userRow.is_active) {
    return NextResponse.json({ error: 'Account inactive' }, { status: 403 });
  }
  if (!SUPPLIER_ROLES.has(userRow.role as string)) {
    return NextResponse.json(
      { error: `Role ${userRow.role} cannot update PO status` },
      { status: 403 }
    );
  }

  const { data: supplier } = await admin
    .from('suppliers')
    .select('id, name, contact_name')
    .eq('portal_user_id', userId)
    .maybeSingle();
  if (!supplier) {
    return NextResponse.json(
      { error: 'No supplier record linked to your account' },
      { status: 403 }
    );
  }

  const { data: po } = await admin
    .from('purchase_orders')
    .select('id, supplier_name, status, processing_status')
    .eq('id', poId)
    .maybeSingle();
  if (!po) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
  }

  // Ownership check: PO supplier_name must match this supplier's
  // canonical name OR their contact_name.
  const poSupplier = (po.supplier_name as string | null)?.trim().toLowerCase() || '';
  const myNames = [
    (supplier.name as string | null)?.trim().toLowerCase() || '',
    (supplier.contact_name as string | null)?.trim().toLowerCase() || '',
  ].filter(Boolean);
  if (!myNames.includes(poSupplier)) {
    return NextResponse.json(
      { error: `This PO is for ${po.supplier_name}, not your account` },
      { status: 403 }
    );
  }

  // Transition check
  const current = (po.status as string | null)?.toLowerCase() || 'allocated';
  const allowed = ALLOWED_NEXT[current] ?? ALLOWED_NEXT.allocated;
  if (!allowed.includes(next)) {
    return NextResponse.json(
      { error: `Cannot advance from ${current} to ${next}` },
      { status: 400 }
    );
  }

  const nowIso = new Date().toISOString();
  const noteStamp = note ? `[${next.toUpperCase()} ${nowIso.slice(0, 10)} by supplier] ${note}` : null;

  const { error: updErr } = await admin
    .from('purchase_orders')
    .update({
      status: next,
      processing_status:
        next === 'delivered'  ? 'delivered'
      : next === 'ready'      ? 'ready_for_pickup'
      : next === 'preparing'  ? 'in_progress'
      : next === 'cancelled'  ? 'cancelled'
      : po.processing_status,
      updated_at: nowIso,
      ...(noteStamp ? { ai_summary: noteStamp } : {}),
    })
    .eq('id', poId);

  if (updErr) {
    return NextResponse.json(
      { error: `Update failed: ${updErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, status: next });
}
