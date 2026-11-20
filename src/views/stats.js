// Aba Stats: Resumo, Tempo, Setups e Disciplina. Todo gráfico tem tabela equivalente.
import * as D from '../data.js';
import * as A from '../analytics.js';
import { $, esc, fmtR, fmtDate, rCls, pct, num, MON, WD, dow, sum, C, alpha, clamp, daysBetween } from '../util.js';
import { icon } from '../icons.js';
import { acts } from '../ui.js';
import { setSetting } from '../store.js';
import { S, yearChips, filtered } from '../state.js';
import { destroyCharts, mount, colorFor, xAxis, yAxis, dateTicks, wash, washDown, lineDs, barDs, tip, legend, tableFrom, chartCard, segBar, hbars } from '../charts.js';
import { confList, tagList } from './form.js';

const TABS = [['resumo', 'Resumo'], ['tempo', 'Tempo'], ['setups', 'Setups'], ['disc', 'Disciplina']];
const tk = v => (v === 0 ? '0' : (v > 0 ? '+' : '−') + num(Math.abs(v), Math.abs(v) % 1 ? 1 : 0));
const short = r => fmtR(r, 1).replace(/R$/, '');
const sgn = v => (v > 0 ? C.up : v < 0 ? C.dn : C.neutral);
const GRIDLESS = { grid: { display: false } };

export function renderStats() {
  $('#view').innerHTML = `
    <header class="top"><div><h1>Estatísticas</h1><p class="sub" id="st-sub"></p></div></header>
    ${yearChips()}
    <div class="seg2 tabs4" id="st-tabs">${TABS.map(([k, t]) => `<button data-act="st-tab" data-t="${k}" class="${S.statsTab === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div id="st-body"></div>`;
  fill();
}
function fill() {
  destroyCharts();
  const list = filtered();
  $('#st-sub').innerHTML = `${list.length} trades<i class="sep"></i>${S.year === 'Todos' ? 'todo o histórico' : S.year}`;
  const body = $('#st-body');
  if (!list.length) { body.innerHTML = need('Sem trades neste período', 'Escolha outro ano ou registre um trade para ver os gráficos.'); return; }
  const out = ({ resumo, tempo, setups, disc }[S.statsTab] || resumo)(list);
  body.innerHTML = out.html; if (out.draw) out.draw();
}
acts['st-tab'] = el => {
  S.statsTab = el.dataset.t; setSetting('statsTab', S.statsTab);
  document.querySelectorAll('#st-tabs button').forEach(b => b.classList.toggle('on', b === el));
  fill(); $('#view').scrollTop = 0;
};
const toTrades = (key, val, q = false) => {
  Object.keys(S.F).forEach(k => { S.F[k] = ''; }); S.q = '';
  if (q) S.q = val; else S.F[key] = val;
  acts.go({ dataset: { v: 'trades' } });
};
acts['flt-strat'] = el => toTrades('strat', el.dataset.k);
acts['flt-cat'] = el => toTrades('cat', el.dataset.k);
acts['flt-asset'] = el => toTrades('', el.dataset.k, true);

// ---------- peças ----------
const need = (title, text) => `<section class="card need"><div class="need-ic">${icon('info', 20)}</div><div><h3>${title}</h3><p class="hint">${text}</p></div></section>`;
const kv = rows => `<div class="kvl">${rows.map(([k, v, c = '']) => `<div><span>${k}</span><b class="num ${c}">${v}</b></div>`).join('')}</div>`;
const cellTxt = v => { const r = Math.round(v); return r === 0 ? '0' : (r > 0 ? '+' : '−') + Math.abs(r); };
acts.mcell = el => {
  const y = el.dataset.y, m = +el.dataset.m, v = +el.dataset.v;
  const n = filtered().filter(t => t.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, '0')}`).length;
  document.querySelectorAll('.mg > button.sel').forEach(b => b.classList.remove('sel')); el.classList.add('sel');
  $('#mg-read').innerHTML = `<b>${MON[m]}/${y}</b> <span class="num ${rCls(v)}">${fmtR(v, 2)}</span><i class="sep"></i>${n} ${n === 1 ? 'trade' : 'trades'}`;
};
const card = (title, inner, sub = '') => `<section class="card"><div class="ch-head"><div><h3>${title}</h3>${sub ? `<p class="ch-sub">${sub}</p>` : ''}</div></div>${inner}</section>`;
const rowsOf = (groups, act) => groups.map(g => ({ label: g.key, key: g.key, sub: `${g.n} ${g.n === 1 ? 'trade' : 'trades'} · ${pct(g.winrate, 0)} de acerto`, v: +g.sumR.toFixed(2), act: act && g.key !== '—' ? act : '' }));
const lineBase = (fmtTip, extra = {}, xt = {}) => ({
  interaction: { intersect: false, mode: 'index' }, layout: { padding: { right: 50, top: 8 } },
  plugins: { legend: { display: false }, crosshair: true, tooltip: { ...tip(fmtTip), displayColors: false } },
  scales: { x: xAxis({ ticks: xt }), y: yAxis({ ticks: { callback: tk } }) }, ...extra,
});
const barBase = (fmtTip, extra = {}) => ({
  plugins: { legend: { display: false }, tooltip: { ...tip(fmtTip), displayColors: false } },
  scales: { x: xAxis(), y: yAxis({ ticks: { callback: tk } }) }, ...extra,
});

// ================= RESUMO =================
function resumo(list) {
  const s = A.stats(list);
  const labels = s.curve.map(c => fmtDate(c.date));
  const eq = s.curve.map(c => +c.cum.toFixed(2)), dd = s.curve.map(c => -+c.dd.toFixed(2));
  const eqCol = (eq[eq.length - 1] || 0) >= 0 ? C.up : C.dn;
  // distribuição dos R em faixas de meio R
  const b2 = list.map(t => Math.round((+t.r || 0) * 2));
  const lo = Math.min(...b2), hi = Math.max(...b2), hk = [], hv = [];
  for (let b = lo; b <= hi; b++) { hk.push(b / 2); hv.push(b2.filter(x => x === b).length); }
  const months = new Set(list.map(t => t.date.slice(0, 7)));
  const span = list.length ? Math.max(1, Math.round(daysBetween(list[0].date, list[list.length - 1].date) / 30.4) + 1) : 1;
  const last30 = list.slice(-30);
  const html = `
    ${chartCard({ title: 'Curva de capital', sub: `R acumulado<i class="sep"></i><span class="num ${rCls(s.sumR)}">${fmtR(s.sumR, 1)}</span>`, id: 'c-eq', h: 210, table: tableFrom(labels, [{ name: 'R acumulado', data: eq }], v => fmtR(v, 1)) })}
    ${chartCard({ title: 'Queda desde o pico', sub: `Pior momento <span class="num neg">${s.maxDD ? '−' + num(s.maxDD, 1) + 'R' : '0R'}</span>`, id: 'c-dd', h: 130, table: tableFrom(labels, [{ name: 'Queda', data: dd }], v => fmtR(v, 1)) })}
    ${card('Resultados', `${segBar([{ v: s.wins, color: C.up, name: 'Ganhos' }, { v: s.be, color: C.neutral, name: 'Empates' }, { v: s.losses, color: C.dn, name: 'Perdas' }], 10)}
      <div class="trio"><div><i style="background:${C.up}"></i><span>Ganhos</span><b class="num">${s.wins}</b></div><div><i style="background:${C.neutral}"></i><span>Empates</span><b class="num">${s.be}</b></div><div><i style="background:${C.dn}"></i><span>Perdas</span><b class="num">${s.losses}</b></div></div>`)}
    ${chartCard({ title: 'Distribuição dos resultados', sub: 'Quantos trades em cada faixa de R', id: 'c-hist', h: 150, table: tableFrom(hk.map(k => short(k)), [{ name: 'Trades', data: hv }], v => String(v)) })}
    ${card('Últimos 30 resultados', `<div class="dots">${last30.map(t => `<i style="background:${t.result === 'WIN' ? C.up : t.result === 'LOSS' ? C.dn : C.neutral}" title="${esc(t.asset)} ${fmtDate(t.date)} ${fmtR(+t.r || 0)}"></i>`).join('')}</div>
      <p class="hint" style="margin-top:10px">Do mais antigo para o mais recente.</p>`)}
    ${card('Números principais', kv([
      ['Taxa de acerto', pct(s.winrate, 1)], ['Fator de lucro', s.pf === Infinity ? '∞' : num(s.pf, 2), s.pf >= 1 ? 'pos' : 'neg'],
      ['Expectativa por trade', fmtR(s.exp), rCls(s.exp)], ['Ganho médio', s.avgW ? '+' + num(s.avgW, 2) + 'R' : '—', 'pos'], ['Perda média', s.avgL ? '−' + num(s.avgL, 2) + 'R' : '—', 'neg'],
      ['Ganho ÷ perda média', s.avgL ? num(s.avgW / s.avgL, 2) + ' : 1' : '—'], ['Maior sequência de ganhos', s.bestW], ['Maior sequência de perdas', s.bestL],
      ['Trades por mês', num(list.length / span, 1)], ['Meses operados', months.size],
    ]))}`;
  const draw = () => {
    mount('c-eq', { type: 'line', data: { labels, datasets: [lineDs(eq, eqCol, { fill: true, backgroundColor: wash(eqCol) })] }, options: lineBase(v => fmtR(v, 1), { plugins: { legend: { display: false }, crosshair: true, endMarks: { dot: true, fmt: v => short(v) }, tooltip: { ...tip(v => fmtR(v, 1)), displayColors: false } } }, dateTicks(labels)) });
    mount('c-dd', { type: 'line', data: { labels, datasets: [lineDs(dd, C.dn, { fill: true, backgroundColor: washDown(C.dn) })] }, options: lineBase(v => fmtR(v, 1), { scales: { x: { ...xAxis(), display: false }, y: yAxis({ ticks: { callback: tk }, rest: { max: 0 } }) } }) });
    mount('c-hist', { type: 'bar', data: { labels: hk.map(k => short(k)), datasets: [barDs(hv, hk.map(k => sgn(k)))] }, options: barBase(v => `${v} ${v === 1 ? 'trade' : 'trades'}`, { scales: { x: xAxis({ ticks: { autoSkip: false, callback: (_v, i) => (hk.length > 10 && hk[i] % 1 ? '' : short(hk[i])) } }), y: yAxis({ ticks: { precision: 0 } }) } }) });
  };
  return { html, draw };
}

// ================= TEMPO =================
function tempo(list) {
  const monthly = {}; list.forEach(t => { const k = t.date.slice(0, 7); monthly[k] = (monthly[k] || 0) + (+t.r || 0); });
  const mk = Object.keys(monthly).sort(), multi = new Set(mk.map(k => k.slice(0, 4))).size > 1;
  const mLabels = mk.map(k => MON[+k.slice(5) - 1] + (multi ? '/' + k.slice(2, 4) : '')), mVals = mk.map(k => +monthly[k].toFixed(2));
  const avgM = mVals.length ? sum(mVals) / mVals.length : 0, pos = mVals.filter(v => v > 0).length;
  const g = A.monthlyGrid(list), gmax = Math.max(...Object.values(g.cells).map(Math.abs), 1);
  const wd = [1, 2, 3, 4, 5].map(i => ({ label: WD[i], ...A.stats(list.filter(t => dow(t.date) === i)) }));
  const wdTable = `<table class="tw"><tr><th></th><th class="num">Trades</th><th class="num">Acerto</th><th class="num">R</th></tr>${wd.map(w => `<tr><td>${w.label}</td><td class="num">${w.n}</td><td class="num">${w.closed ? pct(w.winrate, 0) : '—'}</td><td class="num">${fmtR(w.sumR, 1)}</td></tr>`).join('')}</table>`;
  const roll = A.rolling(list, 20), dur = A.durations(list);
  const html = `
    ${chartCard({ title: 'Resultado por mês', sub: `Média <span class="num ${rCls(avgM)}">${fmtR(avgM, 1)}</span> por mês<i class="sep"></i>${pos} de ${mVals.length} no positivo`, id: 'c-mon', h: 170, table: tableFrom(mLabels, [{ name: 'R', data: mVals }], v => fmtR(v, 1)) })}
    ${card('Calendário de resultados', `<div class="mg"><span></span>${MON.map(m => `<em>${m[0]}</em>`).join('')}
      ${g.years.map(y => `<b class="y">${y}</b>${MON.map((_, m) => { const v = g.cells[`${y}-${m}`]; if (v === undefined) return '<i></i>'; const a = clamp(.14 + Math.abs(v) / gmax * .5, .14, .64); return `<button class="num" data-act="mcell" data-y="${y}" data-m="${m}" data-v="${v}" style="background:${alpha(v >= 0 ? C.up : C.dn, a)}">${cellTxt(v)}</button>`; }).join('')}`).join('')}</div>
      <p class="mg-read" id="mg-read">${g.years.map(y => `<b>${y}</b> <span class="num ${rCls(g.tot[y])}">${fmtR(g.tot[y], 1)}</span>`).join('<i class="sep"></i>')}</p>`, 'Cada quadrado é um mês. Toque para ver os detalhes.')}
    ${chartCard({ title: 'Por dia da semana', sub: 'R somado em cada dia', id: 'c-wd', h: 150, table: wdTable })}
    ${roll.length >= 5 ? chartCard({ title: 'Expectativa móvel', sub: 'R médio por trade nas últimas 20 operações', id: 'c-roll', h: 170, table: tableFrom(roll.map(r => fmtDate(r.date)), [{ name: 'R por trade', data: roll.map(r => +r.exp.toFixed(2)) }], v => fmtR(v)) })
      : need('Expectativa móvel', 'Aparece quando houver pelo menos 25 trades no período.')}
    ${dur.n >= 3 ? card('Tempo no trade', `<div class="tiles t3"><div class="tile"><div class="k">Média</div><div class="v num">${num(dur.avg, 1)}d</div><div class="s">${dur.n} trades</div></div>
      <div class="tile"><div class="k">Ganhos</div><div class="v num pos">${dur.nW ? num(dur.avgW, 1) + 'd' : '—'}</div><div class="s">${dur.nW} trades</div></div>
      <div class="tile"><div class="k">Perdas</div><div class="v num neg">${dur.nL ? num(dur.avgL, 1) + 'd' : '—'}</div><div class="s">${dur.nL} trades</div></div></div>`, 'Dias entre abrir e fechar')
      : need('Tempo no trade', 'Preencha “Abriu em” nos próximos trades (em Mais detalhes) para ver quanto tempo você fica posicionado.')}`;
  const draw = () => {
    mount('c-mon', { type: 'bar', data: { labels: mLabels, datasets: [barDs(mVals, mVals.map(sgn))] }, options: barBase(v => fmtR(v, 1)) });
    mount('c-wd', { type: 'bar', data: { labels: wd.map(w => w.label), datasets: [barDs(wd.map(w => +w.sumR.toFixed(2)), wd.map(w => sgn(w.sumR)))] }, options: barBase(v => fmtR(v, 1)) });
    if (roll.length >= 5) mount('c-roll', { type: 'line', data: { labels: roll.map(r => fmtDate(r.date)), datasets: [lineDs(roll.map(r => +r.exp.toFixed(2)), C.acc)] }, options: lineBase(v => fmtR(v), { plugins: { legend: { display: false }, crosshair: true, endMarks: { dot: true, fmt: v => short(v) }, tooltip: { ...tip(v => fmtR(v)), displayColors: false } } }, dateTicks(roll.map(r => fmtDate(r.date)))) });
  };
  return { html, draw };
}

// ================= SETUPS =================
function setups(list) {
  const byS = A.groupBy(list, t => t.strategy).sort((a, b) => b.sumR - a.sumR);
  [...byS].sort((a, b) => b.n - a.n).forEach(x => colorFor('strat', x.key));
  const cg = A.cumByGroup(list, t => t.strategy, 5);
  const ser = cg.series.map(x => ({ ...x, color: colorFor('strat', x.key) }));
  const byC = A.groupBy(list, t => t.category).sort((a, b) => b.sumR - a.sumR);
  const assets = A.groupBy(list, t => t.asset).filter(a => a.n >= 2).sort((a, b) => b.sumR - a.sumR);
  const assetRows = assets.length > 10 ? [...assets.slice(0, 5), ...assets.slice(-5)] : assets;
  const byD = A.groupBy(list, t => (t.dir === 'BUY' ? 'Compra' : t.dir === 'SELL' ? 'Venda' : '')).filter(x => x.key !== '—').sort((a, b) => b.sumR - a.sumR);
  const conf = A.flagStats(list, 'conf', confList()), cc = A.byConfCount(list);
  const cell = (st) => (st.n ? `<span class="num ${rCls(st.exp)}">${fmtR(st.exp, 2)}</span><small>${st.n}</small>` : '<span class="mut">—</span>');
  const html = `
    ${ser.length > 1 && cg.labels.length > 1 ? chartCard({ title: 'Evolução por estratégia', sub: 'R acumulado mês a mês', id: 'c-str', h: 210, legendHtml: legend('c-str', ser.map(x => ({ name: x.key, color: x.color }))), table: tableFrom(cg.labels, ser.map(x => ({ name: x.key, data: x.data })), v => fmtR(v, 1)) }) : ''}
    ${card('Por estratégia', hbars(rowsOf(byS, 'flt-strat'), v => fmtR(v, 1)), 'Toque para ver os trades')}
    ${byC.length > 1 || (byC[0] && byC[0].key !== '—') ? card('Por categoria', hbars(rowsOf(byC, 'flt-cat'), v => fmtR(v, 1))) : ''}
    ${assetRows.length ? card('Melhores e piores ativos', hbars(rowsOf(assetRows, 'flt-asset'), v => fmtR(v, 1)), assets.length > 10 ? 'Cinco melhores e cinco piores, com 2 trades ou mais' : 'Ativos com 2 trades ou mais') : ''}
    ${byD.length ? card('Compra e venda', hbars(rowsOf(byD), v => fmtR(v, 1))) : ''}
    ${conf.analyzed >= 5 && conf.rows.length ? card('Confluências', `<table class="cmp"><tr><th></th><th>Com</th><th>Sem</th></tr>
        ${conf.rows.sort((a, b) => (b.w.exp - b.wo.exp)).map(r => `<tr><td>${esc(r.name)}</td><td>${cell({ ...r.w, n: r.w.closed })}</td><td>${cell({ ...r.wo, n: r.wo.closed })}</td></tr>`).join('')}</table>`, `R por trade, com e sem a confluência marcada (${conf.analyzed} trades analisados)`)
      : need('Confluências', 'Marque as confluências em cada trade (Mais detalhes) e aqui você vê quais realmente melhoram o resultado. Aparece com 5 trades marcados.')}
    ${cc.length >= 2 ? chartCard({ title: 'Quantas confluências', sub: 'R por trade conforme o número de marcações', id: 'c-cc', h: 150, table: tableFrom(cc.map(x => x.key), [{ name: 'R por trade', data: cc.map(x => +x.exp.toFixed(2)) }, { name: 'Trades', data: cc.map(x => x.n) }], v => String(v)) }) : ''}`;
  const draw = () => {
    if (ser.length > 1 && cg.labels.length > 1) mount('c-str', {
      type: 'line', data: { labels: cg.labels, datasets: ser.map(x => lineDs(x.data, x.color, { label: x.key })) },
      options: { interaction: { intersect: false, mode: 'index' }, layout: { padding: { right: 50, top: 8 } }, plugins: { legend: { display: false }, crosshair: true, endMarks: { dot: true, fmt: v => short(v) }, tooltip: tip(v => fmtR(v, 1), true) }, scales: { x: xAxis(), y: yAxis({ ticks: { callback: tk } }) } },
    });
    if (cc.length >= 2) mount('c-cc', { type: 'bar', data: { labels: cc.map(x => x.key), datasets: [barDs(cc.map(x => +x.exp.toFixed(2)), cc.map(x => sgn(x.exp)))] }, options: barBase(v => fmtR(v) + ' por trade') });
  };
  return { html, draw };
}

// ================= DISCIPLINA =================
function disc(list) {
  const s = A.stats(list);
  const reviewed = list.filter(t => Array.isArray(t.tags));
  const withErr = reviewed.filter(t => t.tags.length), clean = reviewed.filter(t => !t.tags.length);
  const eS = A.stats(withErr), cS = A.stats(clean);
  const tagRows = tagList().map(name => { const ts = withErr.filter(t => t.tags.includes(name)); const st = A.stats(ts); return { name, n: ts.length, sumR: st.sumR, exp: st.exp, winrate: st.winrate }; })
    .filter(x => x.n).sort((a, b) => a.sumR - b.sumR);
  const sd = A.streakDist(list), maxK = Math.max(s.bestL, s.bestW, 1);
  const ks = Array.from({ length: Math.min(maxK, 12) }, (_, i) => i + 1);
  const q = s.closed ? s.losses / s.closed : 0;
  const waits = [3, 4, 5, 6, 8].map(k => ({ k, w: A.expectedWait(q, k) }));
  const worst100 = q > 0 && q < 1 ? Math.max(1, Math.round(Math.log(100 * (1 - q)) / Math.log(1 / q))) : 0;
  const mfe = A.mfeStats(list);
  const gr = A.groupBy(list.filter(t => t.grade), t => t.grade).sort((a, b) => a.key.localeCompare(b.key));
  const md = A.groupBy(list.filter(t => t.mood), t => t.mood).map(m => { const mo = D.MOODS.find(x => x.k === m.key); return { ...m, label: mo ? `${mo.e} ${mo.t}` : m.key }; }).sort((a, b) => b.exp - a.exp);
  const html = `
    ${reviewed.length >= 5 ? card('Custo dos erros', `
        <div class="tiles t2"><div class="tile"><div class="k">Sem erro marcado</div><div class="v num ${rCls(cS.exp)}">${clean.length ? fmtR(cS.exp) : '—'}</div><div class="s">${clean.length} trades · por trade</div></div>
          <div class="tile"><div class="k">Com erro marcado</div><div class="v num ${rCls(eS.exp)}">${withErr.length ? fmtR(eS.exp) : '—'}</div><div class="s">${withErr.length} trades · por trade</div></div></div>
        ${tagRows.length ? `<div style="margin-top:14px">${hbars(tagRows.map(r => ({ label: r.name, sub: `${r.n} ${r.n === 1 ? 'trade' : 'trades'} · ${fmtR(r.exp, 2)} por trade`, v: +r.sumR.toFixed(2) })), v => fmtR(v, 1))}</div>` : ''}`, 'R somado dos trades em que cada erro foi marcado')
      : need('Custo dos erros', 'Marque erros como FOMO ou “Moveu o stop” nos trades (Mais detalhes). Com 5 trades revisados você vê quanto cada erro custa.')}
    ${list.some(t => t.result === 'LOSS' || t.result === 'WIN') ? chartCard({ title: 'Sequências', sub: `Quantas vezes cada tamanho de sequência aconteceu`, id: 'c-streak', h: 160, legendHtml: legend('c-streak', [{ name: 'Perdas seguidas', color: C.dn }, { name: 'Ganhos seguidos', color: C.up }]), table: tableFrom(ks.map(String), [{ name: 'Perdas seguidas', data: ks.map(k => sd.loss[k] || 0) }, { name: 'Ganhos seguidos', data: ks.map(k => sd.win[k] || 0) }], v => String(v)) }) : ''}
    ${q > 0 && s.closed >= 10 ? card('Quando vem uma sequência ruim', `${kv([['Chance de perder um trade', pct(q * 100, 0)], ['Maior sequência de perdas até agora', `${s.bestL} ${s.bestL === 1 ? 'trade' : 'trades'}`], ...(worst100 ? [['Em 100 trades, esperar até', `~${worst100} perdas seguidas`]] : [])])}
      <table class="cmp" style="margin-top:12px"><tr><th>Perdas seguidas</th><th>Aparece em média a cada</th></tr>${waits.map(x => `<tr><td>${x.k}</td><td class="num">${x.w > 5000 ? 'mais de 5 mil trades' : '~' + num(Math.round(x.w), 0) + ' trades'}</td></tr>`).join('')}</table>`, 'Calculado com a sua taxa de perda; serve para dimensionar o risco por trade')
      : ''}
    ${mfe.n >= 3 ? card('O que ficou na mesa', `<div class="tiles t3"><div class="tile"><div class="k">Ganhos deixaram</div><div class="v num warn">${num(mfe.left, 2)}R</div><div class="s">em média (${mfe.nW})</div></div>
        <div class="tile"><div class="k">Perdas chegaram a</div><div class="v num">${mfe.nL ? '+' + num(mfe.loserAvg, 2) + 'R' : '—'}</div><div class="s">antes de virar (${mfe.nL})</div></div>
        <div class="tile"><div class="k">Perdas com +1R</div><div class="v num">${mfe.loserWent1}</div><div class="s">de ${mfe.nL}</div></div></div>`, 'Baseado no campo “Chegou a” (máximo a favor)')
      : need('O que ficou na mesa', 'Preencha “Chegou a” (quantos R o trade chegou a ter a favor) para ver quanto os ganhos deixaram e quantas perdas já estiveram no lucro.')}
    ${gr.length ? card('Qualidade da execução', hbars(gr.map(x => ({ label: `Nota ${x.key}`, sub: `${x.n} trades · ${fmtR(x.exp, 2)} por trade`, v: +x.sumR.toFixed(2) })), v => fmtR(v, 1)), 'R somado por nota de execução') : ''}
    ${md.length ? card('Estado emocional', hbars(md.map(x => ({ label: x.label, sub: `${x.n} trades · ${fmtR(x.exp, 2)} por trade`, v: +x.sumR.toFixed(2) })), v => fmtR(v, 1)), 'R somado conforme como você estava ao entrar')
      : need('Qualidade e estado emocional', 'Dê uma nota à execução e marque como estava ao entrar (Mais detalhes) para descobrir em quais dias você opera melhor.')}`;
  const draw = () => {
    if ($('#c-streak')) mount('c-streak', {
      type: 'bar', data: { labels: ks.map(String), datasets: [barDs(ks.map(k => sd.loss[k] || 0), C.dn, { label: 'Perdas seguidas', maxBarThickness: 14 }), barDs(ks.map(k => sd.win[k] || 0), C.up, { label: 'Ganhos seguidos', maxBarThickness: 14 })] },
      options: { plugins: { legend: { display: false }, tooltip: tip(v => `${v} ${v === 1 ? 'vez' : 'vezes'}`, true) }, scales: { x: xAxis({ ticks: { autoSkip: false } }), y: yAxis({ ticks: { precision: 0 } }) } },
    });
  };
  return { html, draw };
}
