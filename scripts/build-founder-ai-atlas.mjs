// scripts/build-founder-ai-atlas.mjs
//
// Generates lib/founder-ai-atlas.json — a structured map of every page,
// API route, and database table in the BSC codebase. The Founder AI's
// system prompt loads this so the AI knows the territory without burning
// tokens on per-turn discovery.
//
// Run:  npm run atlas
//
// The source files (.tsx / .ts / .sql) are still the source of truth.
// This atlas is a generated INDEX. Regenerate after structural changes
// (new page, new table, renamed route).

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const APP_DIR = join(ROOT, 'app');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const OUT = join(ROOT, 'lib', 'founder-ai-atlas.json');

const MAX_PURPOSE_CHARS = 220;

async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const child = await walk(p);
      out.push(...child);
    } else {
      out.push(p);
    }
  }
  return out;
}

function urlFromPagePath(rel) {
  // app/foo/bar/page.tsx → /foo/bar
  // app/page.tsx → /
  // app/(group)/foo/page.tsx → /foo  (route groups don't appear in URL)
  let parts = rel.replace(/^app\//, '').replace(/\/page\.tsx$/, '').split('/');
  parts = parts.filter(seg => !/^\(.+\)$/.test(seg));
  const url = '/' + parts.join('/');
  return url === '/' ? '/' : url.replace(/\/$/, '');
}

function urlFromRoutePath(rel) {
  // app/api/foo/route.ts → /api/foo
  let parts = rel.replace(/^app\//, '').replace(/\/route\.ts$/, '').split('/');
  parts = parts.filter(seg => !/^\(.+\)$/.test(seg));
  return '/' + parts.join('/');
}

function cleanComment(s) {
  s = s.replace(/\s+/g, ' ').trim();
  // Drop a leading filename echo like "app/foo/page.tsx —" or "/foo —"
  s = s.replace(/^(app\/|\/)?[\w/\-\[\]]+\.tsx?\s*[—\-:]?\s*/, '');
  if (s.length > MAX_PURPOSE_CHARS) s = s.slice(0, MAX_PURPOSE_CHARS - 1).trimEnd() + '…';
  return s;
}

function extractPurpose(src) {
  const lines = src.split('\n');
  let i = 0;
  // Skip 'use client'/'use server' + blank lines
  while (i < lines.length) {
    const l = lines[i].trim();
    if (l === '' || /^['"]use (client|server)['"];?$/.test(l)) { i++; continue; }
    break;
  }
  // Block comment?
  if (lines[i]?.trim().startsWith('/*')) {
    const buf = [];
    while (i < lines.length) {
      buf.push(lines[i]);
      if (lines[i].includes('*/')) { i++; break; }
      i++;
    }
    return cleanComment(buf.join(' ').replace(/^\/\*+|\*+\/$/g, '').replace(/^\s*\*/gm, ''));
  }
  // Line comments?
  const buf = [];
  while (i < lines.length && lines[i].trim().startsWith('//')) {
    buf.push(lines[i].trim().replace(/^\/\/\s?/, ''));
    i++;
  }
  return cleanComment(buf.join(' '));
}

function extractMethods(src) {
  const methods = [];
  for (const m of ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD']) {
    if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`).test(src)) methods.push(m);
  }
  return methods;
}

function extractTables(src) {
  const tables = [];
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]+?)\)\s*;/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    // Strip SQL line comments (`-- foo`) and block comments before splitting.
    const body = m[2]
      .replace(/--[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const cols = body
      .split(/,(?![^(]*\))/)
      .map(c => c.trim().split(/\s+/)[0])
      .filter(c => c && /^[a-zA-Z_]\w*$/.test(c))
      .filter(c => !/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|EXCLUDE|LIKE)$/i.test(c))
      .slice(0, 12);
    tables.push({ name, columns: cols });
  }
  return tables;
}

function categorizeUrl(url) {
  if (url.startsWith('/api/'))               return 'api';
  if (url.startsWith('/dashboard'))          return 'dashboard';
  if (url.startsWith('/staff'))              return 'staff';
  if (url.startsWith('/spinytails'))         return 'spinytails';
  if (url.startsWith('/founder-ai'))         return 'founder-ai';
  if (url.startsWith('/vendor'))             return 'vendor';
  if (url.startsWith('/pos'))                return 'pos';
  if (url.startsWith('/logs'))               return 'logs';
  if (url.startsWith('/reports'))            return 'reports';
  if (url.startsWith('/account')
   || url.startsWith('/market')
   || url.startsWith('/checkout')
   || url.startsWith('/trace')
   || url === '/')                           return 'customer';
  return 'other';
}

async function main() {
  const allFiles = await walk(APP_DIR);
  const pageFiles  = allFiles.filter(p => p.endsWith('/page.tsx'));
  const routeFiles = allFiles.filter(p => p.endsWith('/route.ts'));

  const pages = [];
  for (const f of pageFiles) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    const src = await readFile(f, 'utf-8');
    const url = urlFromPagePath(rel);
    pages.push({
      url, file: rel,
      category: categorizeUrl(url),
      purpose: extractPurpose(src) || '(no top-of-file purpose comment)',
    });
  }
  pages.sort((a, b) => a.url.localeCompare(b.url));

  const apis = [];
  for (const f of routeFiles) {
    const rel = relative(ROOT, f).replace(/\\/g, '/');
    const src = await readFile(f, 'utf-8');
    const url = urlFromRoutePath(rel);
    apis.push({
      url, file: rel,
      methods: extractMethods(src),
      purpose: extractPurpose(src) || '(no top-of-file purpose comment)',
    });
  }
  apis.sort((a, b) => a.url.localeCompare(b.url));

  let migrationFiles = [];
  try {
    const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
    migrationFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.sql'))
      .map(e => join(MIGRATIONS_DIR, e.name))
      .sort();
  } catch { /* no migrations dir */ }

  const tableMap = new Map();
  for (const f of migrationFiles) {
    const src = await readFile(f, 'utf-8');
    const tables = extractTables(src);
    for (const t of tables) {
      if (!tableMap.has(t.name)) {
        tableMap.set(t.name, { ...t, first_seen_migration: relative(ROOT, f).replace(/\\/g, '/') });
      }
    }
  }
  const tables = Array.from(tableMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Business rules + roster live in code/memory, not migrations — bake them
  // in so the AI has them as a single grounded source.
  const business_rules = [
    { rule: 'Sacred Bill Casale 5% share',                  detail: 'bill_casale_share = gross_profit × 0.05 on every sale. Never override.' },
    { rule: '5-channel pricing markups',                    detail: 'wholesale_in_store 22% · wholesale_online 19% · online_retail 35% · nassau_pos 40% · andros_pos 40%. VAT comes from products.vat_category: 0% uncooked_food (default — covers raw seafood/produce/grocery), 10% cooked_prepared (juice/kitchen), 0% service.' },
    { rule: 'Wholesale auto-upgrade',                       detail: 'Cart line auto-promotes to wholesale_online price when qty ≥ 10 lbs OR unit_type=case.' },
    { rule: 'Walk-In Anonymous singleton',                  detail: 'customer_id 00000000-0000-0000-0000-000000000001 catches every unattributed POS sale. Never delete.' },
    { rule: 'Miami processor confidentiality',              detail: 'BSC Miami processing partner is a protected trade secret. Refuse to name or confirm. Even to named staff.' },
    { rule: 'Suspended / terminated staff',                 detail: 'Dashnelle (suspended), Ashley (terminated), Guito (terminated) — never reference as active.' },
    { rule: 'Lock RBAC',                                    detail: 'Only founder + co_founder + control_admin can unlock locked orders. lock.ts enforces.' },
    { rule: 'Spinytails HACCP lot code',                    detail: 'Format STPC-YYYYMMDD-VV-NN via spinytails_next_lot_code(catch_date, vessel_id). 5 CCPs via CHECK constraints.' },
    { rule: 'Vessel registration is annual',                detail: 'Boat registration uploaded once per gov renewal year, stored on supplier record. Auto-fills future intakes.' },
    { rule: 'Intake step ownership',                        detail: 'Step 1 = fisherman/receiver (vessel + GPS media + raw weight). Step 2/3 = processing operator. Never put grading on Step 1.' },
    { rule: 'Pricing via calculatePrice()',                 detail: 'Always use lib/pricing.ts calculatePrice() or RPC bsc_calculate_price() — never hand-calculate channel margins.' },
    { rule: 'Customer phone unification',                   detail: 'All channels look up customers by phone-E.164 via CustomerPhoneLookup component. One row per phone.' },
    { rule: 'product_costs.cost_type enum',                 detail: 'Only \'opening_balance\' seeded. Inserting \'direct\' / \'landed\' / \'fob\' errors. Check enum before inserts.' },
  ];

  const atlas = {
    generated_at: new Date().toISOString(),
    stats: {
      pages: pages.length,
      api_routes: apis.length,
      tables: tables.length,
      migrations: migrationFiles.length,
      business_rules: business_rules.length,
    },
    pages,
    api_routes: apis,
    tables,
    business_rules,
  };

  await writeFile(OUT, JSON.stringify(atlas, null, 2));
  console.log(`✓ Atlas written: ${relative(ROOT, OUT)}`);
  console.log(`  ${pages.length} pages · ${apis.length} API routes · ${tables.length} tables (across ${migrationFiles.length} migrations) · ${business_rules.length} business rules`);
}

main().catch(err => { console.error(err); process.exit(1); });
