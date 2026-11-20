// Aba Painel: resultado, calendário, últimas fotos, contas e últimos trades.
import * as D from '../data.js';
import * as A from '../analytics.js';
import * as AC from '../accounts.js';
import * as P from '../photos.js';
import { $, esc, fmtR, fmtDate, rCls, money, pct, num, MON, MONF, WD, sum, todayISO, C, alpha, clamp } from '../util.js';
import { icon } from '../icons.js';
import { acts, openSheet } from '../ui.js';
import { S, yearChips, filtered } from '../state.js';
import { mount, lineDs, wash, tip } from '../charts.js';
import { tradeRow } from './trades.js';
import { accountRow, alertLevel } from './contas.js';

const short = r => fmtR(r, 1).replace(/R$/, '');
const resCls = t => (t.result === 'WIN' ? 'w' : t.result === 'LOSS' ? 'l' : 'b');

let calYM = null;
function calMonth(list) {
  if (!calYM) { const n = new Date(); calYM = [n.getFullYear(), n.getMonth()]; }
  if (S.year !== 'Todos' && String(calYM[0]) !== S.year) {
    const last = [...list].pop();
    calYM = last ? [+last.date.slice(0, 4), +last.date.slice(5, 7) - 1] : [+S.year, 0];
  }
  return calYM;
}

export function renderPainel() {
  const list = filtered(), s = A.stats(list);
  const period = S.year === 'Todos' ? 'todo o histórico' : S.year;
  $('#view').innerHTML = `
    <header class="top">
      <div><h1>Diário</h1><p class="sub">${list.length} trades<i class="sep"></i>${period}</p></div>
      <button class="icon-btn" data-act="settings" aria-label="Ajustes">${icon('gear')}</button>
    </header>
    ${yearChips()}
    ${list.length ? hero(s) + tiles(s) : emptyAll()}
    ${list.length ? `<section class="card cal-card" id="cal-card"></section>` : ''}
    ${photoStrip(list)}
    ${contasGlance()}
    ${list.length ? `<section class="card"><div class="sec-head"><h3>Últimos trades</h3><button class="link" data-act="go" data-v="trades">Ver todos</button></div>
      <div class="list flat">${[...list].slice(-5).reverse().map(tradeRow).join('')}</div></section>` : ''}`;
  if (list.length) { drawHero(s); drawCal(list); }
  P.hydrate($('#view'));
}

function emptyAll() {
  return `<section class="card empty-hero">${icon('image', 34)}<h3>Nenhum trade ainda</h3><p class="hint">Registre o primeiro trade com a foto do gráfico e as estatísticas aparecem aqui.</p>
    <button class="btn" data-act="go" data-v="novo">Registrar trade</button></section>`;
}

// ---------- resultado ----------
function hero(s) {
  const pf = s.pf === Infinity ? '∞' : num(s.pf, 2);
  return `<section class="card hero">
    <div class="hero-top">
      <div><div class="lbl">Resultado acumulado</div><div class="big num ${rCls(s.sumR)}">${fmtR(s.sumR, 1)}</div></div>
      <div class="hero-pills"><span class="pill">${pct(s.winrate, 0)} de acerto</span><span class="pill">${s.wins}W · ${s.losses}L${s.be ? ` · ${s.be}BE` : ''}</span></div>
    </div>
    <div class="cv" style="height:118px"><canvas id="c-hero"></canvas></div>
  </section>`;
}
function drawHero(s) {
  if (s.curve.length < 2) return;
  const data = s.curve.map(c => +c.cum.toFixed(2)), up = data[data.length - 1] >= 0, col = up ? C.up : C.dn;
  mount('c-hero', {
    type: 'line',
    data: { labels: s.curve.map(c => fmtDate(c.date)), datasets: [lineDs(data, col, { fill: true, backgroundColor: wash(col) })] },
    options: {
      layout: { padding: { right: 44, top: 10, bottom: 2 } }, interaction: { intersect: false, mode: 'index' },
      plugins: { legend: { display: false }, crosshair: true, endMarks: { dot: true, fmt: v => fmtR(v, 1) }, tooltip: { ...tip(v => fmtR(v, 1)), displayColors: false } },
      scales: { x: { display: false }, y: { display: false, grace: '8%' } },
    },
  });
}
function tiles(s) {
  const t = (k, v, cls = '', sub = '') => `<div class="tile"><div class="k">${k}</div><div class="v num ${cls}">${v}</div>${sub ? `<div class="s num">${sub}</div>` : ''}</div>`;
  const streak = s.curStreak ? `${Math.abs(s.curStreak)}${s.curStreak > 0 ? 'W' : 'L'}` : '—';
  return `<div class="tiles">
    ${t('Fator de lucro', s.pf === Infinity ? '∞' : num(s.pf, 2), s.pf >= 1 ? 'pos' : 'neg')}
    ${t('Expectativa', fmtR(s.exp), rCls(s.exp), 'por trade')}
    ${t('Perda máxima', s.maxDD ? '−' + num(s.maxDD, 1) + 'R' : '0R', s.maxDD ? 'neg' : 'mut', 'queda do pico')}
    ${t('Ganho médio', s.avgW ? '+' + num(s.avgW, 2) + 'R' : '—', 'pos')}
    ${t('Perda média', s.avgL ? '−' + num(s.avgL, 2) + 'R' : '—', 'neg')}
    ${t('Sequência', streak, rCls(s.curStreak), `máx ${s.bestW}W · ${s.bestL}L`)}
  </div>`;
}

// ---------- calendário ----------
function drawCal(list) {
  const [Y, M] = calMonth(list);
  const byDay = new Map(), cnt = new Map();
  list.forEach(t => { byDay.set(t.date, (byDay.get(t.date) || 0) + (+t.r || 0)); cnt.set(t.date, (cnt.get(t.date) || 0) + 1); });
  const first = new Date(Date.UTC(Y, M, 1)).getUTCDay(), days = new Date(Y, M + 1, 0).getDate();
  const cells = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${Y}-${String(M + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  const today = todayISO();
  let monthR = 0, monthDays = 0, html = '';
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7); let wk = 0, wkHas = false;
    html += row.map(key => {
      if (!key) return '<div class="cd off"></div>';
      const r = byDay.get(key), d = +key.slice(8);
      if (r === undefined) return `<div class="cd${key === today ? ' today' : ''}"><i>${d}</i></div>`;
      wk += r; wkHas = true; monthR += r; monthDays++;
      const a = clamp(.16 + Math.abs(r) / 4 * .42, .16, .58);
      const bg = r > 0 ? alpha(C.up, a) : r < 0 ? alpha(C.dn, a) : 'rgba(142,142,153,.22)';
      return `<button class="cd has${key === today ? ' today' : ''}" style="background:${bg}" data-act="day" data-day="${key}"><i>${d}</i><b class="num">${short(r)}</b></button>`;
    }).join('') + `<div class="cw num ${wkHas ? rCls(wk) : 'mut'}">${wkHas ? short(wk) : ''}</div>`;
  }
  $('#cal-card').innerHTML = `
    <div class="cal-head"><button class="icon-btn sm" data-act="cal" data-d="-1" aria-label="Mês anterior">${icon('back', 18)}</button>
      <div class="cal-title"><b>${MONF[M]} ${Y}</b><span class="num ${rCls(monthR)}">${monthDays ? `${fmtR(monthR, 1)}<i class="sep"></i>${monthDays} ${monthDays === 1 ? 'dia' : 'dias'}` : 'sem trades'}</span></div>
      <button class="icon-btn sm" data-act="cal" data-d="1" aria-label="Próximo mês">${icon('chev', 18)}</button></div>
    <div class="cal"><div class="cal-dow">${WD.map(w => `<span>${w}</span>`).join('')}<span>Sem</span></div>${html}</div>`;
}
acts.cal = el => {
  const list = filtered(); let [Y, M] = calMonth(list); M += +el.dataset.d;
  if (M < 0) { M = 11; Y--; } else if (M > 11) { M = 0; Y++; }
  calYM = [Y, M]; drawCal(list);
};
acts.day = el => {
  const day = el.dataset.day, ts = filtered().filter(t => t.date === day);
  const r = sum(ts, t => +t.r || 0);
  const body = openSheet(`<div class="sheet-head"><h2>${fmtDate(day)}</h2><span class="num big-s ${rCls(r)}">${fmtR(r)}</span></div>
    <div class="list flat">${ts.map(tradeRow).join('')}</div>`);
  P.hydrate(body);
};

// ---------- últimas fotos ----------
function photoStrip(list) {
  const ts = [...list].reverse().filter(t => (t.photos || []).length).slice(0, 10);
  if (ts.length < 2) return '';
  return `<section class="card strip-card"><div class="sec-head"><h3>Últimas fotos</h3><button class="link" data-act="go-gallery">Galeria</button></div>
    <div class="strip">${ts.map(t => `<button class="sp" data-act="trade" data-id="${t._id}">${P.imgTag(t.photos[0], { thumb: true })}
      <span class="sp-r num ${resCls(t)}">${short(+t.r || 0)}</span><span class="sp-a">${esc(t.asset)}</span></button>`).join('')}</div></section>`;
}
acts['go-gallery'] = () => { S.mode = 'gallery'; acts.go({ dataset: { v: 'trades' } }); };

// ---------- contas ----------
function contasGlance() {
  const accs = AC.accounts.all;
  if (!accs.length) {
    return `<section class="card cta" data-act="go" data-v="contas">
      <div class="cta-ic">${icon('cards', 26)}</div>
      <div><h3>Suas contas de prop firm</h3><p class="hint">Regras, metas, saques e gastos de cada conta num lugar só, com gráficos.</p></div>
      <span class="cta-go">${icon('chev', 20)}</span></section>`;
  }
  const pf = AC.portfolio();
  const rank = { bad: 0, warn: 1, ok: 2 };
  const act = pf.states.filter(s => s.acc.status === 'ativa').sort((a, b) => rank[alertLevel(a)] - rank[alertLevel(b)]);
  return `<section class="card"><div class="sec-head"><h3>Contas</h3><button class="link" data-act="go" data-v="contas">Ver todas</button></div>
    <div class="kv2"><div><span>Líquido (saques − gastos)</span><b class="num ${rCls(pf.net)}">${money(pf.net, { sign: true })}</b></div>
      <div><span>Contas ativas</span><b class="num">${pf.activeCount}</b></div></div>
    <div class="list flat">${act.slice(0, 3).map(accountRow).join('') || '<p class="hint">Nenhuma conta ativa.</p>'}</div>
    ${act.length > 3 ? `<button class="link center" data-act="go" data-v="contas">+ ${act.length - 3} contas ativas</button>` : ''}</section>`;
}
