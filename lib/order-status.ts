// lib/order-status.ts
//
// Single source of truth for the online order fulfillment lifecycle.
// Per founder's 8-stage delivery spec (2026-05-26). Six internal
// states map to four customer-facing labels.
//
// Used by:
//   - /api/orders/[id]/transition  (validates role × transition)
//   - /driver dashboard            (transition buttons per current state)
//   - /account/orders/[id]         (customer progress bar + messages)
//   - notification queue           (fires at customer-facing transitions)

export type FulfillmentStatus =
  | 'placed'
  | 'preparing'
  | 'collected'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type CustomerStage =
  | 'order_placed'
  | 'preparing_to_ship'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

// Internal state → customer-facing stage. collected + in_transit both
// surface as "In Transit to Customer" (driver has it, on the way).
const INTERNAL_TO_CUSTOMER: Record<FulfillmentStatus, CustomerStage> = {
  placed:           'order_placed',
  preparing:        'preparing_to_ship',
  collected:        'in_transit',
  in_transit:       'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered:        'delivered',
  cancelled:        'cancelled',
};

interface CustomerStageInfo {
  stage:   CustomerStage;
  label:   string;   // short label for progress bar
  message: string;   // sentence shown to customer (founder's exact copy)
  /** 0-based index in the 5-step progress bar (cancelled = -1). */
  step:    number;
}

const CUSTOMER_STAGE_INFO: Record<CustomerStage, Omit<CustomerStageInfo, 'stage'>> = {
  order_placed:      { label: 'Order Placed',      step: 0, message: 'Your order has been confirmed. Thank you for shopping with us!' },
  preparing_to_ship: { label: 'Preparing to Ship', step: 1, message: 'Your order is being prepared at the supplier.' },
  in_transit:        { label: 'In Transit',        step: 2, message: 'Your order has been collected by our driver and is on the way to your area.' },
  out_for_delivery:  { label: 'Out for Delivery',  step: 3, message: 'Your order is now out for delivery and should arrive shortly.' },
  delivered:         { label: 'Delivered',         step: 4, message: 'Your order has been delivered. Thank you for shopping with us! 🎉' },
  cancelled:         { label: 'Cancelled',         step: -1, message: 'This order was cancelled. Contact BSC support if this is unexpected.' },
};

/** The 5-step customer progress bar, in order. */
export const CUSTOMER_PROGRESS_STEPS: { stage: CustomerStage; label: string }[] = [
  { stage: 'order_placed',      label: 'Order Placed' },
  { stage: 'preparing_to_ship', label: 'Preparing' },
  { stage: 'in_transit',        label: 'In Transit' },
  { stage: 'out_for_delivery',  label: 'Out for Delivery' },
  { stage: 'delivered',         label: 'Delivered' },
];

/** Map an internal fulfillment_status to its customer-facing stage info. */
export function customerStage(status: FulfillmentStatus | string | null | undefined): CustomerStageInfo {
  const s = (status ?? 'placed') as FulfillmentStatus;
  const cust = INTERNAL_TO_CUSTOMER[s] ?? 'order_placed';
  return { stage: cust, ...CUSTOMER_STAGE_INFO[cust] };
}

// ─── State machine: which transitions are allowed, and by whom ───────

export type TransitionAction =
  | 'mark_preparing'
  | 'mark_collected'
  | 'mark_in_transit'
  | 'mark_out_for_delivery'
  | 'mark_delivered'
  | 'cancel';

interface TransitionSpec {
  from:        FulfillmentStatus[];   // valid current states
  to:          FulfillmentStatus;     // resulting state
  roles:       string[];              // roles permitted to do this
  requiresPod: boolean;               // proof-of-delivery photo required?
  /** Timestamp column to stamp + (optional) person column to stamp. */
  stampAt?:    keyof FulfillmentTimestamps;
  stampBy?:    'collected_by' | 'delivered_by';
}

interface FulfillmentTimestamps {
  preparing_at:        string;
  collected_at:        string;
  in_transit_at:       string;
  out_for_delivery_at: string;
  delivered_at:        string;
}

const STAFF  = ['founder', 'co_founder', 'manager', 'control_admin', 'basic_admin'];
const DRIVER = ['founder', 'co_founder', 'manager', 'driver'];
const SUPPLIER_OR_STAFF = [...STAFF, 'supplier', 'processor'];

export const TRANSITIONS: Record<TransitionAction, TransitionSpec> = {
  mark_preparing: {
    from: ['placed'], to: 'preparing',
    roles: SUPPLIER_OR_STAFF, requiresPod: false, stampAt: 'preparing_at',
  },
  mark_collected: {
    from: ['placed', 'preparing'], to: 'collected',
    roles: DRIVER, requiresPod: false, stampAt: 'collected_at', stampBy: 'collected_by',
  },
  mark_in_transit: {
    from: ['collected'], to: 'in_transit',
    roles: DRIVER, requiresPod: false, stampAt: 'in_transit_at',
  },
  mark_out_for_delivery: {
    // Per founder rule: NEVER auto from collected — driver manually marks
    // when they reach the customer's area (geofence is Phase 2).
    from: ['collected', 'in_transit'], to: 'out_for_delivery',
    roles: DRIVER, requiresPod: false, stampAt: 'out_for_delivery_at',
  },
  mark_delivered: {
    from: ['out_for_delivery', 'in_transit'], to: 'delivered',
    roles: DRIVER, requiresPod: true, stampAt: 'delivered_at', stampBy: 'delivered_by',
  },
  cancel: {
    from: ['placed', 'preparing', 'collected', 'in_transit', 'out_for_delivery'], to: 'cancelled',
    roles: STAFF, requiresPod: false,
  },
};

/** Returns the transitions available from a given state (for UI buttons). */
export function availableActions(status: FulfillmentStatus | string | null | undefined): TransitionAction[] {
  const s = (status ?? 'placed') as FulfillmentStatus;
  return (Object.keys(TRANSITIONS) as TransitionAction[]).filter((a) =>
    TRANSITIONS[a].from.includes(s)
  );
}

/** Human label for an action button. */
export function actionLabel(action: TransitionAction): string {
  switch (action) {
    case 'mark_preparing':        return '📦 Mark Preparing';
    case 'mark_collected':        return '🚚 Collected from supplier';
    case 'mark_in_transit':       return '🛣️ In transit';
    case 'mark_out_for_delivery': return '📍 Out for delivery';
    case 'mark_delivered':        return '✅ Delivered (photo required)';
    case 'cancel':                return '✖ Cancel order';
  }
}

/** Validate a transition: returns null if OK, or an error string. */
export function validateTransition(
  action:    TransitionAction,
  current:   FulfillmentStatus | string | null | undefined,
  role:      string | null,
  hasPodPhoto: boolean,
): string | null {
  const spec = TRANSITIONS[action];
  if (!spec) return `Unknown action "${action}"`;
  const cur = (current ?? 'placed') as FulfillmentStatus;
  if (!spec.from.includes(cur)) {
    return `Cannot ${action} from "${cur}" — only from ${spec.from.join(' / ')}.`;
  }
  if (!role || !spec.roles.includes(role)) {
    return `Role "${role ?? 'none'}" cannot ${action}.`;
  }
  if (spec.requiresPod && !hasPodPhoto) {
    return 'Proof-of-delivery photo required before marking delivered.';
  }
  return null;
}

/** Build the orders UPDATE payload for a validated transition. */
export function transitionPayload(
  action:  TransitionAction,
  userId:  string,
): Record<string, unknown> {
  const spec = TRANSITIONS[action];
  const payload: Record<string, unknown> = { fulfillment_status: spec.to };
  if (spec.stampAt) payload[spec.stampAt] = new Date().toISOString();
  if (spec.stampBy) payload[spec.stampBy] = userId;
  return payload;
}
