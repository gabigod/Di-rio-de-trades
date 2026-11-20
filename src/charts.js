// Gráficos: configuração do Chart.js e peças desenhadas em HTML/SVG (anel, medidor, barras).
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, BarController, BarElement, Filler, Tooltip } from 'chart.js';
import { esc, alpha, SERIES, OTHER, C } from './util.js';
import { getSetting, setSetting } from './store.js';
import { acts } from './ui.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, BarController, BarElement, Filler, Tooltip);
const FONT = 'Barlow, -apple-system, BlinkMacSystemFont, Roboto, sans-serif';
Chart.defaults.color = '#8e8e99';
Chart.defaults.font.family = FONT;
Chart.defaults.font.size = 11;
Chart.defaults.animation = false;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#16161b';
Chart.defaults.plugins.tooltip.borderColor = '#2b2b33';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 10;
Chart.defaults.plugins.tooltip.titleColor = '#8e8e99';
Chart.defaults.plugins.tooltip.titleFont = { family: FONT, size: 11, weight: '500' };
Chart.defaults.plugins.tooltip.bodyColor = '#f2f2f5';
Chart.defaults.plugins.tooltip.bodyFont = { family: FONT, size: 13, weight: '600' };
Chart.defaults.plugins.tooltip.boxPadding = 4;

const SURFACE = '#0b0b0e';
const GRID = 'rgba(255,255,255,.06)';

// ---------- plugins próprios ----------
const crosshair = {
  id: 'crosshair',
  afterDatasetsDraw(chart) {
    const a = chart.tooltip && chart.tooltip.getActiveElements && chart.tooltip.getActiveElements();
    if (!a || !a.length || !chart.options.plugins.crosshair) return;
    const { ctx, chartArea: ar } = chart, x = a[0].element.x;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, ar.top); ctx.lineTo(x, ar.bottom); ctx.stroke(); ctx.restore();
  },
};
/** Bolinha de 9 px com anel da cor do fundo no último ponto + valor ao lado (só os rótulos que cabem). */
const endMarks = {
  id: 'endMarks',
  afterDatasetsDraw(chart, _a, opt) {
    if (!opt || !opt.dot) return;
    const { ctx } = chart; const labels = [];
    chart.data.datasets.forEach((ds, i) => {
      if (!chart.isDatasetVisible(i)) return;
      const meta = chart.getDatasetMeta(i); let k = ds.data.length - 1; while (k >= 0 && (ds.data[k] === null || ds.data[k] === undefined)) k--;
      const pt = meta.data[k]; if (!pt) return;
      ctx.save(); ctx.fillStyle = ds.borderColor; ctx.strokeStyle = SURFACE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 4.5, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
      if (opt.fmt) labels.push({ x: pt.x, y: pt.y, text: opt.fmt(ds.data[k], ds) });
    });
    labels.sort((a, b) => a.y - b.y); let lastY = -99;
    ctx.save(); ctx.fillStyle = '#f2f2f5'; ctx.font = `600 11px ${FONT}`; ctx.textBaseline = 'middle';
    labels.forEach(l => { if (l.y - lastY >= 13) { ctx.fillText(l.text, l.x + 9, l.y); lastY = l.y; } });
    ctx.restore();
  },
};
Chart.register(crosshair, endMarks);

// ---------- ciclo de vida ----------
let live = [];
const byId = new Map();
export function destroyCharts() { live.forEach(c => c.destroy()); live = []; byId.clear(); }
/** Gráficos de uma página por cima das abas: some junto com a página, sem mexer nos gráficos de baixo. */
export function chartScope() {
  const mine = [];
  return {
    mount(id, cfg) { const el = document.getElementById(id); if (!el) return null; const c = new Chart(el, cfg); mine.push([id, c]); byId.set(id, c); return c; },
    destroy() { mine.forEach(([id, c]) => { c.destroy(); if (byId.get(id) === c) byId.delete(id); }); mine.length = 0; },
  };
}
export function mount(id, cfg) {
  const el = document.getElementById(id); if (!el) return null;
  const c = new Chart(el, cfg); live.push(c); byId.set(id, c); return c;
}

// ---------- cor estável por nome (a cor segue a entidade, não a posição) ----------
export function colorFor(kind, key) {
  const map = getSetting('colors:' + kind, {});
  if (map[key] === undefined) { map[key] = Object.keys(map).length; setSetting('colors:' + kind, map); }
  return map[key] < SERIES.length ? SERIES[map[key]] : OTHER;
}

// ---------- ajustes padrão dos eixos ----------
const tickFont = { family: FONT, size: 11 };
export function xAxis(o = {}) {
  return { grid: { display: false }, border: { color: '#23232a' }, ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 12, maxTicksLimit: 6, font: tickFont, color: '#8e8e99', ...o.ticks }, ...o.rest };
}
const MON3 = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** Rótulos do eixo para datas dd/mm/aa: "Ago/25" quando o período passa de 2 meses, "20/08" quando é curto. */
export function dateTicks(labels) {
  const p = s => { const m = /^(\d\d)\/(\d\d)\/(\d\d)$/.exec(s || ''); return m ? { d: +m[1], m: +m[2], y: +m[3] } : null; };
  const a = p(labels[0]), b = p(labels[labels.length - 1]);
  const months = a && b ? (b.y - a.y) * 12 + (b.m - a.m) : 99;
  return {
    maxTicksLimit: 5,
    callback(v, i, ticks) {
      const l = this.getLabelForValue(v), x = p(l); if (!x) return l;
      if (months <= 4) return `${String(x.d).padStart(2, '0')}/${String(x.m).padStart(2, '0')}`;
      const prev = i > 0 && ticks && ticks[i - 1] ? p(this.getLabelForValue(ticks[i - 1].value)) : null;
      if (prev && prev.m === x.m && prev.y === x.y) return '';
      return `${MON3[x.m - 1]}/${String(x.y).padStart(2, '0')}`;
    },
  };
}
export function yAxis(o = {}) {
  return {
    grid: { color: ctx => (ctx.tick && ctx.tick.value === 0 ? 'rgba(255,255,255,.2)' : GRID), lineWidth: 1, drawTicks: false },
    border: { display: false }, ticks: { font: tickFont, color: '#8e8e99', padding: 6, maxTicksLimit: 5, ...o.ticks }, ...o.rest,
  };
}
/** Preenchimento suave (um véu de 14% que some para baixo). */
export const wash = color => ctx => {
  const { chart } = ctx; const ar = chart.chartArea; if (!ar) return null;
  const g = chart.ctx.createLinearGradient(0, ar.top, 0, ar.bottom); g.addColorStop(0, alpha(color, .16)); g.addColorStop(1, alpha(color, 0)); return g;
};
/** Véu que fica mais forte para baixo (curvas de queda, que preenchem a partir do topo). */
export const washDown = color => ctx => {
  const { chart } = ctx; const ar = chart.chartArea; if (!ar) return null;
  const g = chart.ctx.createLinearGradient(0, ar.top, 0, ar.bottom); g.addColorStop(0, alpha(color, 0)); g.addColorStop(1, alpha(color, .2)); return g;
};
export const lineDs = (data, color, o = {}) => ({ data, borderColor: color, borderWidth: 2, borderCapStyle: 'round', borderJoinStyle: 'round', pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: color, pointHoverBorderColor: SURFACE, pointHoverBorderWidth: 2, tension: .2, ...o });
export const barDs = (data, colors, o = {}) => ({ data, backgroundColor: colors, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22, ...o });
/** Dica ao tocar: valor em destaque, nome menor; traço da cor da série em vez de caixa. */
export const tip = (fmt, multi = false) => ({
  displayColors: multi, usePointStyle: true, pointStyle: 'line', boxWidth: 14, boxHeight: 2,
  callbacks: { label: c => (multi ? ` ${c.dataset.label}: ` : ' ') + fmt(c.parsed.y !== undefined ? c.parsed.y : c.parsed) },
});

// ---------- peças em HTML / SVG ----------
/** Anel de progresso: preenchimento com a cor do estado e trilho em tom mais claro da mesma cor. */
export function ring({ ratio = 0, color = C.acc, size = 92, stroke = 9, value = '', label = '' }) {
  const r = (size - stroke) / 2, len = 2 * Math.PI * r, k = Math.max(0, Math.min(1, ratio));
  return `<div class="ring" style="width:${size}px"><div class="ring-svg" style="height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;stroke-width:${stroke}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${alpha(color, .16)}"/>
    ${k > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-dasharray="${(len * k).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
  </svg><div class="ring-val">${value}</div></div><div class="ring-lbl">${esc(label)}</div></div>`;
}
export const STATE_COLOR = { ok: C.up, warn: C.warn, bad: C.dn, idle: C.acc };
/** Medidor fino: o preenchimento mostra a gravidade; o trilho é a mesma cor mais clara. */
export function meter(ratio, color = C.acc, h = 6) {
  return `<div class="meter" style="height:${h}px;background:${alpha(color, .16)}"><i style="width:${(Math.max(0, Math.min(1, ratio)) * 100).toFixed(1)}%;background:${color}"></i></div>`;
}
/** Barra fina dividida em partes (uma figura com partes que somam o todo). */
export function segBar(parts, h = 8) {
  const tot = parts.reduce((a, p) => a + p.v, 0) || 1;
  return `<div class="seg-bar" style="height:${h}px">${parts.filter(p => p.v > 0).map(p => `<i style="flex:${p.v / tot};background:${p.color}" title="${esc(p.name)}: ${p.v}"></i>`).join('')}</div>`;
}
/** Barras horizontais com eixo no zero: ganhos para a direita (verde), perdas para a esquerda (vermelho). */
export function hbars(rows, fmt) {
  // mesma escala nos dois lados: o zero fica onde a maior perda e o maior ganho se dividem.
  // Só perdas (ex.: gastos): as barras crescem da esquerda, como numa lista de valores.
  const maxP = Math.max(0, ...rows.map(r => r.v)), maxN = Math.max(0, ...rows.map(r => -r.v)), tot = maxP + maxN || 1;
  const onlyNeg = maxP === 0 && maxN > 0;
  const zero = onlyNeg ? 0 : maxN / tot * 100, unit = 100 / tot;
  return `<div class="hbars">${rows.map(r => {
    const w = Math.abs(r.v) * unit;
    const style = r.v >= 0 ? `left:${zero.toFixed(2)}%;width:${w.toFixed(2)}%;background:${C.up}`
      : onlyNeg ? `left:0;width:${w.toFixed(2)}%;background:${C.dn}` : `right:${(100 - zero).toFixed(2)}%;width:${w.toFixed(2)}%;background:${C.dn}`;
    return `<div class="hb-row${r.sub && r.sub.length > 26 ? ' hb-stack' : ''}"${r.act ? ` data-act="${r.act}" data-k="${esc(r.key || r.label)}"` : ''}><div class="hb-name"><span>${esc(r.label)}</span>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</div>
      <div class="hb-val num ${r.v > 0 ? 'pos' : r.v < 0 ? 'neg' : 'mut'}">${fmt(r.v)}</div><div class="hb-track"><b class="hb-zero" style="left:${zero.toFixed(2)}%"></b>${r.v ? `<i style="${style}"></i>` : ''}</div></div>`;
  }).join('')}</div>`;
}
export function spark(values, color = C.acc, w = 64, h = 22) {
  if (values.length < 2) return '';
  const mn = Math.min(...values), mx = Math.max(...values), sp = mx - mn || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * (w - 4) + 2).toFixed(1)},${(h - 3 - (v - mn) / sp * (h - 6)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px;stroke-width:1.8"><polyline points="${pts}" stroke="${color}" fill="none"/></svg>`;
}

// ---------- legenda e tabela de cada gráfico ----------
export function legend(chartId, items) {
  if (items.length < 2) return '';
  return `<div class="lg">${items.map((it, i) => `<button class="lg-i" data-act="lg" data-chart="${chartId}" data-i="${i}"><i style="background:${it.color}"></i>${esc(it.name)}</button>`).join('')}</div>`;
}
acts.lg = el => {
  const c = byId.get(el.dataset.chart); if (!c) return; const i = +el.dataset.i;
  c.setDatasetVisibility(i, !c.isDatasetVisible(i)); c.update(); el.classList.toggle('off', !c.isDatasetVisible(i));
};
/** Todo gráfico tem uma tabela equivalente (alternar no cartão). */
export function tableFrom(labels, series, fmt) {
  const head = series.length > 1 ? `<tr><th></th>${series.map(s => `<th class="num">${esc(s.name)}</th>`).join('')}</tr>` : '';
  return `<table class="tw">${head}${labels.map((l, i) => `<tr><td>${esc(l)}</td>${series.map(s => `<td class="num">${s.data[i] === null || s.data[i] === undefined ? '—' : fmt(s.data[i])}</td>`).join('')}</tr>`).join('')}</table>`;
}
export function chartCard({ title, sub = '', id, h = 190, table = '', legendHtml = '', note = '' }) {
  return `<section class="card ch" data-card>
    <div class="ch-head"><div><h3>${esc(title)}</h3>${sub ? `<p class="ch-sub">${sub}</p>` : ''}</div>${table ? `<button class="tw-btn" data-act="twin" aria-label="Alternar tabela">Tabela</button>` : ''}</div>
    ${legendHtml}<div class="cv" style="height:${h}px"><canvas id="${id}"></canvas></div>${table ? `<div class="tw-wrap" hidden>${table}</div>` : ''}${note ? `<p class="ch-note">${note}</p>` : ''}
  </section>`;
}
acts.twin = el => {
  const card = el.closest('[data-card]'); const show = card.querySelector('.tw-wrap').hidden;
  card.querySelector('.tw-wrap').hidden = !show; card.querySelector('.cv').hidden = show;
  const lg = card.querySelector('.lg'); if (lg) lg.hidden = show;
  el.textContent = show ? 'Gráfico' : 'Tabela';
};
