// Aba Trades: lista, galeria de fotos, detalhe do trade e edição.
import * as D from '../data.js';
import * as A from '../analytics.js';
import * as AC from '../accounts.js';
import * as P from '../photos.js';
import { $, esc, fmtR, fmtDate, fmtDMY, rCls, money, pct, MONF, clamp, daysBetween, sum } from '../util.js';
import { icon } from '../icons.js';
import { acts, toast, openSheet, openPage, confirmSheet } from '../ui.js';
import { openLightbox } from '../lightbox.js';
import { S, saveMode, filtered, yearChips, redraw } from '../state.js';
import { formHTML, bindForm } from './form.js';

const dirName = d => (d === 'BUY' ? 'Compra' : d === 'SELL' ? 'Venda' : '');
const price = v => String(v).replace('.', ',');
const resCls = t => (t.result === 'WIN' ? 'w' : t.result === 'LOSS' ? 'l' : 'b');

// ---------- peças compartilhadas ----------
export function thumbCell(t) {
  const p = (t.photos || [])[0];
  if (p) return `<div class="tc has ${resCls(t)}" data-act="photo" data-id="${t._id}" data-i="0">${P.imgTag(p, { thumb: true })}${t.photos.length > 1 ? `<span class="tc-n">${t.photos.length}</span>` : ''}</div>`;
  return `<div class="tc ${resCls(t)}"><b>${t.result === 'WIN' ? 'W' : t.result === 'LOSS' ? 'L' : 'BE'}</b></div>`;
}
export function tradeRow(t) {
  const r = +t.r || 0;
  return `<div class="trow" data-act="trade" data-id="${t._id}">
    ${thumbCell(t)}
    <div class="mid"><div class="a">${esc(t.asset)}${t.dir ? `<span class="dir ${t.dir === 'BUY' ? 'buy' : 'sell'}">${dirName(t.dir)}</span>` : ''}</div>
      <div class="b2">${esc(t.strategy || 'Sem estratégia')}${t.category ? `<i class="sep"></i>${esc(t.category)}` : ''}</div></div>
    <div class="r"><div class="rr num ${rCls(r)}">${fmtR(r)}</div><div class="dt num">${fmtDate(t.date)}</div></div>
  </div>`;
}
function galleryCard(t, cols) {
  const p = t.photos[0], r = +t.r || 0;
  const ar = cols === 2 ? 1.5 : p.w && p.h ? clamp(p.w / p.h, 1.25, 2.2) : 1.85;
  return `<article class="gc c${cols}" data-act="trade" data-id="${t._id}">
    <div class="gc-ph" style="aspect-ratio:${ar.toFixed(3)}" data-act="photo" data-id="${t._id}" data-i="0">${P.imgTag(p, { thumb: cols === 2 })}
      <span class="gc-r num ${resCls(t)}">${fmtR(r)}</span>${t.photos.length > 1 ? `<span class="gc-n">${icon('image', 13)}${t.photos.length}</span>` : ''}</div>
    <div class="gc-m"><div class="gc-a"><b>${esc(t.asset)}</b>${t.dir ? `<span class="dir ${t.dir === 'BUY' ? 'buy' : 'sell'}">${dirName(t.dir)}</span>` : ''}</div><span class="num">${fmtDate(t.date)}</span></div>
    ${cols === 1 ? `<div class="gc-s">${esc(t.strategy || '')}</div>` : ''}
  </article>`;
}

// ---------- filtros ----------
function applyFilters(list) {
  const q = S.q.trim().toLowerCase(), F = S.F;
  return list.filter(t => {
    if (q && ![t.asset, t.strategy, t.category, t.result, t.notes, t.date, ...(t.conf || []), ...(t.tags || [])].join(' ').toLowerCase().includes(q)) return false;
    if (F.res && t.result !== F.res) return false;
    if (F.strat && t.strategy !== F.strat) return false;
    if (F.cat && t.category !== F.cat) return false;
    if (F.acc && !(t.alloc || []).some(a => a.acc === F.acc)) return false;
    if (F.photo === 'with' && !(t.photos || []).length) return false;
    if (F.photo === 'without' && (t.photos || []).length) return false;
    return true;
  });
}
const activeFilters = () => Object.values(S.F).filter(Boolean).length;

// ---------- aba ----------
export function renderTrades() {
  $('#view').innerHTML = `
    <header class="top"><div><h1>Trades</h1><p class="sub" id="tr-sub"></p></div></header>
    ${yearChips()}
    <div class="sbar">
      <label class="search">${icon('zoom', 18)}<input id="tq" placeholder="Buscar ativo, estratégia, nota" value="${esc(S.q)}" autocomplete="off"></label>
      <button class="icon-btn sq" data-act="t-filter" aria-label="Filtros">${icon('sliders')}<b class="badge" id="tr-badge" hidden></b></button>
    </div>
    <div class="seg2" id="tr-mode">
      <button data-act="t-mode" data-m="list" class="${S.mode === 'list' ? 'on' : ''}">${icon('rows', 18)}Lista</button>
      <button data-act="t-mode" data-m="gallery" class="${S.mode === 'gallery' ? 'on' : ''}">${icon('image', 18)}Galeria</button>
    </div>
    <div id="tr-list"></div>`;
  let t0; $('#tq').oninput = e => { S.q = e.target.value; clearTimeout(t0); t0 = setTimeout(fill, 180); };
  fill();
}
function fill() {
  const box = $('#tr-list'); if (!box) return;
  const base = filtered(), list = applyFilters(base);
  const gallery = S.mode === 'gallery';
  const shown = gallery ? list.filter(t => (t.photos || []).length) : list;
  const total = sum(list, t => +t.r || 0);
  $('#tr-sub').innerHTML = `${list.length} trades<i class="sep"></i><span class="${rCls(total)}">${fmtR(total)}</span>`;
  const b = $('#tr-badge'); const n = activeFilters(); b.hidden = !n; b.textContent = n;
  $$mode();
  if (!shown.length) {
    box.innerHTML = `<div class="empty">${list.length ? 'Nenhum trade com foto nesse filtro.' : 'Nenhum trade encontrado.'}${activeFilters() || S.q ? '<button class="btn ghost sm" data-act="t-clear" style="margin-top:12px">Limpar filtros</button>' : ''}</div>`;
    return;
  }
  const months = new Map();
  [...shown].reverse().forEach(t => { const k = t.date.slice(0, 7); (months.get(k) || months.set(k, []).get(k)).push(t); });
  const cols = S.cols === 2 ? 2 : 1;
  box.innerHTML = [...months.entries()].map(([k, ts]) => {
    const s = sum(ts, t => +t.r || 0);
    return `<h4 class="mh"><span>${MONF[+k.slice(5) - 1]} ${k.slice(0, 4)}</span><em class="num ${rCls(s)}">${fmtR(s)}</em></h4>` +
      (gallery ? `<div class="gal c${cols}">${ts.map(t => galleryCard(t, cols)).join('')}</div>` : `<div class="card list">${ts.map(tradeRow).join('')}</div>`);
  }).join('') + (gallery && list.length > shown.length ? `<p class="hint center">${list.length - shown.length} trade(s) sem foto não aparecem na galeria.</p>` : '');
  P.hydrate(box);
}
function $$mode() {
  document.querySelectorAll('#tr-mode button').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
  let c = $('#tr-cols'); const bar = document.querySelector('.sbar');
  if (S.mode === 'gallery' && bar) {
    if (!c) { c = document.createElement('button'); c.id = 'tr-cols'; c.className = 'icon-btn sq'; c.dataset.act = 't-cols'; c.setAttribute('aria-label', 'Tamanho das fotos'); bar.appendChild(c); }
    c.innerHTML = icon(S.cols === 2 ? 'rows' : 'grid');
  } else if (c) c.remove();
}
acts['t-mode'] = el => { S.mode = el.dataset.m; saveMode(); fill(); };
acts['t-cols'] = () => { S.cols = S.cols === 2 ? 1 : 2; saveMode(); fill(); };
acts['t-clear'] = () => { S.q = ''; Object.keys(S.F).forEach(k => { S.F[k] = ''; }); renderTrades(); };
acts['t-filter'] = () => {
  const strats = Object.entries(D.countBy('strategy')).sort((a, b) => b[1] - a[1]).map(x => x[0]), cats = D.uniq('category');
  const body = openSheet('<div id="flt"></div>');
  const draw = () => {
    const grp = (title, key, opts) => `<div class="fld"><span>${title}</span><div class="qchips pick">${opts.map(([v, l]) => `<button type="button" class="${S.F[key] === v ? 'on' : ''}" data-k="${key}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div></div>`;
    body.querySelector('#flt').innerHTML = `<h2>Filtros</h2>
      ${grp('Resultado', 'res', [['', 'Todos'], ['WIN', 'Ganho'], ['LOSS', 'Perda'], ['BE', 'Empate']])}
      ${grp('Fotos', 'photo', [['', 'Todos'], ['with', 'Com foto'], ['without', 'Sem foto']])}
      ${strats.length ? grp('Estratégia', 'strat', [['', 'Todas'], ...strats.map(s => [s, s])]) : ''}
      ${cats.length ? grp('Categoria', 'cat', [['', 'Todas'], ...cats.map(s => [s, s])]) : ''}
      ${AC.accounts.all.length ? grp('Conta', 'acc', [['', 'Todas'], ...AC.accounts.all.map(a => [a.id, a.name])]) : ''}
      <div class="btns-r"><button class="btn ghost" id="flt-clear">Limpar</button><button class="btn" id="flt-ok">Ver trades</button></div>`;
    body.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { S.F[b.dataset.k] = b.dataset.v; draw(); fill(); });
    body.querySelector('#flt-clear').onclick = () => { Object.keys(S.F).forEach(k => { S.F[k] = ''; }); draw(); fill(); };
    body.querySelector('#flt-ok').onclick = () => body.close();
  };
  draw();
};
acts.photo = el => {
  const t = D.byId(el.dataset.id); if (!t || !(t.photos || []).length) return;
  openLightbox(t.photos, +el.dataset.i || 0, { title: `${t.asset} · ${fmtDate(t.date)}` });
};
acts.trade = el => openTradeDetail(el.dataset.id);

// ---------- detalhe ----------
const fact = (k, v) => (v ? `<div class="fact"><span>${k}</span><b>${v}</b></div>` : '');
function detailHTML(t) {
  const r = +t.r || 0, ph = t.photos || [];
  const has = k => t[k] !== undefined && t[k] !== null && t[k] !== '';
  const rr = A.plannedRR({ dir: t.dir, entry: t.entry, stop: t.stop, target: t.target });
  const dur = t.openDate && t.date >= t.openDate ? daysBetween(t.openDate, t.date) : null;
  const mood = D.MOODS.find(m => m.k === t.mood);
  const left = has('mfe') && t.result === 'WIN' && +t.mfe > r ? +t.mfe - r : 0;
  const al = (t.alloc || []).map(a => { const acc = AC.accounts.get(a.acc); return acc ? { acc, a, pnl: AC.tradePnl(t, acc) } : null; }).filter(Boolean);
  const hasLink = D.TV_RE.test(t.link || '');
  const photos = ph.length
    ? `<div class="pcar" id="pcar">${ph.map((x, i) => `<figure class="pslide" data-act="photo" data-id="${t._id}" data-i="${i}">${P.imgTag(x, {})}<figcaption>${esc(x.label || 'Foto')}</figcaption></figure>`).join('')}</div>
       ${ph.length > 1 ? `<div class="pdots">${ph.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}`
    : `<div class="no-photo">${icon('image', 30)}<p>${hasLink ? 'Esse trade tem um link do TradingView, mas ainda não virou foto.' : 'Sem foto neste trade.'}</p>
         ${hasLink ? `<button class="btn ghost sm" data-act="t-getlink" data-id="${t._id}">Baixar o print do link</button>` : `<button class="btn ghost sm" data-act="t-edit" data-id="${t._id}">Adicionar foto</button>`}</div>`;
  const facts = [
    fact('Estratégia', esc(t.strategy || '')), fact('Categoria', esc(t.category || '')),
    fact('Abriu em', t.openDate ? `${fmtDMY(t.openDate)}${dur !== null ? ` <small>(${dur} ${dur === 1 ? 'dia' : 'dias'})</small>` : ''}` : ''),
    fact('Entrada', has('entry') ? price(t.entry) : ''), fact('Stop', has('stop') ? price(t.stop) : ''),
    fact('Alvo', has('target') ? price(t.target) : ''), fact('Saída', has('exit') ? price(t.exit) : ''),
    fact('Planejado', rr !== null ? `1 : ${price(Math.round(rr * 100) / 100)}` : ''),
    fact('Chegou a', has('mfe') ? `${fmtR(+t.mfe)}${left > 0.05 ? ` <small>deixou ${price(Math.round(left * 10) / 10)}R</small>` : ''}` : ''),
    fact('Qualidade', t.grade ? esc(t.grade) : ''), fact('Estado', mood ? `${mood.e} ${mood.t}` : ''),
  ].join('');
  return `
    <section class="d-photos">${photos}</section>
    <section class="d-head">
      <div><div class="d-asset">${esc(t.asset)}${t.dir ? `<span class="dir ${t.dir === 'BUY' ? 'buy' : 'sell'}">${dirName(t.dir)}</span>` : ''}</div>
        <div class="d-date">${fmtDMY(t.date)}<i class="sep"></i><span class="res ${resCls(t)}">${t.result === 'BE' ? 'Empate' : t.result === 'WIN' ? 'Ganho' : 'Perda'}</span></div></div>
      <div class="d-r num ${rCls(r)}">${fmtR(r)}</div>
    </section>
    ${facts ? `<section class="facts">${facts}</section>` : ''}
    ${al.length ? `<section class="card"><h3>Contas</h3>${al.map(x => `<div class="al-line"><i class="dot" style="background:${x.acc.color || '#3987e5'}"></i><div><b>${esc(x.acc.name)}</b><small>${esc(x.acc.firm || '')} · risco ${pct(x.a.risk ?? x.acc.riskPct ?? 0, 2)}</small></div><span class="num ${rCls(x.pnl)}">${money(x.pnl, { sign: true })}</span></div>`).join('')}</section>` : ''}
    ${(t.conf || []).length || (t.tags || []).length ? `<section class="card"><h3>Marcações</h3>
      ${(t.conf || []).length ? `<div class="tagrow">${t.conf.map(c => `<span class="tag good">${esc(c)}</span>`).join('')}</div>` : ''}
      ${(t.tags || []).length ? `<div class="tagrow">${t.tags.map(c => `<span class="tag bad">${esc(c)}</span>`).join('')}</div>` : ''}</section>` : ''}
    ${t.notes ? `<section class="card"><h3>Notas</h3><p class="notes">${esc(t.notes)}</p></section>` : ''}
    <div class="btns-r pg-actions"><button class="btn danger" data-act="t-del" data-id="${t._id}">Apagar</button><button class="btn" data-act="t-edit" data-id="${t._id}">Editar</button></div>`;
}
export function openTradeDetail(id) {
  let off = () => {};
  const pg = openPage({ title: '', cls: 'detail', onClose: () => off() });
  const render = () => {
    const t = D.byId(id); if (!t) { pg.close(); return; }
    pg.setTitle(t.asset);
    const y = pg.body.scrollTop;
    pg.body.innerHTML = detailHTML(t); pg.body.scrollTop = y;
    P.hydrate(pg.body);
    const car = pg.body.querySelector('#pcar');
    if (car) car.onscroll = () => { const i = Math.round(car.scrollLeft / car.clientWidth); pg.body.querySelectorAll('.pdots i').forEach((d, k) => d.classList.toggle('on', k === i)); };
  };
  off = D.onChange(render);
  render();
}
acts['t-edit'] = el => openTradeEdit(el.dataset.id);
acts['t-del'] = async el => {
  const t = D.byId(el.dataset.id); if (!t) return;
  if (await confirmSheet({ title: 'Apagar este trade?', text: `${t.asset} em ${fmtDate(t.date)}. Isso não pode ser desfeito.`, ok: 'Apagar', danger: true })) {
    D.remove(t._id); toast('Trade apagado'); setTimeout(() => P.gc(D.usedPhotoIds()), 400);
  }
};
acts['t-getlink'] = async el => {
  const t = D.byId(el.dataset.id); if (!t) return;
  el.disabled = true; el.textContent = 'Baixando…';
  try { const ref = await P.importTV(t.link); D.update(t._id, { photos: [{ ...ref, label: 'Entrada' }] }); P.pending.delete(ref.id); toast('Foto salva ✓'); }
  catch (e) { el.disabled = false; el.textContent = 'Baixar o print do link'; toast(String(e.message || e).slice(0, 80)); }
};

// ---------- edição e novo ----------
export function openTradeEdit(id) {
  const t = D.byId(id); if (!t) return;
  let form = null;
  const pg = openPage({ title: 'Editar trade', cls: 'formpage', onClose: () => form && form.dispose() });
  pg.body.innerHTML = `<div class="form-wrap">${formHTML(t)}</div><div class="sticky-save"><button class="btn" id="f-save">Salvar alterações</button></div>`;
  form = bindForm(pg.body, t);
  pg.body.querySelector('#f-save').onclick = () => {
    const p = form.read(); if (!p) return;
    D.update(id, p); form.markSaved(); pg.close(); toast('Atualizado ✓');
  };
}
export function renderNovo(go) {
  $('#view').innerHTML = `<header class="top"><div><h1>Novo trade</h1><p class="sub">Registre rápido, o resto é opcional</p></div></header>
    <div class="form-wrap">${formHTML({})}</div><div class="sticky-save inline"><button class="btn" id="f-save">Salvar trade</button></div>`;
  const form = bindForm($('#view'), {});
  $('#f-save').onclick = () => {
    const p = form.read(); if (!p) return;
    D.add(p); form.markSaved(); toast('Trade salvo ✓'); go('painel');
  };
}
