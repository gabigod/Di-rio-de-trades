// Cálculos de estatística. Tudo em R, a partir da lista de trades recebida.
import { sum, MON, daysBetween } from './util.js';

const isWin = t => t.result === 'WIN';
const isLoss = t => t.result === 'LOSS';
const R = t => +t.r || 0;

export function stats(list) {
  const n = list.length;
  const wins = list.filter(isWin), losses = list.filter(isLoss);
  const be = n - wins.length - losses.length;
  const closed = wins.length + losses.length;
  const sumR = sum(list, R);
  const gw = sum(wins, R), gl = -sum(losses, R);
  let cum = 0, peak = 0, maxDD = 0;
  const curve = list.map(t => { cum += R(t); peak = Math.max(peak, cum); maxDD = Math.max(maxDD, peak - cum); return { date: t.date, cum, dd: peak - cum }; });
  let bestW = 0, bestL = 0, run = 0, last = null;
  for (const t of list) {
    if (!isWin(t) && !isLoss(t)) continue;
    run = t.result === last ? run + 1 : 1; last = t.result;
    if (isWin(t)) bestW = Math.max(bestW, run); else bestL = Math.max(bestL, run);
  }
  const curStreak = last ? run * (last === 'WIN' ? 1 : -1) : 0;
  const winrate = closed ? wins.length / closed * 100 : 0;
  const avgW = wins.length ? gw / wins.length : 0;
  const avgL = losses.length ? gl / losses.length : 0;
  const pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0);
  const exp = closed ? (gw - gl) / closed : 0;
  return { n, wins: wins.length, losses: losses.length, be, closed, sumR, winrate, avgW, avgL, pf, exp, maxDD, curve, curStreak, bestW, bestL, gw, gl };
}

export function groupBy(list, keyFn) {
  const m = new Map();
  for (const t of list) { const k = keyFn(t) || '—'; (m.get(k) || m.set(k, []).get(k)).push(t); }
  return [...m.entries()].map(([k, v]) => ({ key: k, ...stats(v) }));
}

/** Grade ano × mês com a soma de R de cada mês. */
export function monthlyGrid(list) {
  const cells = {}, cnt = {}, tot = {};
  for (const t of list) {
    const y = t.date.slice(0, 4), m = +t.date.slice(5, 7) - 1, k = `${y}-${m}`;
    cells[k] = (cells[k] || 0) + R(t); cnt[k] = (cnt[k] || 0) + 1; tot[y] = (tot[y] || 0) + R(t);
  }
  return { years: Object.keys(tot).sort().reverse(), cells, cnt, tot };
}

/** Expectativa e winrate nas últimas n operações, a cada trade. */
export function rolling(list, n = 20) {
  const out = [];
  for (let i = n - 1; i < list.length; i++) {
    const w = list.slice(i - n + 1, i + 1);
    const wins = w.filter(isWin).length, losses = w.filter(isLoss).length;
    out.push({ date: list[i].date, exp: sum(w, R) / n, wr: wins + losses ? wins / (wins + losses) * 100 : 0 });
  }
  return out;
}

/** R acumulado por grupo, mês a mês (os `top` grupos com mais trades). */
export function cumByGroup(list, keyFn, top = 5) {
  if (!list.length) return { keys: [], labels: [], series: [] };
  const groups = new Map();
  for (const t of list) { const k = keyFn(t) || '—'; (groups.get(k) || groups.set(k, []).get(k)).push(t); }
  const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, top);
  const first = list[0].date, last = list[list.length - 1].date;
  let y = +first.slice(0, 4), m = +first.slice(5, 7) - 1;
  const ly = +last.slice(0, 4), lm = +last.slice(5, 7) - 1;
  const keys = [];
  while (y < ly || (y === ly && m <= lm)) { keys.push(`${y}-${String(m + 1).padStart(2, '0')}`); m++; if (m > 11) { m = 0; y++; } }
  const labels = keys.map(k => MON[+k.slice(5) - 1] + (keys.length > 12 ? '/' + k.slice(2, 4) : ''));
  const series = ranked.map(([key, ts]) => {
    const byM = {}; ts.forEach(t => { const k = t.date.slice(0, 7); byM[k] = (byM[k] || 0) + R(t); });
    let c = 0; const data = keys.map(k => { c += (byM[k] || 0); return +c.toFixed(2); });
    return { key, n: ts.length, total: c, data };
  });
  return { keys, labels, series };
}

/** Quantas vezes cada tamanho de sequência de perdas / ganhos aconteceu. */
export function streakDist(list) {
  const loss = {}, win = {};
  let run = 0, last = null;
  const flush = () => { if (last === 'LOSS') loss[run] = (loss[run] || 0) + 1; else if (last === 'WIN') win[run] = (win[run] || 0) + 1; };
  for (const t of list) {
    if (!isWin(t) && !isLoss(t)) continue;
    if (t.result === last) run++; else { flush(); run = 1; last = t.result; }
  }
  flush();
  return { loss, win };
}
/** Média de trades até aparecer uma sequência de k perdas seguidas, com chance q de perder cada trade. */
export const expectedWait = (q, k) => (q > 0 && q < 1 ? (1 - Math.pow(q, k)) / ((1 - q) * Math.pow(q, k)) : Infinity);

/** Compara trades com e sem cada marca (confluência). Só entram os trades com ao menos uma marca. */
export function flagStats(list, field, names) {
  const analyzed = list.filter(t => Array.isArray(t[field]) && t[field].length);
  const base = stats(analyzed);
  const rows = names.map(name => {
    const withIt = analyzed.filter(t => t[field].includes(name));
    const without = analyzed.filter(t => !t[field].includes(name));
    return { name, w: stats(withIt), wo: stats(without), n: withIt.length };
  }).filter(x => x.n > 0);
  return { analyzed: analyzed.length, base, rows };
}

/** Resultado por número de confluências marcadas. */
export function byConfCount(list) {
  const analyzed = list.filter(t => Array.isArray(t.conf) && t.conf.length);
  return groupBy(analyzed, t => String(t.conf.length)).sort((a, b) => +a.key - +b.key);
}

export function durations(list) {
  const ok = list.filter(t => t.openDate && t.date >= t.openDate).map(t => ({ ...t, days: daysBetween(t.openDate, t.date) }));
  const avg = a => a.length ? sum(a, t => t.days) / a.length : 0;
  const w = ok.filter(isWin), l = ok.filter(isLoss);
  return { n: ok.length, avg: avg(ok), avgW: avg(w), avgL: avg(l), nW: w.length, nL: l.length };
}

/** R máximo a favor: quanto os vencedores deixaram na mesa e quantos perdedores já estiveram no lucro. */
export function mfeStats(list) {
  const ok = list.filter(t => t.mfe !== undefined && t.mfe !== null && t.mfe !== '' && !isNaN(+t.mfe));
  const w = ok.filter(isWin), l = ok.filter(isLoss);
  return {
    n: ok.length,
    left: w.length ? sum(w, t => Math.max(0, +t.mfe - R(t))) / w.length : 0, nW: w.length,
    loserAvg: l.length ? sum(l, t => +t.mfe) / l.length : 0, nL: l.length,
    loserWent1: l.filter(t => +t.mfe >= 1).length,
  };
}

// ---------- R a partir dos preços ----------
const num = v => (v === '' || v === null || v === undefined || isNaN(+v) ? null : +v);
const sideOf = (dir, entry, stop) => dir === 'BUY' || dir === 'SELL' ? dir : (entry !== null && stop !== null ? (stop < entry ? 'BUY' : 'SELL') : null);
export function calcR({ dir, entry, stop, exit }) {
  entry = num(entry); stop = num(stop); exit = num(exit);
  if (entry === null || stop === null || exit === null || entry === stop) return null;
  const side = sideOf(dir, entry, stop); if (!side) return null;
  const risk = side === 'BUY' ? entry - stop : stop - entry;
  if (risk <= 0) return null;
  return (side === 'BUY' ? exit - entry : entry - exit) / risk;
}
export function plannedRR({ dir, entry, stop, target }) {
  return calcR({ dir, entry, stop, exit: target });
}
