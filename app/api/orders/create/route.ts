import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';
import { sendOrderConfirmation } from '@/lib/email-templates';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const body = await req.json();

    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      items,
      subtotal,
      delivery_fee,
      total,
      payment_method,
      payment_status,
      payment_ref,
      payment_approval,
      order_type,
      wholesaler,
      wholesale_items,
      wholesale_cost_total,
      notes,
    } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items in order' }, { status: 400 });
    }
    if (!total || total <= 0) {
      return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
    }

    const orderPayload: Record<string, unknown> = {
      created_at:       new Date().toISOString(),
      // NOTE: orders has no updated_at or customer_email column — do not
      // write them here (PostgREST rejects unknown columns). The email
      // variable is still used for the confirmation email below.
      customer_name:    customer_name    || null,
      customer_phone:   customer_phone   || null,
      customer_address: customer_address || null,
      items:            items,
      subtotal:         subtotal         || total,
      delivery_fee:     delivery_fee     || 0,
      total:            total,
      payment_method:   payment_method   || 'cash_on_delivery',
      payment_status:   payment_status   || 'unpaid',
      payment_ref:      payment_ref      || null,
      payment_approval: payment_approval || null,
      status:           'pending',
      channel:          'online',
      order_type:       order_type       || 'retail',
      notes:            notes            || null,
    };

    if (order_type === 'wholesale' && wholesaler) {
      orderPayload.wholesaler           = wholesaler;
      orderPayload.wholesale_items      = wholesale_items || items;
      orderPayload.wholesale_cost_total = wholesale_cost_total || 0;
      orderPayload.admin_purchased      = false;
    }

    const { data, error } = await supabase
      .from('orders')
      .insert([orderPayload])
      .select()
      .single();

    if (error) {
      console.error('Order create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fire-and-forget confirmation email. We don't await so the
    // checkout response time stays snappy; email failures only show
    // up in the server logs (the order itself is already safely saved).
    if (customer_email && data?.id) {
      // Best-effort lookup of customer_id by email so the unsubscribe
      // footer is wired even when the buyer wasn't logged in.
      (async () => {
        try {
          const { data: cust } = await supabase.from('customers')
            .select('id').ilike('email', customer_email).maybeSingle();
          const r = await sendOrderConfirmation({
            to:             customer_email,
            customer_id:    cust?.id,
            customer_name:  customer_name || 'friend',
            order_id:       data.id,
            items:          Array.isArray(items) ? items : [],
            subtotal:       Number(subtotal ?? total),
            delivery_fee:   Number(delivery_fee ?? 0),
            total:          Number(total),
            delivery_type:  body.delivery_type ?? null,
            payment_method: payment_method ?? null,
          });
          if (r?.error) console.error('Order confirmation email failed:', r.error);
        } catch (e) {
          console.error('Order confirmation email threw:', e);
        }
      })();
    }

    return NextResponse.json({
      success:  true,
      order_id: data.id,
      order:    data,
    });

  } catch (err) {
    console.error('Order create exception:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
