// =====================================================================
// lib/print-receipt.ts
//
// Client helper: queue a slip to the Star CloudPRNT printer from any POS
// surface. Fire-and-forget — never block the sale on the printer.
//
//   import { queuePrint } from '@/lib/print-receipt';
//   await queuePrint(orderId);                       // receipt
//   await queuePrint(orderId, 'pick_ticket');        // packer's list
//
// The printer pulls the job on its next CloudPRNT poll (a few seconds).
// Returns { ok } and swallows transport errors so a printer hiccup can
// never throw inside a checkout flow.
// =====================================================================

import { supabase } from '@/lib/supabase';

export type PrintJobType = 'receipt' | 'invoice' | 'pick_ticket';

export async function queuePrint(
  orderId: string,
  jobType: PrintJobType = 'receipt',
  opts?: { copies?: number; printerId?: string },
): Promise<{ ok: boolean; job_id?: string; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return { ok: false, error: 'Not signed in' };
    const res = await fetch('/api/print/enqueue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store',
      body: JSON.stringify({
        order_id: orderId,
        job_type: jobType,
        copies: opts?.copies,
        printer_id: opts?.printerId,
      }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    return json as { ok: boolean; job_id?: string; error?: string };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Print queue failed' };
  }
}
