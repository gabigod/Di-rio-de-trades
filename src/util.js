// Utilidades pequenas: DOM, formatação pt-BR, datas e cores.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (+f(x) || 0), 0);
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- números (pt-BR: vírgula decimal, ponto de milhar) ----------
const NF = {};
const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const num = (v, d = 2) => nf(d).format(+v || 0);
/** Arredonda em centésimos inteiros e depois para `d` casas (meio para cima), sem o erro de 21,15 → 21,1 do toFixed. */
const trim = (v, d) => {
  const a = Math.abs(+v || 0); let s;
  if (d < 2) { const c = Math.round(a * 100), k = 10 ** (2 - d); s = (Math.round(c / k) / 10 ** d).toFixed(d); } else s = a.toFixed(d);
  if (s.includes('.')) s = s.replace(/\.?0+$/, '');
  return s.replace('.', ',');
};
const SG = { '+': '+', '-': '−' };
/** Resultado em R: +2R, −1R, +0,5R */
export const fmtR = (r, d = 2) => { r = +r || 0; const t = trim(r, d); return (r > 0 && t !== '0' ? SG['+'] : r < 0 && t !== '0' ? SG['-'] : '') + t + 'R'; };
/** Dinheiro em dólar: $1.234 · $523,40 · +$80 */
export const money = (v, { sign = false } = {}) => {
  v = +v || 0; const a = Math.abs(v);
  const d = a >= 1000 || Number.isInteger(+a.toFixed(2)) ? 0 : 2;
  const s = '$' + nf(d).format(a);
  return (v < 0 ? SG['-'] : sign && v > 0 ? SG['+'] : '') + s;
};
export const pct = (v, d = 1, sign = false) => { v = +v || 0; const t = trim(v, d); return (sign && v > 0 && t !== '0' ? SG['+'] : v < 0 && t !== '0' ? SG['-'] : '') + t + '%'; };
export const rCls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : 'mut';

// ---------- datas (sempre texto AAAA-MM-DD) ----------
export const MON = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const MONF = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const p2 = n => String(n).padStart(2, '0');
export const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y.slice(2)}`; };
export const fmtDM = d => d ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1].toLowerCase()}` : '';
export const fmtDMY = d => d ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1].toLowerCase()} ${d.slice(0, 4)}` : '';
export const dow = d => new Date(d + 'T12:00:00Z').getUTCDay();
export const ms = d => Date.parse(d + 'T12:00:00Z');
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / 864e5);
export const addDays = (d, n) => new Date(ms(d) + n * 864e5).toISOString().slice(0, 10);

// ---------- cores ----------
export const C = { up: '#00d492', dn: '#ff4d67', warn: '#fab219', acc: '#4f8cff', acc2: '#9a6bff', gold: '#ffb84d', mut: '#8e8e99', neutral: '#3a3a42' };
/** Ordem categórica validada para fundo escuro (CVD adjacente ≥ 8,4 · visão normal ≥ 19). Verde e vermelho ficam reservados a ganho/perda. */
export const SERIES = ['#3987e5', '#d95926', '#9085e9', '#d55181', '#c98500', '#199e70'];
export const OTHER = '#6b6b76';
export const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
