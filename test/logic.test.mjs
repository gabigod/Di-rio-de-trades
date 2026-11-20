// Testes dos cálculos (node). Simula localStorage porque os módulos o usam ao carregar.
import assert from 'node:assert/strict';
const mem = {};
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
globalThis.window = { dispatchEvent() {}, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const U = await import('../src/util.js');
const A = await import('../src/analytics.js');
const D = await import('../src/data.js');
const AC = await import('../src/accounts.js');

let ok = 0; const t = (name, fn) => { try { fn(); ok++; console.log('ok  ', name); } catch (e) { console.error('FALHA', name, '\n', e.message); process.exitCode = 1; } };

// ---- formatação
t('fmtR', () => { assert.equal(U.fmtR(2), '+2R'); assert.equal(U.fmtR(-1.5), '−1,5R'); assert.equal(U.fmtR(0), '0R'); assert.equal(U.fmtR(0.004), '0R'); });
t('money', () => { assert.equal(U.money(1234.5), '$1.235'); assert.equal(U.money(523.4), '$523,40'); assert.equal(U.money(-80, { sign: true }), '−$80'); assert.equal(U.money(80, { sign: true }), '+$80'); assert.equal(U.money(100000), '$100.000'); });
t('datas', () => { assert.equal(U.fmtDate('2026-11-05'), '05/11/26'); assert.equal(U.daysBetween('2026-11-01', '2026-11-20'), 19); assert.equal(U.addDays('2026-11-28', 5), '2026-12-03'); });

// ---- dados do histórico
t('seed carregado com fotos', () => {
  assert.equal(D.trades.length, 139);
  const withPhoto = D.trades.filter(x => x.photos.length).length;
  assert.equal(withPhoto, 132);
  assert.equal(D.trades[0].photos[0].id.startsWith('tv:'), true);
  const same = D.trades.filter(x => x.photos[0] && x.photos[0].id === 'tv:DjbMEzCJ'); assert.equal(same.length, 2);
});
t('stats do seed (45 vitórias...)', () => {
  const s = A.stats(D.trades);
  assert.equal(s.n, 139); assert.equal(s.wins, 60); assert.equal(s.losses, 79);
  assert.ok(Math.abs(s.winrate - 60 / 139 * 100) < 1e-9);
});
t('calcR compra/venda', () => {
  assert.equal(A.calcR({ dir: 'BUY', entry: 1.1, stop: 1.09, exit: 1.12 }), 2);
  assert.equal(A.calcR({ dir: 'SELL', entry: 1.1, stop: 1.11, exit: 1.09 }), 1);
  assert.equal(A.calcR({ entry: 100, stop: 99, exit: 98 }), -2);   // infere compra
  assert.equal(A.calcR({ entry: 100, stop: 100, exit: 98 }), null);
});
t('expectedWait', () => { assert.ok(Math.abs(A.expectedWait(0.5, 2) - 6) < 1e-9); });
t('grade mensal soma', () => {
  const g = A.monthlyGrid(D.trades); const total = Object.values(g.tot).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - A.stats(D.trades).sumR) < 1e-9);
});
t('cumByGroup termina no total', () => {
  const c = A.cumByGroup(D.trades, x => x.strategy, 3);
  c.series.forEach(s => assert.ok(Math.abs(s.data[s.data.length - 1] - s.total) < 0.011));
});

// ---- contas
const acc = AC.accounts.add({ name: 'Teste 100k', firm: 'X', phase: 'fase1', status: 'ativa', size: 100000, start: '2026-11-01', riskPct: 0.5, target: 8, maxDaily: 5, maxDD: 10, ddType: 'estatico', minDays: 4, consistency: 40, split: 80 });
const mk = (date, r, extra = {}) => D.add({ date, asset: 'EURUSD', dir: '', result: r > 0 ? 'WIN' : 'LOSS', r, strategy: 'Pullback D1', category: 'FOREX', link: '', notes: '', alloc: [{ acc: acc.id }], ...extra });
mk('2026-11-02', 2); mk('2026-11-03', -1); mk('2026-11-04', 2); mk('2026-11-05', 1);
t('saldo e lucro da conta', () => {
  const st = AC.accountState(acc, D.trades, '2026-11-20');
  // risco 0,5% de 100k = $500 por R → (2-1+2+1)=4R = $2.000
  assert.equal(st.perf, 2000); assert.equal(st.balance, 102000); assert.equal(st.nTrades, 4); assert.equal(st.tradeDays, 4);
  assert.equal(st.floor, 90000); assert.equal(st.margin, 12000); assert.ok(st.ddUsed === 0);
  assert.equal(st.target, 8000); assert.equal(st.progress, 0.25);
  assert.equal(st.bestDay, 1000); assert.equal(st.bestPct, 50);
});
t('regras: consistência acusa melhor dia > 40%', () => {
  const r = AC.rulesOf(AC.accountState(acc, D.trades, '2026-11-20'));
  assert.equal(r.find(x => x.key === 'cons').state, 'bad');
  assert.equal(r.find(x => x.key === 'days').state, 'ok');
  assert.equal(r.find(x => x.key === 'dd').state, 'ok');
});
t('pnl real sobrescreve o calculado', () => {
  const x = mk('2026-11-06', -1, { alloc: [{ acc: acc.id, pnl: -520 }] });
  assert.equal(AC.tradePnl(x, acc), -520);
  const y = mk('2026-11-06', -1, { alloc: [{ acc: acc.id, risk: 1 }] });
  assert.equal(AC.tradePnl(y, acc), -1000);
  D.remove(x._id); D.remove(y._id);
});
t('violação da perda máxima (estático)', () => {
  const a2 = AC.accounts.add({ name: 'Quebra', phase: 'fase1', status: 'ativa', size: 10000, start: '2026-10-01', riskPct: 5, maxDD: 10, maxDaily: 6, ddType: 'estatico' });
  const l1 = D.add({ date: '2026-10-05', asset: 'X', result: 'LOSS', r: -1, alloc: [{ acc: a2.id }] });
  const l2 = D.add({ date: '2026-10-06', asset: 'X', result: 'LOSS', r: -1, alloc: [{ acc: a2.id }] });
  const st = AC.accountState(a2, D.trades, '2026-11-20');
  assert.equal(st.balance, 9000); assert.ok(st.breach && st.breach.date === '2026-10-06');
  assert.equal(st.dayBreach, null);   // −$500 por dia, limite de 6% = $600
  D.remove(l1._id); D.remove(l2._id); AC.removeAccount(a2.id);
});
t('perda diária estourada', () => {
  const a3 = AC.accounts.add({ name: 'Dia', phase: 'fase1', status: 'ativa', size: 10000, start: '2026-10-01', riskPct: 1, maxDD: 20, maxDaily: 2, ddType: 'estatico' });
  const l = D.add({ date: '2026-10-05', asset: 'X', result: 'LOSS', r: -2, alloc: [{ acc: a3.id }] });
  const st = AC.accountState(a3, D.trades, '2026-10-05');
  assert.equal(st.dayPnl, -200); assert.ok(st.dayBreach); assert.equal(st.dayUsed, 1);
  D.remove(l._id); AC.removeAccount(a3.id);
});
t('trailing sobe com o pico e trava no saldo inicial', () => {
  const a4 = AC.accounts.add({ name: 'Trail', phase: 'funded', status: 'ativa', size: 10000, start: '2026-09-01', riskPct: 1, maxDD: 5, ddType: 'trailing_trava' });
  const w = D.add({ date: '2026-09-02', asset: 'X', result: 'WIN', r: 10, alloc: [{ acc: a4.id }] });   // +1000
  const st = AC.accountState(a4, D.trades, '2026-09-30');
  assert.equal(st.peak, 11000); assert.equal(st.floor, 10000);   // 11000-500=10500 → trava em 10000? min(size, peak-dd)=10000
  const a5 = AC.accounts.add({ name: 'Trail2', phase: 'funded', status: 'ativa', size: 10000, start: '2026-09-01', riskPct: 1, maxDD: 5, ddType: 'trailing' });
  D.update(w._id, { alloc: [{ acc: a4.id }, { acc: a5.id }] });
  assert.equal(AC.accountState(a5, D.trades, '2026-09-30').floor, 10500);
  D.remove(w._id); AC.removeAccount(a4.id); AC.removeAccount(a5.id);
});
t('saque reduz o saldo, não o desempenho', () => {
  AC.payouts.add({ acc: acc.id, date: '2026-11-10', amount: 1000, received: 800, status: 'pago' });
  const st = AC.accountState(acc, D.trades, '2026-11-20');
  assert.equal(st.perf, 2000); assert.equal(st.balance, 101000); assert.equal(st.withdrawn, 1000);
});
t('portfólio: investido, recebido e ROI', () => {
  AC.expenses.add({ acc: acc.id, date: '2026-11-01', amount: 250, kind: 'Avaliação' });
  AC.expenses.add({ acc: acc.id, date: '2026-11-15', amount: 50, kind: 'Reset' });
  AC.payouts.add({ acc: acc.id, date: '2026-11-18', amount: 500, status: 'pendente' });
  const p = AC.portfolio(D.trades, '2026-11-20');
  assert.equal(p.invested, 300); assert.equal(p.received, 800); assert.equal(p.net, 500);
  assert.ok(Math.abs(p.roi - 500 / 300 * 100) < 1e-9);
  assert.equal(p.pending, 400);                       // 500 × split 80%
  assert.equal(p.monthly.length, 1); assert.equal(p.monthly[0].net, 500);
  assert.equal(p.byFirm[0].firm, 'X');
});
t('simulador é coerente', () => {
  const win = AC.simulate({ rs: [1, 1, 1, 1], riskPct: 1, targetPct: 4, ddPct: 10 });
  assert.equal(win.pass, 1); assert.equal(win.medTrades, 4);
  const lose = AC.simulate({ rs: [-1], riskPct: 1, targetPct: 8, ddPct: 5 });
  assert.equal(lose.fail, 1);
  const hist = AC.simulate({ rs: D.trades.map(x => +x.r || 0), riskPct: 0.5, targetPct: 8, ddPct: 10 });
  assert.ok(hist.pass >= 0 && hist.pass <= 1 && Math.abs(hist.pass + hist.fail + hist.open - 1) < 1e-9);
  console.log('     chance histórica (0,5% de risco, meta 8%, perda 10%):', (hist.pass * 100).toFixed(0) + '% passa ·', (hist.fail * 100).toFixed(0) + '% estoura');
});
t('apagar conta limpa tudo', () => {
  AC.removeAccount(acc.id);
  assert.equal(AC.accounts.all.length, 0); assert.equal(AC.payouts.all.length, 0); assert.equal(AC.expenses.all.length, 0);
  assert.ok(D.trades.every(x => !(x.alloc || []).length));
});
console.log(`\n${ok} testes ok`);
