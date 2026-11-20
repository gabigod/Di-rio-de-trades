// Página de uma conta: saldo, regras, gráfico, trades, saques, gastos e simulador.
import * as D from '../data.js';
import * as AC from '../accounts.js';
import * as P from '../photos.js';
import { esc, fmtR, fmtDate, fmtDMY, rCls, money, pct, num, sum, C, clamp, todayISO, debounce } from '../util.js';
import { icon } from '../icons.js';
import { acts, toast, openSheet, openPage, confirmSheet } from '../ui.js';
import { chartScope, ring, meter, segBar, legend, chartCard, tableFrom, STATE_COLOR, xAxis, yAxis, dateTicks, lineDs, wash, tip } from '../charts.js';
import { thumbCell } from './trades.js';
import { openAccountForm, openPayoutForm, openExpenseForm, openAdjustForm, openStatusSheet, nextPhaseOf, numField, parse } from './conta-forms.js';

const kfmt = v => { const a = Math.abs(v); return (v < 0 ? '−' : '') + '$' + (a >= 1000 ? num(a / 1000, a % 1000 ? 1 : 0) + 'k' : num(a, 0)); };
const dirName = d => (d === 'BUY' ? 'Compra' : d === 'SELL' ? 'Venda' : '');
const live = new Map();   // contas abertas: id → { setTab }
const TABS = [['trades', 'Trades'], ['saques', 'Saques'], ['gastos', 'Gastos'], ['sim', 'Simulador']];

export function openAccount(id) {
  if (!AC.accounts.get(id)) return;
  let tab = 'trades', closed = false;
  const cs = chartScope();
  const sim = { risk: '', tgt: '', dd: '', max: '150' };
  const pg = openPage({ title: '', cls: 'detail conta', onClose: () => { closed = true; offs.forEach(f => f()); cs.destroy(); live.delete(id); } });
  const render = () => {
    if (closed) return;
    const acc = AC.accounts.get(id); if (!acc) { pg.close(); return; }
    cs.destroy();
    const st = AC.accountState(acc);
    const y = pg.body.scrollTop;
    pg.setTitle(acc.name);
    pg.setRight(`<button class="icon-btn" data-act="a-edit" data-id="${id}" aria-label="Editar conta">${icon('edit')}</button>`);
    pg.body.innerHTML = pageHTML(acc, st, tab, sim);
    pg.body.scrollTop = y;
    P.hydrate(pg.body);
    drawChart(cs, st);
    if (tab === 'sim') bindSim(pg.body, acc, sim);
  };
  const offs = [AC.accounts.on(render), AC.payouts.on(render), AC.expenses.on(render), AC.adjusts.on(render), D.onChange(render)];
  live.set(id, { setTab: t => { tab = t; render(); } });
  render();
}
acts['a-tab'] = el => { const p = live.get(el.dataset.id); if (p) p.setTab(el.dataset.t); };

// ---------- página ----------
function pageHTML(acc, st, tab, sim) {
  const rules = AC.rulesOf(st), id = acc.id;
  const active = acc.status === 'ativa', challenge = acc.phase === 'fase1' || acc.phase === 'fase2';
  const banners = [];
  if (active && st.breach) banners.push(`<div class="banner bad"><i>${icon('alert', 18)}</i><div><b>Perda máxima violada em ${fmtDMY(st.breach.date)}</b><small>Se a firma encerrou a conta, marque como reprovada.</small></div><button class="btn sm" data-act="a-set" data-id="${id}" data-v="reprovada">Reprovada</button></div>`);
  else if (active && st.dayBreach) banners.push(`<div class="banner warn"><i>${icon('alert', 18)}</i><div><b>Perda diária estourada em ${fmtDMY(st.dayBreach.d)}</b><small>Confira com a firma se a conta continua ativa.</small></div></div>`);
  if (active && challenge && +acc.target && st.progress >= 1 && st.tradeDays >= (+acc.minDays || 0) && !st.breach) banners.push(`<div class="banner ok"><i>${icon('target', 18)}</i><div><b>Meta batida</b><small>Quando a firma confirmar, marque como aprovada.</small></div><button class="btn sm" data-act="a-set" data-id="${id}" data-v="aprovada">Aprovada</button></div>`);
  if (active && !challenge && st.availProfit > 0 && (st.daysToPayout === null || st.daysToPayout <= 0)) banners.push(`<div class="banner ok"><i>${icon('coin', 18)}</i><div><b>Saque disponível: ${money(st.availProfit)}</b><small>Você recebe ${money(st.youGet)} (${num(+acc.split || 100, 0)}%).</small></div><button class="btn sm" data-act="y-new" data-id="${id}">Registrar</button></div>`);
  if (acc.status === 'aprovada' && challenge) banners.push(`<div class="banner ok"><i>${icon('flag', 18)}</i><div><b>Conta aprovada</b><small>Crie a próxima fase para continuar acompanhando.</small></div><button class="btn sm" data-act="a-next" data-id="${id}">Próxima fase</button></div>`);

  const rg = [];
  if (+acc.target) { const k = clamp(st.progress, 0, 1); rg.push(ring({ ratio: k, color: st.progress >= 1 ? C.up : C.acc, size: 86, stroke: 8, value: `<b class="num">${num(Math.min(st.progress, 9.99) * 100, 0)}%</b>`, label: 'da meta' })); }
  if (+acc.maxDD) rg.push(ring({ ratio: st.ddUsed, color: st.breach ? C.dn : st.ddUsed >= .75 ? C.warn : C.up, size: 86, stroke: 8, value: `<b class="num">${num(st.ddUsed * 100, 0)}%</b>`, label: 'da perda máx.' }));
  if (+acc.maxDaily) rg.push(ring({ ratio: st.dayUsed, color: st.dayBreach ? C.dn : st.dayUsed >= .75 ? C.warn : C.up, size: 86, stroke: 8, value: `<b class="num">${num(st.dayUsed * 100, 0)}%</b>`, label: 'perda de hoje' }));

  return `
    <section class="a-top"><div class="a-id"><i class="dot lg" style="background:${acc.color || '#3987e5'}"></i><div><b>${esc(acc.firm || 'Sem firma')}</b><small>${AC.PHASES[acc.phase]}<i class="sep"></i>${money(acc.size)}${acc.start ? `<i class="sep"></i>desde ${fmtDMY(acc.start)}` : ''}</small></div></div>
      <button class="pill st-${acc.status}" data-act="a-status" data-id="${id}">${AC.STATUS[acc.status]}${icon('chev', 12)}</button></section>
    ${banners.join('')}
    <section class="card bal"><div class="lbl">Saldo estimado</div><div class="big num">${money(st.balance)}</div>
      <div class="bal-sub num ${rCls(st.perf)}">${money(st.perf, { sign: true })}<small>${pct(st.profitPct, 2, true)}</small></div>
      <div class="bal-foot"><span>${st.nTrades} ${st.nTrades === 1 ? 'trade' : 'trades'}${st.withdrawn ? `<i class="sep"></i>sacou ${money(st.withdrawn)}` : ''}</span><button class="link" data-act="a-adjust" data-id="${id}">Ajustar saldo</button></div></section>
    ${rg.length ? `<section class="card rings">${rg.join('')}</section>` : ''}
    ${rules.length ? `<section class="card"><div class="sec-head"><h3>Regras</h3></div>${rules.map(ruleRow).join('')}
      ${st.floor !== null ? `<div class="kvl" style="margin-top:6px"><div><span>Saldo mínimo hoje</span><b class="num">${money(st.floor)}</b></div><div><span>Maior saldo</span><b class="num">${money(st.peak)}</b></div></div>` : ''}</section>`
      : `<section class="card need"><div class="need-ic">${icon('info', 20)}</div><div><h3>Sem regras cadastradas</h3><p class="hint">Edite a conta para informar meta, perda diária e perda máxima.</p></div></section>`}
    ${st.series.length > 1 ? chartCard({ title: 'Saldo e limites', sub: 'Como o saldo anda em relação à perda máxima e à meta', id: 'ca-bal', h: 200, legendHtml: legend('ca-bal', balLegend(st)), table: balTable(st) })
      : `<section class="card need"><div class="need-ic">${icon('chart', 20)}</div><div><h3>Sem movimento ainda</h3><p class="hint">Ao registrar um trade, escolha esta conta em Mais detalhes → Contas. Para trades antigos, use “Adicionar trades antigos” abaixo.</p></div></section>`}
    <div class="seg2 tabs4" role="tablist">${TABS.map(([k, t]) => `<button data-act="a-tab" data-id="${id}" data-t="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="tab-body">${({ trades: tradesTab, saques: payoutsTab, gastos: expensesTab, sim: simTab }[tab])(acc, st, sim)}</div>
    ${adjustsCard(acc)}
    <div class="a-actions">
      ${challenge && (acc.status === 'aprovada' || (active && st.progress >= 1)) ? `<button class="btn ghost" data-act="a-next" data-id="${id}">Criar próxima fase</button>` : ''}
      <button class="btn ghost" data-act="a-edit" data-id="${id}">Editar regras e dados</button>
      <button class="btn ghost danger" data-act="a-del" data-id="${id}">Apagar conta</button></div>`;
}
function ruleRow(r) {
  const col = STATE_COLOR[r.state];
  return `<div class="rule ${r.state}"><div class="rule-ic" style="--c:${col}">${icon(r.icon, 18)}</div>
    <div class="rule-m"><div class="rule-t"><b>${r.label}</b><span class="num">${r.value}</span></div>${r.bar === 'none' ? '' : meter(r.ratio, col, 5)}<small>${r.note}</small></div>
    <i class="rule-st" style="color:${col}">${r.state === 'ok' ? icon('check', 16) : r.state === 'idle' ? '' : icon('alert', 16)}</i></div>`;
}

// ---------- gráfico do saldo ----------
const balLegend = st => [{ name: 'Saldo', color: C.acc }, ...(st.floor !== null ? [{ name: 'Limite de perda', color: C.dn }] : []), ...(st.target ? [{ name: 'Meta', color: C.up }] : [])];
function balTable(st) {
  const labels = st.series.map(p => fmtDate(p.date));
  const series = [{ name: 'Saldo', data: st.series.map(p => p.bal) }];
  if (st.floor !== null) series.push({ name: 'Limite', data: st.series.map(p => p.floor) });
  return tableFrom(labels, series, v => money(v));
}
function drawChart(cs, st) {
  if (st.series.length < 2) return;
  const labels = st.series.map(p => fmtDate(p.date));
  const sets = [lineDs(st.series.map(p => +p.bal.toFixed(2)), C.acc, { label: 'Saldo', fill: true, backgroundColor: wash(C.acc), tension: 0 })];
  if (st.floor !== null) sets.push(lineDs(st.series.map(p => +p.floor.toFixed(2)), C.dn, { label: 'Limite de perda', borderWidth: 1.5, stepped: 'after', pointHoverRadius: 0 }));
  if (st.target) sets.push(lineDs(st.series.map(() => st.size + st.target), C.up, { label: 'Meta', borderWidth: 1.5, borderDash: [6, 4], pointHoverRadius: 0 }));
  cs.mount('ca-bal', {
    type: 'line', data: { labels, datasets: sets },
    options: { interaction: { intersect: false, mode: 'index' }, layout: { padding: { right: 52, top: 8 } }, plugins: { legend: { display: false }, crosshair: true, endMarks: { dot: true, fmt: v => kfmt(v) }, tooltip: tip(v => money(v), true) },
      scales: { x: xAxis({ ticks: dateTicks(labels) }), y: yAxis({ ticks: { callback: kfmt } }) } },
  });
}

// ---------- abas ----------
function tradesTab(acc, st) {
  const ts = [...st.trades].reverse();
  const wins = ts.filter(t => t.result === 'WIN').length, closed = ts.filter(t => t.result === 'WIN' || t.result === 'LOSS').length;
  const rows = ts.map(t => {
    const pnl = AC.tradePnl(t, acc), a = AC.allocOf(t, acc.id), risk = a && a.risk !== undefined && a.risk !== '' ? +a.risk : +acc.riskPct || 0;
    return `<div class="trow" data-act="trade" data-id="${t._id}">${thumbCell(t)}
      <div class="mid"><div class="a">${esc(t.asset)}${t.dir ? `<span class="dir ${t.dir === 'BUY' ? 'buy' : 'sell'}">${dirName(t.dir)}</span>` : ''}</div><div class="b2 num">${fmtDate(t.date)}<i class="sep"></i>${fmtR(+t.r || 0)}</div></div>
      <div class="r"><div class="rr num ${rCls(pnl)}">${money(pnl, { sign: true })}</div><div class="dt num">risco ${pct(risk, 2)}</div></div></div>`;
  }).join('');
  return `${ts.length ? `<div class="tiles t3"><div class="tile"><div class="k">Resultado</div><div class="v num ${rCls(st.perf)}">${money(st.perf, { sign: true })}</div></div>
      <div class="tile"><div class="k">Acerto</div><div class="v num">${closed ? pct(wins / closed * 100, 0) : '—'}</div></div>
      <div class="tile"><div class="k">Dias com trade</div><div class="v num">${st.tradeDays}</div></div></div>
      <div class="card list flat" style="margin-top:12px">${rows}</div>`
    : `<div class="empty">Nenhum trade marcado nesta conta.</div>`}
    <button class="btn ghost wide" data-act="a-alloc" data-id="${acc.id}">${icon('plus', 18)}Adicionar trades antigos a esta conta</button>`;
}
export const entryRow = (kind, x, accName) => kind === 'y'
  ? `<button class="lrow" data-act="y-edit" data-id="${x.id}"><i class="lic up">${icon('coin', 18)}</i><div class="mid"><div class="a">Saque${x.status === 'pendente' ? '<span class="st warn">Pendente</span>' : ''}</div><div class="b2 num">${fmtDMY(x.date)}${accName ? `<i class="sep"></i>${esc(accName)}` : ''}${x.note ? `<i class="sep"></i>${esc(x.note)}` : ''}</div></div>
      <div class="r"><div class="rr num pos">${money(AC.payoutReceived(x), { sign: true })}</div><div class="dt num">de ${money(x.amount)}</div></div></button>`
  : `<button class="lrow" data-act="e-edit" data-id="${x.id}"><i class="lic dn">${icon('receipt', 18)}</i><div class="mid"><div class="a">${esc(x.kind || 'Gasto')}</div><div class="b2 num">${fmtDMY(x.date)}${accName ? `<i class="sep"></i>${esc(accName)}` : ''}${x.note ? `<i class="sep"></i>${esc(x.note)}` : ''}</div></div>
      <div class="r"><div class="rr num neg">${money(-(+x.amount || 0))}</div></div></button>`;
function payoutsTab(acc, st) {
  const list = AC.payouts.all.filter(p => p.acc === acc.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const funded = acc.phase === 'funded' || acc.phase === 'instant';
  const when = st.eligibleDate ? (st.daysToPayout > 0 ? `Libera em ${st.daysToPayout} ${st.daysToPayout === 1 ? 'dia' : 'dias'} (${fmtDMY(st.eligibleDate)})` : `Liberado desde ${fmtDMY(st.eligibleDate)}`) : '';
  return `${funded ? `<section class="card"><div class="kv2"><div><span>Lucro disponível</span><b class="num">${money(st.availProfit)}</b></div><div><span>Você recebe (${num(+acc.split || 100, 0)}%)</span><b class="num pos">${money(st.youGet)}</b></div></div>
      ${when ? `<p class="hint" style="margin:10px 0 0">${when}</p>` : ''}${+acc.minPayout ? `<p class="hint" style="margin:6px 0 0">Saque mínimo: ${money(+acc.minPayout)}</p>` : ''}</section>`
      : `<p class="hint pad">Saques acontecem em contas funded. Você pode registrar um mesmo assim, por exemplo de uma fase paga com reembolso.</p>`}
    ${list.length ? `<div class="card list flat">${list.map(p => entryRow('y', p)).join('')}</div>` : '<div class="empty">Nenhum saque registrado.</div>'}
    <button class="btn wide" data-act="y-new" data-id="${acc.id}">${icon('plus', 18)}Registrar saque</button>`;
}
function expensesTab(acc) {
  const list = AC.expenses.all.filter(e => e.acc === acc.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const tot = sum(list, e => e.amount);
  return `${list.length ? `<section class="card"><div class="kv2 solo"><div><span>Gasto total nesta conta</span><b class="num neg">${money(-tot)}</b></div></div></section><div class="card list flat">${list.map(e => entryRow('e', e)).join('')}</div>` : '<div class="empty">Nenhum gasto registrado.</div>'}
    <button class="btn wide" data-act="e-new" data-id="${acc.id}">${icon('plus', 18)}Registrar gasto</button>`;
}
function adjustsCard(acc) {
  const list = AC.adjusts.all.filter(a => a.acc === acc.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!list.length) return '';
  return `<section class="card"><div class="sec-head"><h3>Ajustes de saldo</h3></div><div class="list flat">${list.map(a => `<button class="lrow" data-act="j-del" data-id="${a.id}"><i class="lic">${icon('swap', 18)}</i><div class="mid"><div class="a">${a.note ? esc(a.note) : 'Ajuste'}</div><div class="b2 num">${fmtDMY(a.date)}</div></div><div class="r"><div class="rr num ${rCls(a.amount)}">${money(a.amount, { sign: true })}</div></div></button>`).join('')}</div></section>`;
}

// ---------- simulador ----------
function simTab(acc, st, sim) {
  if (!sim.risk) { sim.risk = String(+acc.riskPct || 0.5).replace('.', ','); sim.tgt = String(+acc.target || 8).replace('.', ','); sim.dd = String(+acc.maxDD || 10).replace('.', ','); }
  const n = D.trades.length;
  return `<section class="card"><div class="sec-head"><h3>Chance de passar</h3></div>
    <p class="hint" style="margin:-4px 0 14px">Sorteia trades do seu histórico (${n}) até bater a meta ou violar a perda máxima. É uma estimativa com base no passado, não uma garantia.</p>
    <div class="row2">${numField('s-risk', 'Risco por trade', sim.risk, { unit: '%' })}${numField('s-tgt', 'Meta', sim.tgt, { unit: '%' })}</div>
    <div class="row2">${numField('s-dd', 'Perda máxima', sim.dd, { unit: '%' })}${numField('s-max', 'Prazo', sim.max, { unit: 'trades' })}</div>
    <div id="s-out"></div></section>`;
}
function bindSim(root, acc, sim) {
  const rs = D.trades.map(t => +t.r || 0);
  const run = () => {
    sim.risk = root.querySelector('#s-risk').value; sim.tgt = root.querySelector('#s-tgt').value; sim.dd = root.querySelector('#s-dd').value; sim.max = root.querySelector('#s-max').value;
    const risk = parse(sim.risk), tgt = parse(sim.tgt), dd = parse(sim.dd), max = Math.round(parse(sim.max) || 150);
    const out = root.querySelector('#s-out');
    if (!rs.length) { out.innerHTML = '<div class="empty">Registre trades para simular.</div>'; return; }
    const r = AC.simulate({ rs, riskPct: risk, targetPct: tgt, ddPct: dd, ddType: acc.ddType, maxTrades: clamp(max, 10, 1000), sims: 4000 });
    if (!r) { out.innerHTML = '<div class="empty">Preencha risco, meta e perda máxima.</div>'; return; }
    const levels = [0.25, 0.5, 0.75, 1, 1.5].map(x => ({ x, r: AC.simulate({ rs, riskPct: x, targetPct: tgt, ddPct: dd, ddType: acc.ddType, maxTrades: clamp(max, 10, 1000), sims: 2000 }) }));
    const best = Math.max(...levels.map(l => l.r.pass));
    out.innerHTML = `<div class="sim-big"><b class="num ${r.pass >= .5 ? 'pos' : 'neg'}">${num(r.pass * 100, 0)}%</b><span>de chance de bater a meta em até ${r.maxTrades} trades</span></div>
      ${segBar([{ v: r.pass, color: C.up, name: 'Passa' }, { v: r.open, color: C.neutral, name: 'Sem resolver' }, { v: r.fail, color: C.dn, name: 'Reprova' }], 10)}
      <div class="trio"><div><i style="background:${C.up}"></i><span>Passa</span><b class="num">${num(r.pass * 100, 0)}%</b></div><div><i style="background:${C.neutral}"></i><span>Sem resolver</span><b class="num">${num(r.open * 100, 0)}%</b></div><div><i style="background:${C.dn}"></i><span>Reprova</span><b class="num">${num(r.fail * 100, 0)}%</b></div></div>
      ${r.medTrades ? `<p class="hint" style="margin:12px 0 0">Quando passa, leva cerca de ${r.medTrades} trades (mediana).</p>` : ''}
      <h4 class="sub-h">Comparando o risco por trade</h4>
      <table class="cmp"><tr><th>Risco</th><th>Passa</th><th>Reprova</th></tr>${levels.map(l => `<tr class="${l.r.pass === best && best > 0 ? 'best' : ''}"><td class="num">${num(l.x, 2)}%${l.r.pass === best && best > 0 ? '<span class="st ok">melhor</span>' : ''}</td><td class="num">${num(l.r.pass * 100, 0)}%</td><td class="num">${num(l.r.fail * 100, 0)}%</td></tr>`).join('')}</table>`;
  };
  const d = debounce(run, 250);
  ['#s-risk', '#s-tgt', '#s-dd', '#s-max'].forEach(s => root.querySelector(s).addEventListener('input', d));
  run();
}

// ---------- ações ----------
acts['a-edit'] = el => openAccountForm(el.dataset.id);
acts['a-status'] = el => { const id = el.dataset.id; openStatusSheet(id, () => askNext(id)); };
acts['a-set'] = el => { const id = el.dataset.id, acc = AC.accounts.get(id); AC.accounts.update(id, { status: el.dataset.v }); toast('Situação atualizada ✓'); if (el.dataset.v === 'aprovada' && acc && (acc.phase === 'fase1' || acc.phase === 'fase2')) askNext(id); };
acts['a-adjust'] = el => openAdjustForm(el.dataset.id);
acts['y-new'] = el => openPayoutForm(el.dataset.id);
acts['y-edit'] = el => openPayoutForm(null, el.dataset.id);
acts['e-new'] = el => openExpenseForm(el.dataset.id);
acts['e-edit'] = el => openExpenseForm(null, el.dataset.id);
acts['j-del'] = async el => { if (await confirmSheet({ title: 'Apagar este ajuste?', text: 'O saldo estimado volta a considerar só os trades.', ok: 'Apagar', danger: true })) { AC.adjusts.remove(el.dataset.id); toast('Ajuste apagado'); } };
acts['a-next'] = el => askNext(el.dataset.id, true);
acts['a-del'] = async el => {
  const acc = AC.accounts.get(el.dataset.id); if (!acc) return;
  if (await confirmSheet({ title: `Apagar ${acc.name}?`, text: 'Apaga também os saques, gastos e ajustes desta conta. Os trades continuam, só perdem a marcação dela.', ok: 'Apagar conta', danger: true })) {
    AC.removeAccount(acc.id); toast('Conta apagada');
  }
};
async function askNext(id, direct = false) {
  const acc = AC.accounts.get(id); if (!acc) return;
  if (direct || await confirmSheet({ title: 'Criar a próxima fase?', text: 'Cria uma conta nova já preenchida com os dados desta. Você revisa antes de salvar.', ok: 'Criar' })) {
    openAccountForm(null, nextPhaseOf(acc), (rec, isNew) => { if (isNew) openAccount(rec.id); });
  }
}
acts['a-alloc'] = el => openAllocSheet(el.dataset.id);

/** Marca de uma vez os trades antigos que pertencem a esta conta. */
function openAllocSheet(id) {
  const acc = AC.accounts.get(id); if (!acc) return;
  const strats = Object.entries(D.countBy('strategy')).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const body = openSheet(`<h2>Adicionar trades antigos</h2>
    <p class="hint" style="margin:-6px 0 14px">Marque de uma vez os trades que você fez nesta conta. Cada um passa a contar no saldo e nas regras.</p>
    <div class="row2"><label class="fld"><span>De</span><input class="inp" id="l-from" type="date" value="${acc.start || ''}"></label><label class="fld"><span>Até</span><input class="inp" id="l-to" type="date" value="${todayISO()}"></label></div>
    ${strats.length ? `<label class="fld"><span>Estratégia</span><select class="inp" id="l-strat"><option value="">Todas</option>${strats.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>` : ''}
    ${numField('l-risk', 'Risco por trade', acc.riskPct, { unit: '%' })}
    <div class="adj-diff" id="l-count"></div>
    <div class="btns-r"><button class="btn" id="l-go">Adicionar</button></div>`);
  const pick = () => {
    const from = body.querySelector('#l-from').value || '0000', to = body.querySelector('#l-to').value || '9999', s = body.querySelector('#l-strat') ? body.querySelector('#l-strat').value : '';
    return D.trades.filter(t => t.date >= from && t.date <= to && (!s || t.strategy === s) && !AC.allocOf(t, id));
  };
  const count = () => { const n = pick().length; body.querySelector('#l-count').innerHTML = n ? `<b class="num">${n}</b> ${n === 1 ? 'trade será adicionado' : 'trades serão adicionados'}` : 'Nenhum trade nesse período'; body.querySelector('#l-go').disabled = !n; };
  body.querySelectorAll('input,select').forEach(e => e.addEventListener('input', count)); count();
  body.querySelector('#l-go').onclick = () => {
    const ts = pick(); if (!ts.length) { toast('Nenhum trade para adicionar'); return; }
    const risk = parse(body.querySelector('#l-risk').value);
    ts.forEach(t => { t.alloc = [...(t.alloc || []), { acc: id, ...(risk !== null && risk !== +acc.riskPct ? { risk } : {}) }]; });
    D.touch(); body.close(); toast(`${ts.length} ${ts.length === 1 ? 'trade adicionado' : 'trades adicionados'} ✓`);
  };
}
