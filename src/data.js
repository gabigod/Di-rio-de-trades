// Dados do diário: ficam no aparelho (localStorage), com backup por exportar/importar.
import seed from './seed.json';

const KEY = 'dt:trades';
const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* */ }
  // primeira vez: importa o histórico vindo da planilha
  const t = seed.map(s => ({ ...s }));
  save(t);
  return t;
}
export function save(trades) { try { localStorage.setItem(KEY, JSON.stringify(trades)); } catch { /* */ } }

export let trades = load();
export function add(t) { t._id = uid(); t.createdAt = Date.now(); trades.push(t); sort(); save(trades); }
export function update(id, patch) { const t = trades.find(x => x._id === id); if (t) Object.assign(t, patch); sort(); save(trades); }
export function remove(id) { trades = trades.filter(x => x._id !== id); save(trades); }
export function replaceAll(list) { trades = list; sort(); save(trades); }
function sort() { trades.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)); }
sort();

export const years = () => [...new Set(trades.map(t => t.date.slice(0, 4)))].sort().reverse();
export const uniq = f => [...new Set(trades.map(t => (t[f] || '').trim()).filter(Boolean))].sort();
export const fmtR = r => (r > 0 ? '+' : '') + (+r).toFixed(2).replace(/\.?0+$/, '') + 'R';
export const fmtDate = d => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y.slice(2)}`; };
export const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MON = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const dow = d => new Date(d + 'T12:00:00Z').getUTCDay();

// ---------- estatísticas ----------
export function stats(list) {
  const n = list.length;
  const wins = list.filter(t => t.result === 'WIN');
  const losses = list.filter(t => t.result === 'LOSS');
  const be = n - wins.length - losses.length;
  const closed = wins.length + losses.length;
  const sumR = list.reduce((a, t) => a + (+t.r || 0), 0);
  const gw = wins.reduce((a, t) => a + (+t.r || 0), 0);
  const gl = -losses.reduce((a, t) => a + (+t.r || 0), 0);
  // curva e drawdown
  let cum = 0, peak = 0, maxDD = 0, ddStart = null;
  const curve = list.map(t => { cum += (+t.r || 0); peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); return { date: t.date, cum, dd: peak - cum }; });
  // sequências
  let curStreak = 0, bestW = 0, bestL = 0, run = 0, last = null;
  for (const t of list) {
    if (t.result !== 'WIN' && t.result !== 'LOSS') continue;
    if (t.result === last) run++; else run = 1;
    last = t.result;
    if (t.result === 'WIN') bestW = Math.max(bestW, run); else bestL = Math.max(bestL, run);
  }
  if (last) { curStreak = run * (last === 'WIN' ? 1 : -1); }
  const winrate = closed ? wins.length / closed * 100 : 0;
  const avgW = wins.length ? gw / wins.length : 0;
  const avgL = losses.length ? gl / losses.length : 0;
  const pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0);
  const exp = closed ? (gw - gl) / closed : 0;
  return { n, wins: wins.length, losses: losses.length, be, closed, sumR, winrate, avgW, avgL, pf, exp, maxDD, curve, curStreak, bestW, bestL };
}
export function groupBy(list, keyFn) {
  const m = new Map();
  for (const t of list) { const k = keyFn(t) || '—'; (m.get(k) || m.set(k, []).get(k)).push(t); }
  return [...m.entries()].map(([k, v]) => ({ key: k, ...stats(v) }));
}
