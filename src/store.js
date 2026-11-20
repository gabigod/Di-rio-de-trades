// Coleções pequenas guardadas no localStorage, com aviso de mudança.
import { uid } from './util.js';

let onQuota = () => {};
export const setQuotaHandler = f => { onQuota = f; };

export function collection(key, prefix = 'x') {
  let items = [];
  try { const raw = localStorage.getItem(key); if (raw) items = JSON.parse(raw); } catch { /* */ }
  if (!Array.isArray(items)) items = [];
  const subs = new Set();
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(items)); } catch (e) { onQuota(e); } };
  const emit = () => subs.forEach(f => { try { f(); } catch { /* */ } });
  return {
    get all() { return items; },
    get(id) { return items.find(x => x.id === id); },
    add(x) { x.id = x.id || uid(prefix); x.createdAt = x.createdAt || Date.now(); items.push(x); persist(); emit(); return x; },
    update(id, patch) { const x = items.find(i => i.id === id); if (x) { Object.assign(x, patch); persist(); emit(); } return x; },
    remove(id) { items = items.filter(i => i.id !== id); persist(); emit(); },
    removeWhere(fn) { items = items.filter(i => !fn(i)); persist(); emit(); },
    replace(list) { items = Array.isArray(list) ? list : []; persist(); emit(); },
    save() { persist(); emit(); },
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

// ---------- ajustes simples (chave → valor) ----------
const SKEY = 'dt:settings';
let settings = {};
try { settings = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch { /* */ }
export const getSetting = (k, def) => (settings[k] === undefined ? def : settings[k]);
export const setSetting = (k, v) => { settings[k] = v; try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { onQuota(e); } };
export const allSettings = () => settings;
export const replaceSettings = s => { settings = s && typeof s === 'object' ? s : {}; try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch { /* */ } };
