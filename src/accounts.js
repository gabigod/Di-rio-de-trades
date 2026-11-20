// Contas de prop firm: regras, saldo estimado pelos trades, saques, gastos e simulador.
import { collection } from './store.js';
import * as D from './data.js';
import { sum, clamp, todayISO, daysBetween, addDays, MON, pct, money } from './util.js';

export const accounts = collection('dt:accounts', 'a');
export const payouts = collection('dt:payouts', 'y');
export const expenses = collection('dt:expenses', 'e');
export const adjusts = collection('dt:adjusts', 'j');

export const PHASES = { fase1: 'Fase 1', fase2: 'Fase 2', funded: 'Funded', instant: 'Instant' };
export const STATUS = { ativa: 'Ativa', aprovada: 'Aprovada', reprovada: 'Reprovada', encerrada: 'Encerrada' };
export const DD_TYPES = { estatico: 'Estático', trailing_trava: 'Trailing, trava no saldo inicial', trailing: 'Trailing' };
export const EXPENSE_KINDS = ['Avaliação', 'Reset', 'Ativação', 'Assinatura', 'Plataforma e dados', 'Outro'];
export const FIRMS = ['Blue Guardian', 'Blueberry Funded', 'Moneta Funded', 'Audacity Capital', 'Finotive Funding', 'FundedElite'];
/** Modelos genéricos só para poupar digitação. Confira sempre as regras no site da firma. */
export const TEMPLATES = [
  { k: 'f2a', t: 'Desafio de 2 fases · fase 1', d: { phase: 'fase1', target: 8, maxDaily: 5, maxDD: 10, ddType: 'estatico', minDays: 4, split: 80 } },
  { k: 'f2b', t: 'Desafio de 2 fases · fase 2', d: { phase: 'fase2', target: 5, maxDaily: 5, maxDD: 10, ddType: 'estatico', minDays: 4, split: 80 } },
  { k: 'f1', t: 'Desafio de 1 fase', d: { phase: 'fase1', target: 10, maxDaily: 4, maxDD: 8, ddType: 'estatico', minDays: 3, split: 80 } },
  { k: 'fd', t: 'Conta funded', d: { phase: 'funded', target: 0, maxDaily: 5, maxDD: 10, ddType: 'estatico', minDays: 0, split: 80 } },
];

// ---------- resultado de um trade numa conta ----------
export const allocOf = (t, accId) => (t.alloc || []).find(a => a.acc === accId);
const has = v => v !== undefined && v !== null && v !== '' && !isNaN(+v);
/** US$ que o trade rendeu na conta: valor real informado, ou R × risco% × tamanho da conta. */
export function tradePnl(t, acc) {
  const a = allocOf(t, acc.id); if (!a) return null;
  if (has(a.pnl)) return +a.pnl;
  const risk = has(a.risk) ? +a.risk : (+acc.riskPct || 0);
  return (+t.r || 0) * risk / 100 * (+acc.size || 0);
}

function floorFor(acc, size, peak) {
  const dd = (+acc.maxDD || 0) / 100 * size;
  if (!dd) return null;
  if (acc.ddType === 'trailing') return peak - dd;
  if (acc.ddType === 'trailing_trava') return Math.min(size, peak - dd);
  return size - dd;
}

/** Tudo que o app sabe de uma conta, calculado a partir dos trades, ajustes e saques. */
export function accountState(acc, trades = D.trades, today = todayISO()) {
  const size = +acc.size || 0;
  const ts = trades.filter(t => allocOf(t, acc.id));
  const adj = adjusts.all.filter(a => a.acc === acc.id);
  const pay = payouts.all.filter(p => p.acc === acc.id);
  const ev = [
    ...ts.map(t => ({ k: 't', date: t.date, amt: tradePnl(t, acc), t, o: 0, c: t.createdAt || 0 })),
    ...adj.map(a => ({ k: 'a', date: a.date, amt: +a.amount || 0, a, o: 1, c: a.createdAt || 0 })),
    ...pay.map(p => ({ k: 'p', date: p.date, amt: -(+p.amount || 0), p, o: 2, c: p.createdAt || 0 })),
  ].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.o - y.o || x.c - y.c));

  let bal = size, peak = size, floor = floorFor(acc, size, peak), breach = null;
  const start = acc.start || (ev[0] && ev[0].date) || today;
  const series = [{ date: start, bal, floor }];
  const byDay = {};
  ev.forEach((e, i) => {
    bal += e.amt;
    if (e.k !== 'p') byDay[e.date] = (byDay[e.date] || 0) + e.amt;
    if (!breach && floor !== null && bal <= floor + 1e-9) breach = { date: e.date, i };
    peak = Math.max(peak, bal); floor = floorFor(acc, size, peak);
    series.push({ date: e.date, bal, floor, e });
  });

  const perf = sum(ev.filter(e => e.k !== 'p'), e => e.amt);
  const withdrawn = sum(pay, p => p.amount);
  const balance = size + perf - withdrawn;
  const target = (+acc.target || 0) / 100 * size;
  const ddAmt = (+acc.maxDD || 0) / 100 * size;
  const margin = floor !== null ? balance - floor : null;
  const dailyLimit = (+acc.maxDaily || 0) / 100 * size;
  const dayPnl = byDay[today] || 0;
  let worstDay = null; Object.entries(byDay).forEach(([d, v]) => { if (!worstDay || v < worstDay.v) worstDay = { d, v }; });
  const dayBreach = dailyLimit && worstDay && worstDay.v <= -dailyLimit + 1e-9 ? worstDay : null;
  const days = Object.keys(byDay);
  const tradeDays = new Set(ts.map(t => t.date)).size;
  const bestDay = days.length ? Math.max(...days.map(d => byDay[d])) : 0;
  const availProfit = Math.max(0, balance - size);
  const lastPay = pay.length ? pay.map(p => p.date).sort().pop() : null;
  const eligibleDate = lastPay && +acc.payoutEvery ? addDays(lastPay, +acc.payoutEvery)
    : (!lastPay && +acc.firstPayoutDays ? addDays(start, +acc.firstPayoutDays) : null);
  return {
    acc, size, balance, perf, profitPct: size ? perf / size * 100 : 0, withdrawn, peak, floor, margin,
    marginPct: margin !== null && size ? margin / size * 100 : null,
    ddUsed: ddAmt && margin !== null ? clamp(1 - margin / ddAmt, 0, 1) : 0, ddAmt,
    dailyLimit, dayPnl, dayUsed: dailyLimit ? clamp(-dayPnl / dailyLimit, 0, 1) : 0, worstDay, dayBreach, breach,
    target, progress: target ? perf / target : 0, tradeDays, bestDay,
    bestPct: perf > 0 ? bestDay / perf * 100 : null,
    availProfit, youGet: availProfit * ((+acc.split || 0) / 100), lastPay, eligibleDate,
    daysToPayout: eligibleDate ? daysBetween(today, eligibleDate) : null,
    series, events: ev, trades: ts, nTrades: ts.length, rs: ts.map(t => +t.r || 0),
  };
}

/** Lista de regras com estado: ok (verde), warn (âmbar), bad (vermelho) ou idle (em andamento). */
export function rulesOf(st) {
  const a = st.acc, out = [];
  if (+a.target) {
    const done = st.progress >= 1;
    out.push({ key: 'meta', icon: 'target', label: 'Meta de lucro', value: `${pct(st.profitPct, 1)} de ${pct(+a.target, 1)}`, ratio: clamp(st.progress, 0, 1), state: done ? 'ok' : 'idle',
      note: done ? 'Meta batida' : `Faltam ${money(st.target - st.perf)}` });
  }
  if (+a.maxDD) {
    const state = st.breach ? 'bad' : st.ddUsed >= .75 ? 'warn' : 'ok';
    out.push({ key: 'dd', icon: 'shield', label: 'Perda máxima', value: st.margin !== null ? `${money(st.margin)} de margem` : '—', ratio: st.ddUsed, state, bar: 'risk',
      note: st.breach ? `Limite violado em ${st.breach.date.slice(8)}/${st.breach.date.slice(5, 7)}` : `${pct(st.marginPct, 1)} do saldo inicial até o limite` });
  }
  if (+a.maxDaily) {
    const state = st.dayBreach ? 'bad' : st.dayUsed >= .75 ? 'warn' : 'ok';
    out.push({ key: 'day', icon: 'clock', label: 'Perda diária', value: st.dayPnl < 0 ? `${money(st.dayPnl)} hoje` : 'sem perda hoje', ratio: st.dayUsed, state, bar: 'risk',
      note: st.dayBreach ? `Limite estourado em ${st.dayBreach.d.slice(8)}/${st.dayBreach.d.slice(5, 7)}` : `Limite de ${money(st.dailyLimit)} por dia` });
  }
  if (+a.minDays) {
    const ok = st.tradeDays >= +a.minDays;
    out.push({ key: 'days', icon: 'calendar', label: 'Dias de operação', value: `${st.tradeDays} de ${a.minDays}`, ratio: clamp(st.tradeDays / a.minDays, 0, 1), state: ok ? 'ok' : 'idle',
      note: ok ? 'Mínimo cumprido' : `Faltam ${a.minDays - st.tradeDays} dia(s) com trade` });
  }
  if (+a.consistency) {
    const known = st.bestPct !== null;
    const bad = known && st.bestPct > +a.consistency;
    out.push({ key: 'cons', icon: 'layers', label: 'Consistência', value: known ? `melhor dia ${pct(st.bestPct, 0)}` : 'sem lucro ainda', ratio: known ? clamp(st.bestPct / a.consistency, 0, 1) : 0, state: !known ? 'idle' : bad ? 'bad' : st.bestPct > a.consistency * .85 ? 'warn' : 'ok', bar: 'risk',
      note: `Limite: nenhum dia acima de ${pct(+a.consistency, 0)} do lucro` });
  }
  if (a.phase === 'funded' || a.phase === 'instant') {
    const ready = st.availProfit > 0 && (st.daysToPayout === null || st.daysToPayout <= 0);
    out.push({ key: 'pay', icon: 'coin', label: 'Saque', value: st.availProfit > 0 ? `${money(st.availProfit)} de lucro` : 'sem lucro a sacar', ratio: 0, state: ready ? 'ok' : 'idle', bar: 'none',
      note: st.availProfit > 0 ? `Você recebe ${money(st.youGet)}${st.daysToPayout > 0 ? ` · libera em ${st.daysToPayout} dia(s)` : ''}` : (st.daysToPayout > 0 ? `Libera em ${st.daysToPayout} dia(s)` : 'Nada disponível ainda') });
  }
  return out;
}

// ---------- visão geral ----------
const recOf = p => (has(p.received) ? +p.received : (+p.amount || 0) * (((accounts.get(p.acc) || {}).split ?? 100) / 100));
export const payoutReceived = recOf;

export function portfolio(trades = D.trades, today = todayISO()) {
  const accs = accounts.all;
  const states = accs.map(a => accountState(a, trades, today));
  const paid = payouts.all.filter(p => p.status !== 'pendente');
  const pending = payouts.all.filter(p => p.status === 'pendente');
  const invested = sum(expenses.all, e => e.amount);
  const received = sum(paid, recOf);
  const net = received - invested;
  const challenge = accs.filter(a => a.phase === 'fase1' || a.phase === 'fase2');
  const passed = challenge.filter(a => a.status === 'aprovada').length;
  const failed = challenge.filter(a => a.status === 'reprovada').length;
  const fundedAccs = accs.filter(a => a.phase === 'funded' || a.phase === 'instant');
  const active = states.filter(s => s.acc.status === 'ativa');

  const firms = new Map();
  const firmOf = id => { const a = accounts.get(id); return (a && a.firm) || 'Sem firma'; };
  const slot = f => { if (!firms.has(f)) firms.set(f, { firm: f, invested: 0, received: 0, accounts: 0, passed: 0, failed: 0, funded: 0 }); return firms.get(f); };
  accs.forEach(a => { const s = slot(a.firm || 'Sem firma'); s.accounts++; if (a.status === 'aprovada') s.passed++; if (a.status === 'reprovada' && (a.phase === 'fase1' || a.phase === 'fase2')) s.failed++; if (a.phase === 'funded' || a.phase === 'instant') s.funded++; });
  expenses.all.forEach(e => { slot(e.acc ? firmOf(e.acc) : 'Sem firma').invested += +e.amount || 0; });
  paid.forEach(p => { slot(firmOf(p.acc)).received += recOf(p); });
  const byFirm = [...firms.values()].map(f => ({ ...f, net: f.received - f.invested })).sort((a, b) => b.net - a.net);

  // fluxo de caixa mês a mês
  const ex = expenses.all.map(e => ({ d: e.date, exp: +e.amount || 0, rec: 0 }));
  const rc = paid.map(p => ({ d: p.date, exp: 0, rec: recOf(p) }));
  const all = [...ex, ...rc].filter(x => x.d);
  const months = {};
  all.forEach(x => { const k = x.d.slice(0, 7); const m = months[k] || (months[k] = { ym: k, exp: 0, rec: 0 }); m.exp += x.exp; m.rec += x.rec; });
  const keys = Object.keys(months).sort();
  const monthly = [];
  if (keys.length) {
    let y = +keys[0].slice(0, 4), m = +keys[0].slice(5) - 1;
    const last = today.slice(0, 7) > keys[keys.length - 1] ? today.slice(0, 7) : keys[keys.length - 1];
    let cum = 0;
    for (let guard = 0; guard < 240; guard++) {
      const k = `${y}-${String(m + 1).padStart(2, '0')}`;
      const v = months[k] || { ym: k, exp: 0, rec: 0 };
      cum += v.rec - v.exp;
      monthly.push({ ym: k, label: MON[m] + '/' + String(y).slice(2), exp: v.exp, rec: v.rec, net: v.rec - v.exp, cum });
      if (k >= last) break;
      m++; if (m > 11) { m = 0; y++; }
    }
  }
  return {
    states, accs, invested, received, pending: sum(pending, recOf), net, roi: invested > 0 ? net / invested * 100 : null,
    passed, failed, passRate: passed + failed ? passed / (passed + failed) * 100 : null,
    fundedCount: fundedAccs.length, costPerFunded: fundedAccs.length ? invested / fundedAccs.length : null,
    activeCount: active.length, capital: sum(active, s => s.size), balance: sum(active, s => s.balance), openPnl: sum(active, s => s.balance - s.size),
    byFirm, monthly, payoutCount: paid.length,
  };
}

// ---------- apagar / próxima fase ----------
export function removeAccount(id) {
  accounts.remove(id);
  payouts.removeWhere(p => p.acc === id); expenses.removeWhere(e => e.acc === id); adjusts.removeWhere(a => a.acc === id);
  let changed = false;
  D.trades.forEach(t => { if ((t.alloc || []).some(a => a.acc === id)) { t.alloc = t.alloc.filter(a => a.acc !== id); changed = true; } });
  if (changed) D.touch();
}

// ---------- simulador: chance de passar o desafio com o seu histórico ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Sorteia trades do seu histórico (com reposição) até bater a meta ou estourar a perda máxima. Valores em % do saldo inicial. */
export function simulate({ rs, riskPct, targetPct, ddPct, ddType = 'estatico', maxTrades = 150, sims = 4000, seed = 7 }) {
  if (!rs.length || !(riskPct > 0) || !(targetPct > 0) || !(ddPct > 0)) return null;
  const rnd = mulberry32(seed);
  let pass = 0, fail = 0; const done = [];
  for (let s = 0; s < sims; s++) {
    let eq = 0, peak = 0, res = 0, k;
    for (k = 1; k <= maxTrades; k++) {
      eq += rs[(rnd() * rs.length) | 0] * riskPct;
      if (eq >= targetPct) { res = 1; break; }
      if (eq > peak) peak = eq;
      const fl = ddType === 'trailing' ? peak - ddPct : ddType === 'trailing_trava' ? Math.min(0, peak - ddPct) : -ddPct;
      if (eq <= fl) { res = 2; break; }
    }
    if (res === 1) { pass++; done.push(k); } else if (res === 2) fail++;
  }
  done.sort((x, y) => x - y);
  return { pass: pass / sims, fail: fail / sims, open: 1 - (pass + fail) / sims, medTrades: done.length ? done[done.length >> 1] : null, sims, n: rs.length, maxTrades };
}
