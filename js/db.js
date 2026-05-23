import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY, LS_KEYS } from './config.js';
import { uuid } from './utils.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── localStorage helpers ────────────────────────────────────────
export const ls = {
  get: (key, def = null) => { try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; } },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  del: (key) => localStorage.removeItem(key)
};

// ── Sync queue (writes offline → Supabase when back online) ─────
function enqueue(op) {
  const q = ls.get(LS_KEYS.SYNC_QUEUE, []);
  q.push(op);
  ls.set(LS_KEYS.SYNC_QUEUE, q);
}

export async function flushQueue() {
  const q = ls.get(LS_KEYS.SYNC_QUEUE, []);
  if (!q.length) return;
  const remaining = [];
  for (const op of q) {
    try {
      if (op.type === 'upsert') await supabase.from(op.table).upsert(op.data);
      else if (op.type === 'update') await supabase.from(op.table).update(op.data).eq('id', op.id);
    } catch { remaining.push(op); }
  }
  ls.set(LS_KEYS.SYNC_QUEUE, remaining);
}

async function syncUp(table, data, type = 'upsert') {
  if (!navigator.onLine) { enqueue({ type, table, data, id: data.id }); return; }
  try {
    if (type === 'upsert') await supabase.from(table).upsert(data);
    else await supabase.from(table).update(data).eq('id', data.id);
  } catch { enqueue({ type, table, data, id: data.id }); }
}

// ── Products ────────────────────────────────────────────────────
export async function loadProducts() {
  try {
    const { data, error } = await supabase.from('products').select('*').eq('active', true).order('category').order('name');
    if (error) throw error;
    ls.set(LS_KEYS.PRODUCTS, data);
    return data;
  } catch {
    return ls.get(LS_KEYS.PRODUCTS, []);
  }
}

export async function updateProductStock(productId, newStock) {
  const products = ls.get(LS_KEYS.PRODUCTS, []);
  const idx = products.findIndex(p => p.id === productId);
  if (idx !== -1) { products[idx].stock = newStock; ls.set(LS_KEYS.PRODUCTS, products); }
  await syncUp('products', { id: productId, stock: newStock, updated_at: new Date().toISOString() }, 'update');
}

export async function saveProduct(product) {
  const products = ls.get(LS_KEYS.PRODUCTS, []);
  const idx = products.findIndex(p => p.id === product.id);
  if (idx !== -1) products[idx] = product; else products.push(product);
  ls.set(LS_KEYS.PRODUCTS, products);
  await syncUp('products', product);
}

// ── Cash Session ────────────────────────────────────────────────
export async function openSession(sessionData) {
  const session = { ...sessionData, id: uuid(), status: 'open', opened_at: new Date().toISOString() };
  ls.set(LS_KEYS.SESSION, session);
  ls.set(LS_KEYS.SALES, []);
  ls.set(LS_KEYS.SANGRIAS, []);
  await syncUp('cash_sessions', session);
  return session;
}

export async function closeSession(session, closingData) {
  const closed = { ...session, ...closingData, status: 'closed', closed_at: new Date().toISOString() };
  // Move to history
  const history = ls.get(LS_KEYS.HISTORY, []);
  history.push({
    session: closed,
    sales: ls.get(LS_KEYS.SALES, []),
    sangrias: ls.get(LS_KEYS.SANGRIAS, [])
  });
  ls.set(LS_KEYS.HISTORY, history);
  ls.del(LS_KEYS.SESSION);
  ls.del(LS_KEYS.SALES);
  ls.del(LS_KEYS.SANGRIAS);
  await syncUp('cash_sessions', closed, 'update');
  return closed;
}

export function getSession() { return ls.get(LS_KEYS.SESSION, null); }

// ── Sales ───────────────────────────────────────────────────────
export async function saveSale(sale) {
  const sales = ls.get(LS_KEYS.SALES, []);
  sales.push(sale);
  ls.set(LS_KEYS.SALES, sales);
  const { splits, items, ...saleRow } = sale;
  await syncUp('sales', saleRow);
  if (items?.length) {
    for (const item of items) await syncUp('sale_items', item);
  }
  if (splits?.length) {
    for (const sp of splits) await syncUp('payment_splits', sp);
  }
  return sale;
}

export async function voidSale(saleId) {
  const sales = ls.get(LS_KEYS.SALES, []);
  const idx = sales.findIndex(s => s.id === saleId);
  if (idx === -1) return null;
  sales[idx].is_voided = true;
  sales[idx].voided_at = new Date().toISOString();
  ls.set(LS_KEYS.SALES, sales);
  await syncUp('sales', { id: saleId, is_voided: true, voided_at: sales[idx].voided_at }, 'update');
  return sales[idx];
}

export function getSales() { return ls.get(LS_KEYS.SALES, []); }

// ── Sangrias ────────────────────────────────────────────────────
export async function saveSangria(sangria) {
  const sangrias = ls.get(LS_KEYS.SANGRIAS, []);
  sangrias.push(sangria);
  ls.set(LS_KEYS.SANGRIAS, sangrias);
  await syncUp('sangrias', sangria);
  return sangria;
}

export function getSangrias() { return ls.get(LS_KEYS.SANGRIAS, []); }

// ── Reservations ────────────────────────────────────────────────
export async function saveReservation(reservation) {
  const reservations = ls.get(LS_KEYS.RESERVATIONS, []);
  const idx = reservations.findIndex(r => r.id === reservation.id);
  if (idx !== -1) reservations[idx] = reservation; else reservations.push(reservation);
  ls.set(LS_KEYS.RESERVATIONS, reservations);
  await syncUp('reservations', reservation);
  return reservation;
}

export async function updateReservation(id, data) {
  const reservations = ls.get(LS_KEYS.RESERVATIONS, []);
  const idx = reservations.findIndex(r => r.id === id);
  if (idx !== -1) { reservations[idx] = { ...reservations[idx], ...data, updated_at: new Date().toISOString() }; }
  ls.set(LS_KEYS.RESERVATIONS, reservations);
  await syncUp('reservations', { id, ...data, updated_at: new Date().toISOString() }, 'update');
  return reservations[idx];
}

export function getReservations() { return ls.get(LS_KEYS.RESERVATIONS, []); }

// Load active reservations from Supabase on init
export async function loadReservations() {
  try {
    const { data } = await supabase.from('reservations').select('*').eq('status', 'active').order('created_at');
    if (data) ls.set(LS_KEYS.RESERVATIONS, data);
    return data || ls.get(LS_KEYS.RESERVATIONS, []);
  } catch {
    return ls.get(LS_KEYS.RESERVATIONS, []);
  }
}
