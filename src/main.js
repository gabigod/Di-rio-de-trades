import './style.css';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, BarController, BarElement, DoughnutController, ArcElement, Filler, Tooltip } from 'chart.js';
import * as D from './data.js';
import { App as CapApp } from '@capacitor/app';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, BarController, BarElement, DoughnutController, ArcElement, Filler, Tooltip);
Chart.defaults.color = '#8e8e99';
Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, Roboto, sans-serif';
Chart.defaults.font.size = 10.5;
Chart.defaults.animation = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#1c1c22';
Chart.defaults.plugins.tooltip.borderColor = '#2a2a32';
Chart.defaults.plugins.tooltip.borderWidth = 1;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UP = '#00d492', DOWN = '#ff4d67', ACC = '#4f8cff', MUT = '#8e8e99';
const rCls = v => v > 0 ? 'pos' : v < 0 ? 'neg' : 'mut';
let charts = [];
function chart(id, cfg) { const el = $('#' + id); if (!el) return; charts.push(new Chart(el, cfg)); }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2000); }
function grad(ctx, color, h = 180) { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00'); return g; }

// ---------- filtro por ano ----------
let year = 'Todos';
function filtered() { return year === 'Todos' ? D.trades : D.trades.filter(t => t.date.startsWith(year)); }
function yearChips(cur, fn) {
  return `<div class="chips">${['Todos', ...D.years()].map(y => `<button class="chip ${y === cur ? 'on' : ''}" data-y="${y}">${y}</button>`).join('')}</div>`;
}
function bindYear(root, rerender) {
  root.querySelectorAll('[data-y]').forEach(b => b.onclick = () => { year = b.dataset.y; rerender(); });
}

// ---------- navegação ----------
const views = {};
let cur = 'painel';
function go(v) {
  cur = v; charts.forEach(c => c.destroy()); charts = [];
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  views[v]();
  $('#view').scrollTop = 0;
}
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => go(b.dataset.v));

// ---------- modal ----------
function openSheet(html) { $('#sheet').innerHTML = html; $('#modal').hidden = false; return $('#sheet'); }
function closeSheet() { $('#modal').hidden = true; $('#sheet').innerHTML = ''; }
$('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal') closeSheet(); });

// ========== PAINEL ==========
views.painel = () => {
  const list = filtered(); const s = D.stats(list);
  const last5 = [...list].slice(-5).reverse();
  $('#view').innerHTML = `
    <h1>Diário de Trades<small>${list.length} trades · ${year === 'Todos' ? 'todo o histórico' : year}</small></h1>
    ${yearChips(year)}
    <div class="card hero">
      <div class="sub">Resultado acumulado</div>
      <div class="big num ${rCls(s.sumR)}">${D.fmtR(s.sumR)}</div>
      <div class="sub num">Winrate ${s.winrate.toFixed(1)}% · ${s.wins}W / ${s.losses}L${s.be ? ' / ' + s.be + 'BE' : ''}</div>
      <canvas id="c-spark" height="110"></canvas>
    </div>
    <div class="grid3">
      <div class="tile"><div class="k">Fator de lucro</div><div class="v num">${s.pf === Infinity ? '∞' : s.pf.toFixed(2)}</div></div>
      <div class="tile"><div class="k">Expectativa</div><div class="v num ${rCls(s.exp)}">${s.exp.toFixed(2)}R</div></div>
      <div class="tile"><div class="k">Drawdown máx.</div><div class="v num neg">${s.maxDD.toFixed(1)}R</div></div>
      <div class="tile"><div class="k">Ganho médio</div><div class="v num pos">+${s.avgW.toFixed(2)}R</div></div>
      <div class="tile"><div class="k">Perda média</div><div class="v num neg">−${s.avgL.toFixed(2)}R</div></div>
      <div class="tile"><div class="k">Sequência</div><div class="v num ${rCls(s.curStreak)}">${Math.abs(s.curStreak)}${s.curStreak >= 0 ? 'W' : 'L'}</div><div class="s num">máx ${s.bestW}W · ${s.bestL}L</div></div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="cal-head"><button id="cal-prev">‹</button><b id="cal-title"></b><button id="cal-next">›</button></div>
      <div class="cal" id="cal"></div>
    </div>
    <div class="card">
      <h3>Últimos trades</h3>
      ${last5.map(trow).join('') || '<div class="empty">Nenhum trade ainda.</div>'}
    </div>`;
  bindYear($('#view'), views.painel);
  // sparkline
  const pts = s.curve.map(c => c.cum);
  if (pts.length > 1) {
    const el = $('#c-spark'); const up = pts[pts.length - 1] >= 0;
    chart('c-spark', { type: 'line', data: { labels: pts.map((_, i) => i), datasets: [{ data: pts, borderColor: up ? UP : DOWN, borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: grad(el.getContext('2d'), up ? UP : DOWN, 110), tension: .25 }] },
      options: { plugins: { tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, interaction: { intersect: false } } });
  }
  calendar(list);
  bindRows($('#view'));
};

let calYM = null;
function calendar(list) {
  const byDay = new Map();
  list.forEach(t => byDay.set(t.date, (byDay.get(t.date) || 0) + (+t.r || 0)));
  const now = new Date();
  if (!calYM) calYM = [now.getFullYear(), now.getMonth()];
  if (year !== 'Todos' && String(calYM[0]) !== year) calYM = [+year, calYM[1]];
  const [Y, M] = calYM;
  $('#cal-title').textContent = D.MON[M] + ' ' + Y;
  const first = new Date(Date.UTC(Y, M, 1)).getUTCDay();
  const days = new Date(Y, M + 1, 0).getDate();
  let html = D.WD.map(w => `<div class="dow">${w[0]}</div>`).join('');
  for (let i = 0; i < first; i++) html += '<div class="d off"></div>';
  for (let d = 1; d <= days; d++) {
    const key = `${Y}-${String(M + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const r = byDay.get(key);
    let bg = '';
    if (r !== undefined) {
      const a = Math.min(1, .25 + Math.abs(r) / 4);
      bg = `style="background:${r > 0 ? `rgba(0,212,146,${a * .5})` : r < 0 ? `rgba(255,77,103,${a * .5})` : 'rgba(142,142,153,.25)'}"`;
    }
    html += `<div class="d ${r !== undefined ? 'has' : ''}" ${bg} ${r !== undefined ? `data-day="${key}"` : ''}>${d}</div>`;
  }
  $('#cal').innerHTML = html;
  $('#cal').querySelectorAll('[data-day]').forEach(el => el.onclick = () => {
    const day = el.dataset.day;
    const dias = list.filter(t => t.date === day);
    const sum = dias.reduce((a, t) => a + (+t.r || 0), 0);
    const sh = openSheet(`<h2>${D.fmtDate(day)} · <span class="${rCls(sum)} num">${D.fmtR(sum)}</span></h2>` + dias.map(trow).join(''));
    bindRows(sh);
  });
  $('#cal-prev').onclick = () => { calYM = M ? [Y, M - 1] : [Y - 1, 11]; calendar(list); };
  $('#cal-next').onclick = () => { calYM = M < 11 ? [Y, M + 1] : [Y + 1, 0]; calendar(list); };
}

// ========== TRADES ==========
function trow(t) {
  const r = +t.r || 0;
  const cls = t.result === 'WIN' ? 'w' : t.result === 'LOSS' ? 'l' : 'b';
  return `<div class="trow" data-id="${t._id}">
    <div class="ric ${cls}">${t.result === 'WIN' ? 'W' : t.result === 'LOSS' ? 'L' : 'BE'}</div>
    <div class="mid"><div class="a">${esc(t.asset)}${t.dir ? ` <span class="mut" style="font-size:11px">${t.dir === 'BUY' ? 'Compra' : t.dir === 'SELL' ? 'Venda' : esc(t.dir)}</span>` : ''}</div>
    <div class="b2">${esc(t.strategy || '')}${t.category ? ' · ' + esc(t.category) : ''}</div></div>
    <div class="r"><div class="rr num ${rCls(r)}">${D.fmtR(r)}</div><div class="dt num">${D.fmtDate(t.date)}</div></div>
  </div>`;
}
let tq = '';
views.trades = () => {
  const list = filtered().filter(t => {
    if (!tq) return true; const q = tq.toLowerCase();
    return [t.asset, t.strategy, t.category, t.result, t.notes, t.date].join(' ').toLowerCase().includes(q);
  });
  const sum = list.reduce((a, t) => a + (+t.r || 0), 0);
  $('#view').innerHTML = `
    <h1>Trades<small>${list.length} trades · <span class="${rCls(sum)}">${D.fmtR(sum)}</span></small></h1>
    ${yearChips(year)}
    <input class="search" id="tq" placeholder="Buscar ativo, estratégia, nota…" value="${esc(tq)}">
    <div class="card">${[...list].reverse().map(trow).join('') || '<div class="empty">Nada encontrado.</div>'}</div>`;
  bindYear($('#view'), views.trades);
  const inp = $('#tq');
  inp.oninput = () => { tq = inp.value; clearTimeout(inp._t); inp._t = setTimeout(views.trades, 250); };
  inp.onfocus = e => e.target.setSelectionRange(tq.length, tq.length);
  if (tq) inp.focus();
  bindRows($('#view'));
};
function bindRows(root) {
  root.querySelectorAll('.trow').forEach(el => el.onclick = () => {
    const t = D.trades.find(x => x._id === el.dataset.id); if (t) editSheet(t);
  });
}

// ========== NOVO / EDITAR ==========
function tradeForm(t = {}) {
  const assets = D.uniq('asset').slice(0, 30), strats = D.uniq('strategy'), cats = D.uniq('category');
  return `
    <div class="row2">
      <label class="fld"><span>Data</span><input class="inp" id="f-date" type="date" value="${t.date || new Date().toISOString().slice(0, 10)}"></label>
      <label class="fld"><span>Ativo</span><input class="inp" id="f-asset" value="${esc(t.asset || '')}" placeholder="EURUSD" autocapitalize="characters"></label>
    </div>
    <div class="qchips" style="margin:-6px 0 12px">${assets.slice(0, 12).map(a => `<button data-fa="${esc(a)}">${esc(a)}</button>`).join('')}</div>
    <div class="fld"><span>Resultado</span>
      <div class="seg" id="f-res">
        <button class="w ${t.result === 'WIN' ? 'on' : ''}" data-r="WIN">WIN</button>
        <button class="l ${t.result === 'LOSS' ? 'on' : ''}" data-r="LOSS">LOSS</button>
        <button class="b ${t.result === 'BE' ? 'on' : ''}" data-r="BE">BE</button>
      </div></div>
    <div class="fld"><span>Direção</span>
      <div class="seg" id="f-dir">
        <button class="c ${t.dir === 'BUY' ? 'on' : ''}" data-d="BUY">Compra</button>
        <button class="c ${t.dir === 'SELL' ? 'on' : ''}" data-d="SELL">Venda</button>
      </div></div>
    <div class="fld"><span>Resultado em R</span>
      <div class="stepper">
        <button id="f-minus">−</button>
        <input class="inp num" id="f-r" type="number" step="0.1" value="${t.r ?? ''}" placeholder="0">
        <button id="f-plus">+</button>
      </div></div>
    <div class="row2">
      <label class="fld"><span>Estratégia</span><input class="inp" id="f-strat" value="${esc(t.strategy || '')}" list="dl-s"><datalist id="dl-s">${strats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
      <label class="fld"><span>Categoria</span><input class="inp" id="f-cat" value="${esc(t.category || '')}" list="dl-c"><datalist id="dl-c">${cats.map(x => `<option value="${esc(x)}">`).join('')}</datalist></label>
    </div>
    <label class="fld"><span>Link do print (TradingView)</span><input class="inp" id="f-link" value="${esc(t.link || '')}" inputmode="url" placeholder="https://…"></label>
    <label class="fld"><span>Notas</span><textarea class="inp" id="f-notes">${esc(t.notes || '')}</textarea></label>`;
}
function bindForm(root) {
  root.querySelectorAll('[data-fa]').forEach(b => b.onclick = () => root.querySelector('#f-asset').value = b.dataset.fa);
  root.querySelectorAll('#f-res button').forEach(b => b.onclick = () => {
    root.querySelectorAll('#f-res button').forEach(x => x.classList.toggle('on', x === b));
    const r = root.querySelector('#f-r');
    if (b.dataset.r === 'LOSS' && !r.value) r.value = -1;
    if (b.dataset.r === 'BE') r.value = 0;
  });
  root.querySelectorAll('#f-dir button').forEach(b => b.onclick = () => {
    const was = b.classList.contains('on');
    root.querySelectorAll('#f-dir button').forEach(x => x.classList.remove('on'));
    if (!was) b.classList.add('on');
  });
  const r = root.querySelector('#f-r');
  root.querySelector('#f-minus').onclick = () => r.value = (Math.round(((+r.value || 0) - .5) * 10) / 10);
  root.querySelector('#f-plus').onclick = () => r.value = (Math.round(((+r.value || 0) + .5) * 10) / 10);
}
function readForm(root) {
  const v = id => root.querySelector(id).value.trim();
  const res = root.querySelector('#f-res .on')?.dataset.r || '';
  const dir = root.querySelector('#f-dir .on')?.dataset.d || '';
  if (!v('#f-asset')) { toast('Falta o ativo'); return null; }
  if (!res) { toast('Marque WIN, LOSS ou BE'); return null; }
  return { date: v('#f-date'), asset: v('#f-asset').toUpperCase(), dir, result: res, r: +root.querySelector('#f-r').value || 0,
    strategy: v('#f-strat'), category: v('#f-cat').toUpperCase(), link: v('#f-link'), notes: v('#f-notes') };
}
views.novo = () => {
  $('#view').innerHTML = `<h1>Novo trade</h1><div class="card">${tradeForm()}</div><button class="btn" id="f-save">Salvar trade</button>`;
  const root = $('#view'); bindForm(root);
  $('#f-save').onclick = () => { const t = readForm(root); if (!t) return; D.add(t); toast('Trade salvo ✓'); go('painel'); };
};
function editSheet(t) {
  const sh = openSheet(`<h2>${esc(t.asset)} · ${D.fmtDate(t.date)}</h2>${tradeForm(t)}
    <button class="btn ghost" style="margin-bottom:10px" id="f-chart">Ver no gráfico (Gráficos FX)</button>
    ${t.link ? `<button class="btn ghost" style="margin-bottom:10px" id="f-open">Abrir print do trade</button>` : ''}
    <div class="btns-r"><button class="btn danger" id="f-del">Apagar</button><button class="btn" id="f-upd">Salvar</button></div>`);
  bindForm(sh);
  sh.querySelector('#f-open')?.addEventListener('click', () => window.open(t.link, '_blank'));
  sh.querySelector('#f-chart').onclick = () => {
    location.href = 'graficosfx://open?symbol=' + encodeURIComponent((t.asset || '').replace(/[^A-Za-z0-9]/g, '')) +
      '&date=' + t.date + '&result=' + encodeURIComponent(t.result || '') + '&r=' + encodeURIComponent(t.r ?? '');
    setTimeout(() => toast('Precisa do app Gráficos FX instalado'), 1200);
  };
  sh.querySelector('#f-upd').onclick = () => { const p = readForm(sh); if (!p) return; D.update(t._id, p); closeSheet(); toast('Atualizado ✓'); go(cur); };
  sh.querySelector('#f-del').onclick = () => { if (confirm('Apagar este trade?')) { D.remove(t._id); closeSheet(); toast('Apagado'); go(cur); } };
}

// ========== STATS ==========
views.stats = () => {
  const list = filtered(); const s = D.stats(list);
  const monthly = {}; list.forEach(t => { const k = t.date.slice(0, 7); monthly[k] = (monthly[k] || 0) + (+t.r || 0); });
  const mk = Object.keys(monthly).sort();
  const wd = [1, 2, 3, 4, 5].map(i => ({ label: D.WD[i], ...D.stats(list.filter(t => D.dow(t.date) === i)) }));
  const hist = {}; list.forEach(t => { const b = Math.round((+t.r || 0) * 2) / 2; hist[b] = (hist[b] || 0) + 1; });
  const hk = Object.keys(hist).map(Number).sort((a, b) => a - b);
  const tbl = (title, rows) => `
    <div class="card"><h3>${title}</h3><table><tr><th></th><th class="num">Trades</th><th class="num">Win%</th><th class="num">R</th></tr>
    ${rows.sort((a, b) => b.sumR - a.sumR).map(g => `<tr><td>${esc(g.key)}<div class="bar"><i style="width:${Math.min(100, Math.abs(g.sumR) / Math.max(...rows.map(x => Math.abs(x.sumR)), 1) * 100)}%;background:${g.sumR >= 0 ? UP : DOWN}"></i></div></td>
      <td class="num">${g.n}</td><td class="num">${g.winrate.toFixed(0)}%</td><td class="num ${rCls(g.sumR)}">${D.fmtR(g.sumR)}</td></tr>`).join('')}</table></div>`;
  $('#view').innerHTML = `
    <h1>Estatísticas<small>${list.length} trades · ${year === 'Todos' ? 'todo o histórico' : year}</small></h1>
    ${yearChips(year)}
    <div class="card"><h3>Curva de capital (R)</h3><canvas id="c-eq" height="170"></canvas></div>
    <div class="card"><h3>Drawdown (R)</h3><canvas id="c-dd" height="110"></canvas></div>
    <div class="card"><h3>Resultado por mês</h3><canvas id="c-mon" height="160"></canvas></div>
    <div class="grid2">
      <div class="card" style="margin:0"><h3>Win / Loss</h3><canvas id="c-donut" height="150"></canvas></div>
      <div class="card" style="margin:0"><h3>Por dia da semana</h3><canvas id="c-wd" height="150"></canvas></div>
    </div>
    <div class="card" style="margin-top:12px"><h3>Distribuição dos R</h3><canvas id="c-hist" height="140"></canvas></div>
    <div class="card"><h3>Últimos 30 resultados</h3><div class="streak-dots">${list.slice(-30).map(t => `<i style="background:${t.result === 'WIN' ? UP : t.result === 'LOSS' ? DOWN : '#3a3a42'}"></i>`).join('')}</div></div>
    ${tbl('Por estratégia', D.groupBy(list, t => t.strategy))}
    ${tbl('Por categoria', D.groupBy(list, t => t.category))}
    ${tbl('Por ativo', D.groupBy(list, t => t.asset))}
    ${tbl('Por direção', D.groupBy(list, t => t.dir === 'BUY' ? 'Compra' : t.dir === 'SELL' ? 'Venda' : 'Sem direção'))}`;
  bindYear($('#view'), views.stats);
  const eqEl = $('#c-eq');
  chart('c-eq', { type: 'line', data: { labels: s.curve.map(c => D.fmtDate(c.date)), datasets: [{ data: s.curve.map(c => c.cum), borderColor: ACC, borderWidth: 2, pointRadius: 0, fill: true, backgroundColor: grad(eqEl.getContext('2d'), ACC, 170), tension: .2 }] },
    options: { scales: { x: { ticks: { maxTicksLimit: 5, maxRotation: 0 } }, y: { grid: { color: 'rgba(255,255,255,.05)' } } }, plugins: { tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + 'R' } } }, interaction: { intersect: false, mode: 'index' } } });
  chart('c-dd', { type: 'line', data: { labels: s.curve.map(c => D.fmtDate(c.date)), datasets: [{ data: s.curve.map(c => -c.dd), borderColor: DOWN, borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: grad($('#c-dd').getContext('2d'), DOWN, 110), tension: .2 }] },
    options: { scales: { x: { display: false }, y: { grid: { color: 'rgba(255,255,255,.05)' } } }, plugins: { tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + 'R' } } }, interaction: { intersect: false, mode: 'index' } } });
  chart('c-mon', { type: 'bar', data: { labels: mk.map(k => D.MON[+k.slice(5) - 1] + (year === 'Todos' ? '/' + k.slice(2, 4) : '')), datasets: [{ data: mk.map(k => monthly[k]), backgroundColor: mk.map(k => monthly[k] >= 0 ? UP : DOWN), borderRadius: 5 }] },
    options: { scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } }, y: { grid: { color: 'rgba(255,255,255,.05)' } } }, plugins: { tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + 'R' } } } } });
  chart('c-donut', { type: 'doughnut', data: { labels: ['Win', 'Loss', 'BE'], datasets: [{ data: [s.wins, s.losses, s.be], backgroundColor: [UP, DOWN, '#3a3a42'], borderWidth: 0 }] },
    options: { cutout: '68%', plugins: { tooltip: { enabled: true } } } });
  chart('c-wd', { type: 'bar', data: { labels: wd.map(x => x.label), datasets: [{ data: wd.map(x => x.sumR), backgroundColor: wd.map(x => x.sumR >= 0 ? UP : DOWN), borderRadius: 5 }] },
    options: { scales: { y: { grid: { color: 'rgba(255,255,255,.05)' } } }, plugins: { tooltip: { callbacks: { label: c => c.parsed.y.toFixed(1) + 'R' } } } } });
  chart('c-hist', { type: 'bar', data: { labels: hk.map(k => k + 'R'), datasets: [{ data: hk.map(k => hist[k]), backgroundColor: hk.map(k => k > 0 ? UP : k < 0 ? DOWN : '#3a3a42'), borderRadius: 4 }] },
    options: { scales: { y: { grid: { color: 'rgba(255,255,255,.05)' }, ticks: { precision: 0 } } } } });
};

// ========== CONFIG ==========
views.config = () => {
  $('#view').innerHTML = `
    <h1>Ajustes</h1>
    <div class="card"><h3>Dados</h3>
      <p class="hint">${D.trades.length} trades salvos neste aparelho. Faça backup de vez em quando — se o app for desinstalado, os dados vão junto.</p>
      <button class="btn ghost" id="cfg-exp" style="margin:10px 0">Exportar backup (copiar)</button>
      <button class="btn ghost" id="cfg-share" style="margin-bottom:10px">Compartilhar backup (.json)</button>
      <button class="btn ghost" id="cfg-imp">Importar backup</button>
    </div>
    <div class="card"><h3>Sobre</h3>
      <p class="hint">Diário de Trades · feito para registrar e analisar operações em R.<br>Os dados ficam só no seu aparelho.</p>
    </div>`;
  $('#cfg-exp').onclick = async () => {
    const txt = JSON.stringify(D.trades);
    try { await navigator.clipboard.writeText(txt); toast('Backup copiado ✓'); }
    catch { prompt('Copie o backup:', txt); }
  };
  $('#cfg-share').onclick = async () => {
    try {
      const file = new File([JSON.stringify(D.trades, null, 1)], `diario-trades-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
      await navigator.share({ files: [file], title: 'Backup do Diário de Trades' });
    } catch { toast('Use o botão de copiar'); }
  };
  $('#cfg-imp').onclick = () => {
    const sh = openSheet(`<h2>Importar backup</h2>
      <p class="hint">Cole aqui o conteúdo do backup. Isso substitui os trades atuais.</p>
      <textarea class="inp" id="imp-txt" style="min-height:140px;margin:10px 0"></textarea>
      <button class="btn" id="imp-go">Importar</button>`);
    sh.querySelector('#imp-go').onclick = () => {
      try {
        const d = JSON.parse(sh.querySelector('#imp-txt').value);
        if (!Array.isArray(d) || !d.every(t => t.date && t.asset)) throw 0;
        D.replaceAll(d); closeSheet(); toast(`${d.length} trades importados ✓`); go('painel');
      } catch { toast('Backup inválido'); }
    };
  };
};

// ---------- botão voltar ----------
try {
  CapApp.addListener('backButton', () => {
    if (!$('#modal').hidden) closeSheet();
    else if (cur !== 'painel') go('painel');
    else CapApp.minimizeApp();
  });
} catch { /* navegador */ }

go('painel');
window.__app = { D, go };
