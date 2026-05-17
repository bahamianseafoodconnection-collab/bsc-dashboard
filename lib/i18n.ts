// Tiny three-language translation layer for BSC staff UI.
//
//   en — English        (default for everyone unless they opt in)
//   cr — Haitian Kreyòl (Nicholson, any Haitian staff)
//   es — Español        (any Spanish-speaking staff)
//
// Usage:
//   import { t, type Lang } from '@/lib/i18n';
//   const label = t('nav.intake', lang);   // 'Intake' / 'Resepsyon' / 'Recepción'
//
// Translations come from a hand-curated map (not a full ICU framework) on
// purpose: BSC's staff UI has a small, stable vocabulary, and lazy
// hand-translations beat the maintenance cost of a heavy i18n library.

export type Lang = 'en' | 'cr' | 'es';

export const LANGUAGES: Array<{ code: Lang; label: string; native: string; flag: string }> = [
  { code: 'en', label: 'English',         native: 'English',          flag: '🇧🇸' },
  { code: 'cr', label: 'Haitian Creole',  native: 'Kreyòl Ayisyen',   flag: '🇭🇹' },
  { code: 'es', label: 'Spanish',         native: 'Español',          flag: '🇪🇸' },
];

const STRINGS: Record<string, Record<Lang, string>> = {
  // ─── Bottom nav (AppShell) ─────────────────────────────────
  'nav.control':    { en: 'Control',    cr: 'Kontwòl',    es: 'Control' },
  'nav.pos':        { en: 'POS',        cr: 'Kès',        es: 'Caja' },
  'nav.intake':     { en: 'Intake',     cr: 'Resepsyon',  es: 'Recepción' },
  'nav.inventory':  { en: 'Inventory',  cr: 'Envantè',    es: 'Inventario' },
  'nav.yield':      { en: 'Yield',      cr: 'Rannman',    es: 'Rendimiento' },
  'nav.market':     { en: 'Market',     cr: 'Mache',      es: 'Mercado' },
  'nav.payBills':   { en: 'Pay Bills',  cr: 'Peye Bil',   es: 'Pagar Facturas' },
  'nav.vehicles':   { en: 'Vehicles',   cr: 'Machin',     es: 'Vehículos' },
  'nav.orders':     { en: 'Orders',     cr: 'Komand',     es: 'Pedidos' },
  'nav.dashboard':  { en: 'Dashboard',  cr: 'Tablodbò',   es: 'Panel' },
  'nav.supplier':   { en: 'Supplier',   cr: 'Founisè',    es: 'Proveedor' },

  // ─── Page titles ───────────────────────────────────────────
  'page.intake.title':      { en: 'Scan Invoice / Receipt', cr: 'Eskane Resi a',          es: 'Escanear Recibo' },
  'page.intake.subtitle':   { en: 'Snap the paper, pick where it belongs.', cr: 'Pran foto papye a, chwazi kote li ale.', es: 'Toma la foto, elige dónde va.' },
  'page.prep.title':        { en: 'Prep List',              cr: 'Lis Preparasyon',         es: 'Lista de Preparación' },
  'page.changePwd.title':   { en: 'Set your password',      cr: 'Chwazi modpas ou',        es: 'Establece tu contraseña' },
  'page.changePwd.kicker':  { en: 'BSC · First Sign-In',    cr: 'BSC · Premye Koneksyon',  es: 'BSC · Primer Inicio de Sesión' },

  // ─── Forms / buttons ───────────────────────────────────────
  'form.save':         { en: 'Save',          cr: 'Anrejistre',  es: 'Guardar' },
  'form.cancel':       { en: 'Cancel',        cr: 'Anile',       es: 'Cancelar' },
  'form.delete':       { en: 'Delete',        cr: 'Efase',       es: 'Eliminar' },
  'form.required':     { en: 'Required',      cr: 'Obligatwa',   es: 'Requerido' },
  'form.optional':     { en: 'Optional',      cr: 'Si w vle',    es: 'Opcional' },
  'form.password':     { en: 'New password',  cr: 'Nouvo modpas',es: 'Nueva contraseña' },
  'form.confirmPwd':   { en: 'Confirm password', cr: 'Konfime modpas', es: 'Confirmar contraseña' },
  'form.language':     { en: 'Language',      cr: 'Lang',        es: 'Idioma' },

  // ─── Intake page ───────────────────────────────────────────
  'intake.step1':        { en: '1. Capture the invoice',     cr: '1. Pran foto resi a',         es: '1. Toma la foto del recibo' },
  'intake.step2':        { en: '2. Where does this belong?', cr: '2. Ki kote sa ale?',          es: '2. ¿Dónde va esto?' },
  'intake.step3.cost':   { en: '3. Product cost details',    cr: '3. Detay pri pwodwi a',       es: '3. Detalles del costo del producto' },
  'intake.step3.exp':    { en: '3. Expense details',         cr: '3. Detay depans la',          es: '3. Detalles del gasto' },
  'intake.kind.cost':    { en: 'Product Cost',               cr: 'Pri Pwodwi',                  es: 'Costo del Producto' },
  'intake.kind.exp':     { en: 'Expense',                    cr: 'Depans',                      es: 'Gasto' },
  'intake.cost.hint':    { en: 'Inventory purchase from a supplier', cr: 'Acha envantè nan men yon founisè', es: 'Compra de inventario a un proveedor' },
  'intake.exp.hint':     { en: 'Bill, utility, rent, fuel, etc.',    cr: 'Bil, sèvis piblik, lwaye, gaz, elatriye.', es: 'Factura, servicio público, alquiler, combustible, etc.' },
  'intake.upload.camera':{ en: 'Camera',                     cr: 'Kamera',                       es: 'Cámara' },
  'intake.upload.gallery':{ en: 'Gallery',                   cr: 'Galri',                        es: 'Galería' },
  'intake.upload.files': { en: 'Files',                      cr: 'Fichye',                       es: 'Archivos' },
  'intake.upload.pick':  { en: 'Pick a source below',        cr: 'Chwazi yon sous anba',         es: 'Elige una fuente abajo' },

  // ─── Generic ──────────────────────────────────────────────
  'common.signOut':    { en: 'Sign Out',     cr: 'Dekonekte',   es: 'Cerrar Sesión' },
  'common.back':       { en: 'Back',         cr: 'Tounen',      es: 'Atrás' },
  'common.loading':    { en: 'Loading…',     cr: 'Ap chaje…',   es: 'Cargando…' },
  'common.saved':      { en: 'Saved',        cr: 'Anrejistre',  es: 'Guardado' },
};

export function t(key: string, lang: Lang = 'en'): string {
  const entry = STRINGS[key];
  if (!entry) return key;          // missing key → show key so it's caught in testing
  return entry[lang] ?? entry.en;  // missing translation → fall back to English
}
