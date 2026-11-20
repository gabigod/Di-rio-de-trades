// Aba Contas: visão geral das prop firms, contas, fluxo de caixa e extrato.
import * as AC from '../accounts.js';
import { $, esc, rCls, money, pct, num, sum, C, clamp, MONF, fmtDMY } from '../util.js';
import { icon } from '../icons.js';
import { acts, openPage } from '../ui.js';
import { redraw } from '../state.js';
import { mount, xAxis, yAxis, lineDs, wash, tip, legend, chartCard, tableFrom, meter, hbars, STATE_COLOR } from '../charts.js';
import { openAccount, entryRow } from './conta.js';
import { openAccountForm, openPayoutForm, openExpenseForm } from './conta-forms.js';

let filter = 'ativas';
const kfmt = v => { const a = Math.abs(v); return (v < 0 ? '−' : '') + '$' + (a >= 1000 ? num(a / 1000, a % 1000 ? 1 : 0) + 'k' : num(a, 0)); };

/** Pior estado entre as regras da conta: bad, warn ou ok. */
export function alertLevel(st) {
  const r = AC.rulesOf(st);
  return r.some(x => x.state === 'bad') ? 'bad' : r.some(x => x.state === 'warn') ? 'warn' : 'ok';
}
const flag = lvl => (lvl === 'bad' ? `<span class="flag bad">${icon('alert', 12)}Limite violado</span>` : lvl === 'warn' ? `<span class="flag warn">${icon('alert', 12)}Atenção</span>` : '');

/** Linha compacta de uma conta (Painel). */
export function accountRow(st) {
  const a = st.acc, lvl = alertLevel(st), k = clamp(st.progress, 0, 1);
  return `<div class="arow" data-act="acc" data-id="${a.id}">
    <i class="dot" style="background:${a.color || '#3987e5'}"></i>
    <div class="mid"><div class="a">${esc(a.name)}${flag(lvl)}</div>
      <div class="b2">${esc(a.firm || 'Sem firma')}<i class="sep"></i>${AC.PHASES[a.phase]}</div>
      ${+a.target ? meter(k, st.progress >= 1 ? C.up : C.acc, 5) : ''}</div>
    <div class="r"><div class="rr num">${money(st.balance)}</div><div class="dt num ${rCls(st.perf)}">${pct(st.profitPct, 1, true)}</div></div></div>`;
}

// ---------- cartão de conta ----------
function accountCard(st) {
  const a = st.acc, lvl = alertLevel(st), active = a.status === 'ativa';
  const m = [];
  if (+a.target) m.push(`<div class="ac-m"><span>Meta</span>${meter(clamp(st.progress, 0, 1), st.progress >= 1 ? C.up : C.acc, 6)}<em class="num">${num(Math.min(st.progress, 9.99) * 100, 0)}%</em></div>`);
  if (+a.maxDD) m.push(`<div class="ac-m"><span>Perda máx.</span>${meter(st.ddUsed, st.breach ? C.dn : st.ddUsed >= .75 ? C.warn : C.up, 6)}<em class="num">${num(st.ddUsed * 100, 0)}%</em></div>`);
  if (!+a.target && st.availProfit > 0) m.push(`<div class="ac-m"><span>A sacar</span><b class="num pos">${money(st.youGet)}</b><em class="mut">de ${money(st.availProfit)} de lucro</em></div>`);
  return `<article class="acard ${active ? '' : 'off'}" data-act="acc" data-id="${a.id}" style="--c:${a.color || '#3987e5'}">
    <div class="ac-top"><i class="dot"></i><div class="ac-n"><b>${esc(a.name)}</b><small>${esc(a.firm || 'Sem firma')}<i class="sep"></i>${AC.PHASES[a.phase]}<i class="sep"></i>${money(a.size)}</small></div>
      ${active ? flag(lvl) : `<span class="pill st-${a.status}">${AC.STATUS[a.status]}</span>`}</div>
    <div class="ac-bal"><div><span>Saldo estimado</span><b class="num">${money(st.balance)}</b></div><div class="ac-pl num ${rCls(st.perf)}">${money(st.perf, { sign: true })}<small>${pct(st.profitPct, 1, true)}</small></div></div>
    ${m.join('')}</article>`;
}

// ---------- extrato ----------
function ledger() {
  const name = id => (AC.accounts.get(id) || {}).name || '';
  return [
    ...AC.payouts.all.map(p => ({ k: 'y', x: p, date: p.date, name: name(p.acc) })),
    ...AC.expenses.all.map(e => ({ k: 'e', x: e, date: e.date, name: name(e.acc) })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

// ---------- aba ----------
export function renderContas() {
  const accs = AC.accounts.all;
  if (!accs.length && !AC.payouts.all.length && !AC.expenses.all.length) { $('#view').innerHTML = emptyHTML(); return; }
  const pf = AC.portfolio();
  const shown = pf.states.filter(s => (filter === 'ativas' ? s.acc.status === 'ativa' : s.acc.status !== 'ativa'));
  const nAct = pf.states.filter(s => s.acc.status === 'ativa').length, nOld = pf.states.length - nAct;
  const rank = { bad: 0, warn: 1, ok: 2 };
  if (filter === 'ativas') shown.sort((a, b) => rank[alertLevel(a)] - rank[alertLevel(b)]);
  const kinds = {}; AC.expenses.all.forEach(e => { const k = e.kind || 'Outro'; (kinds[k] || (kinds[k] = { n: 0, v: 0 })).n++; kinds[k].v += +e.amount || 0; });
  const kindRows = Object.entries(kinds).sort((a, b) => b[1].v - a[1].v).map(([k, o]) => ({ label: k, sub: `${o.n} ${o.n === 1 ? 'gasto' : 'gastos'}`, v: -o.v }));
  const firmRows = pf.byFirm.filter(f => f.invested || f.received).map(f => ({ label: f.firm, sub: `${f.accounts} ${f.accounts === 1 ? 'conta' : 'contas'} · recebido ${money(f.received)} · gasto ${money(f.invested)}`, v: Math.round(f.net) }));
  const led = ledger();
  $('#view').innerHTML = `
    <header class="top"><div><h1>Contas</h1><p class="sub">${nAct} ${nAct === 1 ? 'ativa' : 'ativas'}<i class="sep"></i>capital ${money(pf.capital)}</p></div>
      <button class="icon-btn accent" data-act="acc-new" aria-label="Nova conta">${icon('plus')}</button></header>
    <section class="card hero">
      <div class="hero-top"><div><div class="lbl">Resultado líquido</div><div class="big num ${rCls(pf.net)}">${money(pf.net, { sign: true })}</div></div>
        <div class="hero-pills">${pf.roi !== null ? `<span class="pill">ROI ${pct(pf.roi, 0, true)}</span>` : ''}${pf.pending > 0 ? `<span class="pill warn">${money(pf.pending)} a receber</span>` : ''}</div></div>
      <div class="split3"><div><span>Recebido</span><b class="num pos">${money(pf.received)}</b></div><div><span>Gastos</span><b class="num neg">${money(-pf.invested)}</b></div><div><span>Saques</span><b class="num">${pf.payoutCount}</b></div></div>
      ${pf.monthly.length >= 2 ? `<div class="cv" style="height:84px"><canvas id="c-net"></canvas></div>` : ''}
    </section>
    <div class="qa"><button data-act="y-new"><i>${icon('coin', 20)}</i>Registrar saque</button><button data-act="e-new"><i>${icon('receipt', 20)}</i>Registrar gasto</button></div>
    <div class="tiles t2">
      <div class="tile"><div class="k">Saldo estimado das ativas</div><div class="v num">${money(pf.balance)}</div><div class="s num ${rCls(pf.openPnl)}">${money(pf.openPnl, { sign: true })} nos trades</div></div>
      <div class="tile"><div class="k">Aprovação nos desafios</div><div class="v num">${pf.passRate !== null ? pct(pf.passRate, 0) : '—'}</div><div class="s">${pf.passed + pf.failed ? `${pf.passed} de ${pf.passed + pf.failed} fases` : 'sem fases encerradas'}</div></div>
      <div class="tile"><div class="k">Contas funded</div><div class="v num">${pf.fundedCount}</div><div class="s">${pf.costPerFunded !== null ? `custo de ${money(pf.costPerFunded)} por funded` : 'sem funded ainda'}</div></div>
      <div class="tile"><div class="k">Investido</div><div class="v num">${money(pf.invested)}</div><div class="s">${AC.expenses.all.length} ${AC.expenses.all.length === 1 ? 'gasto' : 'gastos'}</div></div>
    </div>
    <div class="sec-row"><h3 class="h3">Suas contas</h3><div class="chips mini">
      <button class="chip ${filter === 'ativas' ? 'on' : ''}" data-act="ct-f" data-f="ativas">Ativas ${nAct}</button>
      <button class="chip ${filter === 'hist' ? 'on' : ''}" data-act="ct-f" data-f="hist">Histórico ${nOld}</button></div></div>
    <div class="acards">${shown.map(accountCard).join('') || `<div class="card empty">${filter === 'ativas' ? 'Nenhuma conta ativa.' : 'Nenhuma conta no histórico.'}<button class="btn ghost sm" data-act="acc-new" style="margin-top:12px">Adicionar conta</button></div>`}</div>
    ${pf.monthly.length ? chartCard({ title: 'Fluxo de caixa', sub: 'Recebido e gasto em cada mês, e o líquido acumulado', id: 'c-flow', h: 190,
      legendHtml: legend('c-flow', [{ name: 'Recebido', color: C.up }, { name: 'Gastos', color: C.dn }, { name: 'Líquido acumulado', color: C.acc }]),
      table: tableFrom(pf.monthly.map(m => m.label), [{ name: 'Recebido', data: pf.monthly.map(m => m.rec) }, { name: 'Gastos', data: pf.monthly.map(m => -m.exp) }, { name: 'Líquido acumulado', data: pf.monthly.map(m => m.cum) }], v => money(v)) }) : ''}
    ${firmRows.length ? `<section class="card"><div class="ch-head"><div><h3>Resultado por firma</h3><p class="ch-sub">Recebido menos gasto</p></div></div>${hbars(firmRows, v => money(v, { sign: true }))}</section>` : ''}
    ${kindRows.length ? `<section class="card"><div class="ch-head"><div><h3>Em que você gastou</h3><p class="ch-sub">Total de ${money(pf.invested)}</p></div></div>${hbars(kindRows, v => money(v))}</section>` : ''}
    <section class="card"><div class="sec-head"><h3>Extrato</h3>${led.length > 6 ? `<button class="link" data-act="ledger">Ver tudo</button>` : ''}</div>
      ${led.length ? `<div class="list flat">${led.slice(0, 6).map(r => entryRow(r.k, r.x, r.name)).join('')}</div>` : '<p class="hint">Saques e gastos que você registrar aparecem aqui.</p>'}</section>
    <p class="foot-note">O saldo de cada conta é uma estimativa: tamanho da conta, mais o resultado dos trades marcados nela, mais ajustes, menos saques. Use “Ajustar saldo” na conta para acertar com o saldo real.</p>`;
  drawNet(pf); drawFlow(pf);
}

function drawNet(pf) {
  if (pf.monthly.length < 2) return;
  const data = pf.monthly.map(m => Math.round(m.cum)), col = data[data.length - 1] >= 0 ? C.up : C.dn;
  mount('c-net', { type: 'line', data: { labels: pf.monthly.map(m => m.label), datasets: [lineDs(data, col, { fill: 'start', backgroundColor: wash(col), tension: .15 })] },
    options: { layout: { padding: { right: 50, top: 8, bottom: 2 } }, interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, crosshair: true, endMarks: { dot: true, fmt: v => kfmt(v) }, tooltip: { ...tip(v => money(v, { sign: true })), displayColors: false } },
      scales: { x: { display: false }, y: { display: false, grace: '10%' } } } });
}
function drawFlow(pf) {
  if (!pf.monthly.length) return;
  const m = pf.monthly;
  mount('c-flow', {
    type: 'bar',
    data: { labels: m.map(x => x.label), datasets: [
      { type: 'bar', label: 'Recebido', data: m.map(x => Math.round(x.rec)), backgroundColor: C.up, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 14, order: 2 },
      { type: 'bar', label: 'Gastos', data: m.map(x => -Math.round(x.exp)), backgroundColor: C.dn, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 14, order: 2 },
      lineDs(m.map(x => Math.round(x.cum)), C.acc, { type: 'line', label: 'Líquido acumulado', order: 1, tension: .15 }),
    ] },
    options: { interaction: { intersect: false, mode: 'index' }, layout: { padding: { right: 8, top: 8 } }, plugins: { legend: { display: false }, crosshair: true, tooltip: tip(v => money(v), true) },
      scales: { x: xAxis(), y: yAxis({ ticks: { callback: kfmt } }) } },
  });
}

// ---------- vazio ----------
function emptyHTML() {
  const feat = (ic, t, d) => `<div class="feat"><i>${icon(ic, 20)}</i><div><b>${t}</b><small>${d}</small></div></div>`;
  return `<header class="top"><div><h1>Contas</h1><p class="sub">Prop firms</p></div></header>
    <section class="card welcome">
      <svg viewBox="0 0 240 120" class="ill" aria-hidden="true"><rect x="20" y="52" width="150" height="56" rx="14" fill="#121216" stroke="#1e1e24"/><rect x="34" y="34" width="170" height="60" rx="14" fill="#16161b" stroke="#23232a"/>
        <rect x="48" y="14" width="164" height="64" rx="14" fill="#1b1b21" stroke="#2b2b33"/><circle cx="72" cy="38" r="9" fill="#4f8cff"/><rect x="90" y="30" width="62" height="7" rx="3.5" fill="#f2f2f5" opacity=".85"/><rect x="90" y="43" width="40" height="5" rx="2.5" fill="#8e8e99" opacity=".6"/>
        <rect x="62" y="62" width="136" height="6" rx="3" fill="#4f8cff" opacity=".18"/><rect x="62" y="62" width="82" height="6" rx="3" fill="#00d492"/></svg>
      <h2>Suas contas de prop firm, num lugar só</h2>
      <p class="hint">Cadastre cada conta com tamanho, meta e perda máxima. O app calcula o saldo, quanto falta para a meta e quanto sobra até o limite, a partir dos trades que você marca.</p>
      <button class="btn" data-act="acc-new">Adicionar primeira conta</button></section>
    <section class="card feats">
      ${feat('target', 'Meta, dias mínimos e consistência', 'Veja o que falta para passar cada fase.')}
      ${feat('shield', 'Perda diária e máxima', 'Estática ou trailing, com aviso antes de violar.')}
      ${feat('coin', 'Saques e gastos', 'Resultado líquido, ROI e fluxo de caixa por mês.')}
      ${feat('chart', 'Simulador', 'Chance de passar o desafio com o seu histórico.')}
    </section>`;
}

// ---------- ações ----------
acts['acc-new'] = () => openAccountForm(null, null, (rec, isNew) => { if (isNew) openAccount(rec.id); });
acts.acc = el => openAccount(el.dataset.id);
acts['ct-f'] = el => { filter = el.dataset.f; redraw(); };
acts.ledger = () => {
  let off = () => {};
  const pg = openPage({ title: 'Extrato', cls: 'detail', onClose: () => off() });
  const render = () => {
    const rows = ledger(), byMonth = new Map();
    rows.forEach(r => { const k = (r.date || '').slice(0, 7); (byMonth.get(k) || byMonth.set(k, []).get(k)).push(r); });
    pg.body.innerHTML = `<div class="qa"><button data-act="y-new"><i>${icon('coin', 20)}</i>Registrar saque</button><button data-act="e-new"><i>${icon('receipt', 20)}</i>Registrar gasto</button></div>
      ${[...byMonth.entries()].map(([k, rs]) => { const tot = sum(rs, r => (r.k === 'y' ? AC.payoutReceived(r.x) : -(+r.x.amount || 0))); return `<h4 class="mh"><span>${MONF[+k.slice(5) - 1]} ${k.slice(0, 4)}</span><em class="num ${rCls(tot)}">${money(tot, { sign: true })}</em></h4><div class="card list flat">${rs.map(r => entryRow(r.k, r.x, r.name)).join('')}</div>`; }).join('') || '<div class="empty">Nada registrado ainda.</div>'}`;
  };
  off = (() => { const a = AC.payouts.on(render), b = AC.expenses.on(render); return () => { a(); b(); }; })();
  render();
};
