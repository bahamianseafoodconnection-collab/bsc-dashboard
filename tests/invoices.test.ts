// Tests for lib/invoices.ts.
//
// The module imports a Supabase client at load time. We mock it via
// vi.mock so the unit tests stay pure (no network, no env required
// beyond the dummy values in tests/setup.ts).

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Capture invocations across tests
const calls: { table: string; method: string; args?: unknown }[] = [];
let insertNextResult: { error: unknown } = { error: null };
let selectNextResult: { data: unknown; error: unknown } = { data: [], error: null };
let singleNextResult: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock('@/lib/supabase', () => {
  const queryBuilder = (table: string) => {
    const builder = {
      _table: table,
      _eqVal: undefined as unknown,
      insert(payload: unknown) {
        calls.push({ table, method: 'insert', args: payload });
        return Promise.resolve(insertNextResult);
      },
      select() {
        calls.push({ table, method: 'select' });
        // return a thenable that resolves to selectNextResult, but ALSO
        // a chainable for further .order().eq().maybeSingle() etc.
        const chain = {
          order() { return chain; },
          eq(_col: string, val: unknown) { builder._eqVal = val; return chain; },
          limit() { return chain; },
          maybeSingle() {
            calls.push({ table, method: 'maybeSingle' });
            return Promise.resolve(singleNextResult);
          },
          then(resolve: (v: unknown) => void) { resolve(selectNextResult); },
        };
        return chain;
      },
    };
    return builder;
  };
  return {
    supabase: {
      from(table: string) { return queryBuilder(table); },
    },
  };
});

import {
  createInvoice,
  fetchInvoicesFromDB,
  getInvoiceById,
} from '@/lib/invoices';

beforeEach(() => {
  calls.length = 0;
  insertNextResult = { error: null };
  selectNextResult = { data: [], error: null };
  singleNextResult = { data: null, error: null };
});

describe('createInvoice', () => {
  it('builds an invoice object with computed line totals + ID', async () => {
    const inv = await createInvoice({
      customerName: 'Maria Johnson',
      customerPhone: '2421234567',
      total: 50.00,
      items: [
        { productName: 'Grouper', qty: 2, price: 15.00 },
        { productName: 'Conch',   qty: 1, price: 20.00 },
      ],
    });
    expect(inv.id).toMatch(/^INV-\d+/);
    expect(inv.customerName).toBe('Maria Johnson');
    expect(inv.items).toHaveLength(2);
    expect(inv.items[0].total).toBe(30); // qty * price
    expect(inv.items[1].total).toBe(20);
  });

  it('preserves explicit per-item total when provided', async () => {
    const inv = await createInvoice({
      customerName: 'X',
      customerPhone: '',
      total: 99,
      items: [{ productName: 'Bundle', qty: 1, price: 99, total: 95 }],
    });
    expect(inv.items[0].total).toBe(95); // explicit overrides qty*price
  });

  it('inserts into the invoices table with the right shape', async () => {
    await createInvoice({
      customerName: 'Tom Brown',
      customerPhone: '2421112233',
      total: 17.98,
      items: [{ productName: 'Chicken', qty: 2, price: 8.99 }],
    });
    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall?.table).toBe('invoices');
    const payload = insertCall?.args as Record<string, unknown>;
    expect(payload.customer_name).toBe('Tom Brown');
    expect(payload.customer_phone).toBe('2421112233');
    expect(payload.total).toBe(17.98);
    expect(typeof payload.items).toBe('string'); // serialized to JSON
  });

  it('throws when the insert errors (no silent swallow)', async () => {
    insertNextResult = { error: { message: 'duplicate key' } };
    await expect(
      createInvoice({
        customerName: 'X',
        customerPhone: '',
        total: 1,
        items: [{ productName: 'x', qty: 1, price: 1 }],
      })
    ).rejects.toBeTruthy();
  });
});

describe('fetchInvoicesFromDB', () => {
  it('returns empty array when DB is empty', async () => {
    selectNextResult = { data: [], error: null };
    const out = await fetchInvoicesFromDB();
    expect(out).toEqual([]);
  });

  it('returns empty array on error (graceful)', async () => {
    selectNextResult = { data: null, error: { message: 'oops' } };
    const out = await fetchInvoicesFromDB();
    expect(out).toEqual([]);
  });

  it('maps DB rows into Invoice shape', async () => {
    selectNextResult = {
      data: [
        {
          id: 'INV-1',
          date: '2026-05-08',
          customer_name: 'Maria',
          customer_phone: '2421234567',
          items: JSON.stringify([{ productName: 'Grouper', qty: 2, price: 15, total: 30 }]),
          total: 30,
        },
      ],
      error: null,
    };
    const out = await fetchInvoicesFromDB();
    expect(out).toHaveLength(1);
    expect(out[0].customerName).toBe('Maria');
    expect(out[0].items[0].productName).toBe('Grouper');
    expect(out[0].total).toBe(30);
  });

  it('handles items column already parsed (jsonb returns object, not string)', async () => {
    selectNextResult = {
      data: [
        {
          id: 'INV-2',
          date: '2026-05-09',
          customer_name: 'Tom',
          customer_phone: '',
          items: [{ productName: 'X', qty: 1, price: 5, total: 5 }], // already an array
          total: 5,
        },
      ],
      error: null,
    };
    const out = await fetchInvoicesFromDB();
    expect(out[0].items[0].productName).toBe('X');
  });
});

describe('getInvoiceById', () => {
  it('returns null when not found', async () => {
    singleNextResult = { data: null, error: null };
    const out = await getInvoiceById('INV-missing');
    expect(out).toBeNull();
  });

  it('returns null on error (no throw)', async () => {
    singleNextResult = { data: null, error: { message: 'oops' } };
    const out = await getInvoiceById('INV-x');
    expect(out).toBeNull();
  });

  it('maps a found row into Invoice shape', async () => {
    singleNextResult = {
      data: {
        id: 'INV-3',
        date: '2026-05-09',
        customer_name: 'Kezia',
        customer_phone: '2425554321',
        items: '[{"productName":"Lobster","qty":1,"price":28,"total":28}]',
        total: 28,
      },
      error: null,
    };
    const out = await getInvoiceById('INV-3');
    expect(out).not.toBeNull();
    expect(out?.customerName).toBe('Kezia');
    expect(out?.items[0].productName).toBe('Lobster');
    expect(out?.total).toBe(28);
  });
});
