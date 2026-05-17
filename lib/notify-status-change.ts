// lib/notify-status-change.ts
//
// Single source of truth for the customer-facing message that goes out
// when an order moves through fulfillment. Called from any UI that
// changes order.status (currently /orders, can be extended to other
// fulfillment screens).
//
// The actual delivery happens via /api/notifications/queue + the queue
// processor at /api/notifications/send. While Twilio/SendGrid creds are
// missing the row lands as 'stub_sent' — still useful as an audit trail.
//
// We never block the calling code on this; failures are warned + dropped.

type NotifyArgs = {
  orderId: string | null;
  newStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
};

const SUBJECT_BY_STATUS: Record<string, string> = {
  Confirmed:           'Your BSC order is confirmed',
  Packing:             'We are packing your BSC order',
  'Ready for Pickup':  'Your BSC order is ready for pickup',
  'Out for Delivery':  'Your BSC order is on the way',
  Delivered:           'Your BSC order was delivered',
  Cancelled:           'Your BSC order was cancelled',
};

function bodyFor(status: string, name: string, orderRef: string): string | null {
  const greet = name ? `Hi ${name}, ` : '';
  const ref = orderRef ? ` Order #${orderRef}.` : '';
  switch (status) {
    case 'Confirmed':
      return `${greet}we've confirmed your BSC Marketplace order and started preparing it.${ref} — BSC`;
    case 'Packing':
      return `${greet}your BSC order is being packed now.${ref} — BSC`;
    case 'Ready for Pickup':
      return `${greet}your BSC order is ready for pickup. Bring this confirmation when you arrive.${ref} — BSC`;
    case 'Out for Delivery':
      return `${greet}your BSC order is on the way. The driver will reach out shortly.${ref} — BSC`;
    case 'Delivered':
      return `${greet}your BSC order was delivered. Thanks for shopping with us — your review on the product page helps a lot.${ref} — BSC`;
    case 'Cancelled':
      return `${greet}your BSC order was cancelled. If you didn't request this, please reach out on WhatsApp +1 (242) 361-3474.${ref} — BSC`;
    default:
      return null;
  }
}

export async function notifyOrderStatusChange(args: NotifyArgs): Promise<void> {
  const { orderId, newStatus, customerName, customerPhone, customerEmail, customerId } = args;
  const subject = SUBJECT_BY_STATUS[newStatus];
  const body = bodyFor(newStatus, customerName?.trim() || '', orderId ? orderId.slice(0, 8) : '');
  if (!subject || !body) return;

  // ── PATH 1 — direct transactional email via Resend ─────────────
  // Fires for every status change as long as we have an order_id. The
  // server route looks up the customer's email itself (handles inline
  // customer_email on the order AND the linked customers row), so we
  // don't need to pass it from the caller. No-ops cleanly when no email
  // is on file.
  if (orderId) {
    fetch('/api/email/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, new_status: newStatus }),
    }).catch((err) => console.warn('Order status email enqueue failed:', err));
  }

  // ── PATH 2 — legacy notifications queue (WhatsApp / SendGrid stub) ─
  // Need at least one channel target.
  if (!customerPhone && !customerEmail) return;
  const channel: 'whatsapp' | 'email' = customerPhone ? 'whatsapp' : 'email';
  try {
    await fetch('/api/notifications/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        recipient_phone: customerPhone || null,
        recipient_email: channel === 'email' ? customerEmail || null : null,
        recipient_name: customerName || null,
        template_key: `order_status_${newStatus.toLowerCase().replace(/\s+/g, '_')}`,
        subject,
        body,
        related_order_id: orderId,
        related_customer_id: customerId || null,
      }),
    });
  } catch (err) {
    console.warn('Status-change notification failed:', err);
  }
}
