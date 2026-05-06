// ============================================================
// BSC MARKETPLACE — INVOICE SAVE API
// File: app/api/invoice-save/route.ts
// Saves invoice to DB, tracks balance owed
// Inventory insertion handled separately (see processing_batches workflow)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase environment variables not configured.' },
        { status: 500 }
      );
    }

    const { items, location, summary, totalAmount, supplierOwed } = await req.json();

    if (!items || !location) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const invoiceRef = `BSC-INV-${Date.now()}`;

    // Save invoice to purchase_invoices
    const { data: invoice, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .insert([{
        invoice_ref: invoiceRef,
        location,
        total_amount: totalAmount,
        balance_owed: supplierOwed,
        status: 'unpaid',
        items: items,
        summary,
        image_urls: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }])
      .select()
      .single();

    if (invoiceError) {
      console.error('Invoice save error:', invoiceError);
      return NextResponse.json({ error: 'Failed to save invoice' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceRef,
      balanceOwed: supplierOwed,
    });

  } catch (error) {
    console.error('Invoice save route error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Apply a payment against an invoice
export async function PATCH(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase environment variables not configured.' },
        { status: 500 }
      );
    }

    const { invoiceId, paymentAmount, note, orderId } = await req.json();

    if (!invoiceId || !paymentAmount) {
      return NextResponse.json({ error: 'Missing invoiceId or paymentAmount' }, { status: 400 });
    }

    // Get current invoice
    const { data: invoice, error: fetchError } = await supabase
      .from('purchase_invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const newBalance = Math.max(0, invoice.balance_owed - paymentAmount);
    const newStatus = newBalance === 0 ? 'paid' : 'partial';

    // Update invoice balance
    await supabase
      .from('purchase_invoices')
      .update({
        balance_owed: newBalance,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);

    // Log the payment
    await supabase
      .from('invoice_payments')
      .insert([{
        invoice_id: invoiceId,
        amount: paymentAmount,
        note: note || 'Payment applied',
        order_id: orderId || null,
        created_at: new Date().toISOString(),
      }]);

    return NextResponse.json({
      success: true,
      newBalance,
      status: newStatus,
      paidInFull: newStatus === 'paid',
    });

  } catch (error) {
    console.error('Payment apply error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
