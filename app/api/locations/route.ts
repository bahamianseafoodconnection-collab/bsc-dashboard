// app/api/locations/route.ts
// BSC Day 6 — return inventory_locations for the scanner dropdown.
// 14 locations from Day 5/5.5 (incl. BSC-US-MIAMI hub).
// Schema: id (uuid PK), code (text), name (text), is_active (boolean)

import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

interface CookieToSet {
name: string;
value: string;
options?: CookieOptions;
}

interface LocationRow {
id: string;
code: string;
name: string;
is_active: boolean | null;
}

export async function GET() {
const cookieStore = await cookies();
const supa = createServerClient(
process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
{
cookies: {
getAll: () => cookieStore.getAll(),
setAll: (toSet: CookieToSet[]) =>
toSet.forEach(({ name, value, options }) =>
cookieStore.set(name, value, options)
),
},
}
);

const { data: auth } = await supa.auth.getUser();
if (!auth?.user) {
return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}

const { data, error } = await supa
.from('inventory_locations')
.select('id, code, name, is_active')
.order('code');

if (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}

// Filter out inactive locations; return shape the scanner expects
const locations = ((data || []) as LocationRow[])
.filter((l) => l.is_active !== false)
.map((l) => ({ id: l.id, code: l.code, name: l.name }));

return NextResponse.json({ locations });
}
