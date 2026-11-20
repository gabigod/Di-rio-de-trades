// Trades do diário. Ficam no aparelho (localStorage); as fotos ficam em photos.js.
import seed from './seed.json';
import seedPhotos from './seedPhotos.json';
import { uid } from './util.js';
import { setQuotaHandler } from './store.js';

const KEY = 'dt:trades';

export const DEFAULT_CONF = ['COT', 'Yield', 'Força', 'DXY', 'Varejo', 'Tendência D1'];
export const DEFAULT_TAGS = ['FOMO', 'Entrou cedo', 'Entrou tarde', 'Moveu o stop', 'Fechou antes', 'Risco maior', 'Sem plano'];
export const MOODS = [
  { k: 'calmo', e: '😌', t: 'Calmo' }, { k: 'confiante', e: '😎', t: 'Confiante' },
  { k: 'ansioso', e: '😰', t: 'Ansioso' }, { k: 'cansado', e: '😴', t: 'Cansado' }, { k: 'irritado', e: '😤', t: 'Irritado' },
];
export const PHOTO_LABELS = ['Entrada', 'Saída', 'Setup', 'Extra'];

let quotaWarned = false;
setQuotaHandler(() => { if (!quotaWarned) { quotaWarned = true; window.dispatchEvent(new CustomEvent('dt:quota')); } });

const subs = new Set();
export const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach(f => { try { f(); } catch { /* */ } });

function save(list = trades) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { window.dispatchEvent(new CustomEvent('dt:quota')); }
}

const seedPhotoOf = t => { const sp = seedPhotos[t._id]; return sp ? [{ id: 'tv:' + sp.tv, label: 'Entrada', w: sp.w, h: sp.h }] : []; };

function load() {
  let list = null;
  try { const raw = localStorage.getItem(KEY); if (raw) list = JSON.parse(raw); } catch { /* */ }
  let changed = false;
  if (!Array.isArray(list)) { list = seed.map(s => ({ ...s })); changed = true; }
  for (const t of list) {
    // v0.2: cada trade passa a ter fotos. Os prints do TradingView do histórico já vêm dentro do app.
    if (!Array.isArray(t.photos)) { t.photos = seedPhotoOf(t); changed = true; }
    if (t.createdAt === undefined) { t.createdAt = Date.now(); changed = true; }
  }
  if (changed) save(list);
  return list;
}

export let trades = load();
function sort() { trades.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)); }
sort();

export const byId = id => trades.find(x => x._id === id);
export function add(t) {
  t._id = uid('t'); t.createdAt = Date.now(); if (!Array.isArray(t.photos)) t.photos = [];
  trades.push(t); sort(); save(); emit(); return t;
}
export function update(id, patch) { const t = byId(id); if (t) Object.assign(t, patch); sort(); save(); emit(); return t; }
export function remove(id) { trades = trades.filter(x => x._id !== id); save(); emit(); }
export function replaceAll(list) {
  // backups antigos não tinham fotos: os prints do histórico voltam a ser ligados pelo id do trade
  trades = list.map(t => ({ ...t, photos: Array.isArray(t.photos) ? t.photos : seedPhotoOf(t), createdAt: t.createdAt || Date.now() })); sort(); save(); emit();
}
export function touch() { save(); emit(); }

export const years = () => [...new Set(trades.map(t => t.date.slice(0, 4)))].sort().reverse();
export const uniq = f => [...new Set(trades.map(t => (t[f] || '').trim()).filter(Boolean))].sort();
export const countBy = f => { const m = {}; trades.forEach(t => { const k = (t[f] || '').trim(); if (k) m[k] = (m[k] || 0) + 1; }); return m; };
/** Todos os ids de foto que algum trade usa (para limpar o que sobrou no aparelho). */
export const usedPhotoIds = () => new Set(trades.flatMap(t => (t.photos || []).map(p => p.id)));
/** Primeiro link do TradingView que ainda não virou foto. */
export const TV_RE = /tradingview\.com\/x\/([A-Za-z0-9]+)/i;
export const pendingLinks = () => trades.filter(t => (t.photos || []).length === 0 && TV_RE.test(t.link || ''));
