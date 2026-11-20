// Formulário do trade: essenciais, fotos e blocos opcionais (preços, confluências, psicologia, contas).
import * as D from '../data.js';
import * as A from '../analytics.js';
import * as AC from '../accounts.js';
import * as P from '../photos.js';
import { esc, fmtR, money, todayISO, uid } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet } from '../ui.js';
import { getSetting, setSetting } from '../store.js';
import { openLightbox } from '../lightbox.js';

const parse = s => { const v = parseFloat(String(s ?? '').replace(',', '.')); return isNaN(v) ? null : v; };
const dirName = d => (d === 'BUY' ? 'Compra' : d === 'SELL' ? 'Venda' : '');

export const confList = () => getSetting('confList', D.DEFAULT_CONF);
export const tagList = () => getSetting('tagList', D.DEFAULT_TAGS);

export function formHTML(t = {}) {
  const assets = D.uniq('asset'); const counts = D.countBy('asset');
  const top = assets.sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).slice(0, 10);
  const strats = Object.entries(D.countBy('strategy')).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const cats = D.uniq('category');
  const act = AC.accounts.all.filter(a => a.status === 'ativa');
  const has = k => t[k] !== undefined && t[k] !== null && t[k] !== '';
  const openPrices = ['openDate', 'entry', 'stop', 'target', 'exit', 'mfe'].some(has);
  const openConf = (t.conf && t.conf.length) || (t.tags && t.tags.length);
  const openPsy = t.grade || t.mood;
  const openAcc = (t.alloc || []).length;
  return `
  <div class="f-sec">
    <div class="row2">
      <label class="fld"><span>Data</span><input class="inp" id="f-date" type="date" value="${t.date || todayISO()}"></label>
      <label class="fld"><span>Ativo</span><input class="inp" id="f-asset" value="${esc(t.asset || '')}" placeholder="EURUSD" autocapitalize="characters" autocomplete="off"></label>
    </div>
    <div class="qchips" id="f-assets">${top.map(a => `<button type="button" data-fa="${esc(a)}">${esc(a)}</button>`).join('')}</div>
    <div class="fld"><span>Resultado</span>
      <div class="seg" id="f-res">
        <button type="button" class="w ${t.result === 'WIN' ? 'on' : ''}" data-r="WIN">Ganho</button>
        <button type="button" class="l ${t.result === 'LOSS' ? 'on' : ''}" data-r="LOSS">Perda</button>
        <button type="button" class="b ${t.result === 'BE' ? 'on' : ''}" data-r="BE">Empate</button>
      </div></div>
    <div class="fld"><span>Direção</span>
      <div class="seg" id="f-dir">
        <button type="button" class="c ${t.dir === 'BUY' ? 'on' : ''}" data-d="BUY">Compra</button>
        <button type="button" class="c ${t.dir === 'SELL' ? 'on' : ''}" data-d="SELL">Venda</button>
      </div></div>
    <div class="fld"><span>Resultado em R</span>
      <div class="stepper">
        <button type="button" id="f-minus" aria-label="Menos 0,5">−</button>
        <input class="inp num" id="f-r" type="number" step="0.1" inputmode="decimal" value="${t.r ?? ''}" placeholder="0">
        <button type="button" id="f-plus" aria-label="Mais 0,5">+</button>
      </div>
      <div class="f-hint" id="f-rcalc" hidden></div></div>
    <label class="fld"><span>Estratégia</span><input class="inp" id="f-strat" value="${esc(t.strategy || '')}" placeholder="${esc(strats[0] || 'Nome da estratégia')}" autocomplete="off"></label>
    <div class="qchips" id="f-strats">${strats.map(s => `<button type="button" data-fs="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <label class="fld"><span>Categoria</span><input class="inp" id="f-cat" value="${esc(t.category || '')}" placeholder="${esc(cats[0] || 'Forex, índice…')}" autocomplete="off"></label>
    <div class="qchips" id="f-cats">${cats.map(c => `<button type="button" data-fc="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  </div>

  <div class="f-sec">
    <div class="f-title"><h3>Fotos</h3><small id="f-phn"></small></div>
    <div class="ph-grid" id="f-photos"></div>
    <div class="ph-actions">
      <button type="button" class="btn ghost sm" id="ph-add">${icon('plus', 18)} Da galeria</button>
      <button type="button" class="btn ghost sm" id="ph-link">${icon('link', 18)} Link TradingView</button>
    </div>
    <input type="file" id="ph-file" accept="image/*" multiple hidden>
  </div>

  <div class="f-sec acc-group">
    <details class="acc" ${openPrices ? 'open' : ''}><summary><span>Preços e tempo</span><em id="s-prices"></em>${icon('chev')}</summary>
      <div class="acc-body">
        <div class="row2">
          <label class="fld"><span>Entrada</span><input class="inp" id="f-entry" inputmode="decimal" value="${has('entry') ? t.entry : ''}" placeholder="1,08500"></label>
          <label class="fld"><span>Stop</span><input class="inp" id="f-stop" inputmode="decimal" value="${has('stop') ? t.stop : ''}" placeholder="1,08000"></label>
          <label class="fld"><span>Alvo</span><input class="inp" id="f-target" inputmode="decimal" value="${has('target') ? t.target : ''}" placeholder="1,09500"></label>
          <label class="fld"><span>Saída</span><input class="inp" id="f-exit" inputmode="decimal" value="${has('exit') ? t.exit : ''}" placeholder="1,09500"></label>
        </div>
        <div class="row2">
          <label class="fld"><span>Abriu em</span><input class="inp" id="f-open" type="date" value="${t.openDate || ''}"></label>
          <label class="fld"><span>Chegou a (R)</span><input class="inp" id="f-mfe" inputmode="decimal" value="${has('mfe') ? t.mfe : ''}" placeholder="3"></label>
        </div>
        <p class="hint">“Chegou a” é o máximo de R a favor que o trade alcançou antes de fechar. Mostra quanto ficou na mesa.</p>
        <div class="f-hint" id="f-rr" hidden></div>
      </div>
    </details>
    <details class="acc" ${openConf ? 'open' : ''}><summary><span>Confluências e erros</span><em id="s-conf"></em>${icon('chev')}</summary>
      <div class="acc-body">
        <div class="fld"><span>A favor do trade</span><div class="qchips pick" id="f-conf"></div></div>
        <div class="fld"><span>Erros e desvios</span><div class="qchips pick warn" id="f-tags"></div></div>
      </div>
    </details>
    <details class="acc" ${openPsy ? 'open' : ''}><summary><span>Qualidade e estado</span><em id="s-psy"></em>${icon('chev')}</summary>
      <div class="acc-body">
        <div class="fld"><span>Qualidade do setup</span>
          <div class="seg" id="f-grade">${['A', 'B', 'C'].map(g => `<button type="button" class="c ${t.grade === g ? 'on' : ''}" data-g="${g}">${g}</button>`).join('')}</div></div>
        <div class="fld"><span>Como você estava</span>
          <div class="moods" id="f-mood">${D.MOODS.map(m => `<button type="button" class="${t.mood === m.k ? 'on' : ''}" data-m="${m.k}"><i>${m.e}</i>${m.t}</button>`).join('')}</div></div>
      </div>
    </details>
    <details class="acc" ${openAcc ? 'open' : ''}><summary><span>Contas de prop firm</span><em id="s-acc"></em>${icon('chev')}</summary>
      <div class="acc-body">
        ${act.length ? `<div class="qchips pick" id="f-acc">${act.map(a => `<button type="button" data-a="${a.id}"><i class="dot" style="background:${a.color || '#3987e5'}"></i>${esc(a.name)}</button>`).join('')}</div><div id="f-alloc"></div>`
          : '<p class="hint">Cadastre suas contas na aba Contas para ligar cada trade a uma conta e ver o resultado em dólar.</p>'}
      </div>
    </details>
  </div>

  <label class="fld"><span>Notas</span><textarea class="inp" id="f-notes" placeholder="O que você viu, por que entrou, o que aprendeu">${esc(t.notes || '')}</textarea></label>`;
}

/** Liga os campos. Devolve { read(), dispose() }. */
export function bindForm(root, t = {}) {
  const q = s => root.querySelector(s);
  const qa = s => [...root.querySelectorAll(s)];
  let photos = (t.photos || []).map(p => ({ ...p }));
  const added = new Set();
  const conf = new Set(t.conf || []), tags = new Set(t.tags || []);
  let confTouched = false, grade = t.grade || '', mood = t.mood || '';
  const alloc = (t.alloc || []).map(a => ({ ...a }));
  let saved = false;

  // ----- essenciais
  // categoria sugerida pelo histórico do ativo (só preenche se estiver vazia)
  const guessCat = () => {
    const a = q('#f-asset').value.trim().toUpperCase(), c = q('#f-cat'); if (!a || c.value.trim()) return;
    const n = {}; D.trades.forEach(x => { if (x.asset === a && x.category) n[x.category] = (n[x.category] || 0) + 1; });
    const best = Object.entries(n).sort((x, y) => y[1] - x[1])[0]; if (best) c.value = best[0];
  };
  q('#f-asset').addEventListener('change', guessCat);
  qa('[data-fa]').forEach(b => b.onclick = () => { q('#f-asset').value = b.dataset.fa; guessCat(); });
  qa('[data-fs]').forEach(b => b.onclick = () => { q('#f-strat').value = b.dataset.fs; });
  qa('[data-fc]').forEach(b => b.onclick = () => { q('#f-cat').value = b.dataset.fc; });
  qa('#f-res button').forEach(b => b.onclick = () => {
    qa('#f-res button').forEach(x => x.classList.toggle('on', x === b));
    const r = q('#f-r');
    if (b.dataset.r === 'LOSS' && !r.value) r.value = -1;
    if (b.dataset.r === 'BE') r.value = 0;
    refresh();
  });
  qa('#f-dir button').forEach(b => b.onclick = () => {
    const was = b.classList.contains('on'); qa('#f-dir button').forEach(x => x.classList.remove('on')); if (!was) b.classList.add('on'); refresh();
  });
  const r = q('#f-r');
  q('#f-minus').onclick = () => { r.value = Math.round(((+r.value || 0) - .5) * 10) / 10; refresh(); };
  q('#f-plus').onclick = () => { r.value = Math.round(((+r.value || 0) + .5) * 10) / 10; refresh(); };
  const dirVal = () => (q('#f-dir .on') || {}).dataset?.d || '';

  // ----- fotos
  const renderPhotos = () => {
    q('#f-photos').innerHTML = photos.map((p, i) => `<div class="ph" data-i="${i}">${P.imgTag(p, { thumb: true })}
      <button type="button" class="ph-x" data-x="${i}" aria-label="Remover foto">${icon('x', 14)}</button>
      <button type="button" class="ph-l" data-l="${i}">${esc(p.label || 'Foto')}</button></div>`).join('')
      + `<button type="button" class="ph-add" id="ph-tile" aria-label="Adicionar foto">${icon('plus', 24)}<span>Foto</span></button>`;
    q('#f-phn').textContent = photos.length ? `${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'}` : 'toque em + para adicionar o print';
    P.hydrate(q('#f-photos'));
    q('#ph-tile').onclick = () => q('#ph-file').click();
    qa('#f-photos .ph img').forEach(im => im.onclick = () => openLightbox(photos, +im.closest('.ph').dataset.i));
    qa('[data-x]').forEach(b => b.onclick = () => { photos.splice(+b.dataset.x, 1); renderPhotos(); });
    qa('[data-l]').forEach(b => b.onclick = () => { const p = photos[+b.dataset.l]; const L = D.PHOTO_LABELS; p.label = L[(L.indexOf(p.label) + 1) % L.length]; renderPhotos(); });
  };
  const nextLabel = () => D.PHOTO_LABELS[Math.min(photos.length, 2) === 0 ? 0 : Math.min(photos.length, D.PHOTO_LABELS.length - 1)] || 'Extra';
  const addRef = ref => { photos.push({ ...ref, label: nextLabel() }); added.add(ref.id); renderPhotos(); };
  q('#ph-add').onclick = () => q('#ph-file').click();
  q('#ph-file').onchange = async e => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    toast(files.length > 1 ? `Salvando ${files.length} fotos…` : 'Salvando foto…', 1500);
    for (const f of files) { try { addRef(await P.addBlob(f)); } catch { toast('Não consegui ler essa imagem'); } }
  };
  q('#ph-link').onclick = () => {
    const body = openSheet(`<h2>Foto pelo link do TradingView</h2>
      <p class="hint" style="margin:-6px 0 14px">Cole o link do snapshot (tradingview.com/x/…). O app baixa o print e guarda no aparelho.</p>
      <input class="inp" id="tv-link" placeholder="https://www.tradingview.com/x/AbCdEf12/" inputmode="url" autocomplete="off">
      <button class="btn" id="tv-go" style="margin-top:12px">Baixar print</button>`);
    const go = body.querySelector('#tv-go');
    body.querySelector('#tv-link').focus();
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'Baixando…';
      try { addRef(await P.importTV(body.querySelector('#tv-link').value)); body.close(); toast('Foto adicionada ✓'); }
      catch (e) { go.disabled = false; go.textContent = 'Baixar print'; toast(String(e.message || e).slice(0, 80)); }
    };
  };

  // ----- chips de confluência e erros
  const drawChips = () => {
    const mk = (id, list, set, kind) => {
      const all = [...list, ...[...set].filter(x => !list.includes(x))];
      q(id).innerHTML = all.map(x => `<button type="button" class="${set.has(x) ? 'on' : ''}" data-v="${esc(x)}">${esc(x)}</button>`).join('') + `<button type="button" class="add" data-new="${kind}">+ nova</button>`;
    };
    mk('#f-conf', confList(), conf, 'conf'); mk('#f-tags', tagList(), tags, 'tags');
    const bind = (id, set) => qa(id + ' [data-v]').forEach(b => b.onclick = () => { confTouched = true; set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v); b.classList.toggle('on'); refresh(); });
    bind('#f-conf', conf); bind('#f-tags', tags);
    qa('[data-new]').forEach(b => b.onclick = () => {
      const kind = b.dataset.new;
      const body = openSheet(`<h2>${kind === 'conf' ? 'Nova confluência' : 'Novo erro ou desvio'}</h2><input class="inp" id="nw" placeholder="${kind === 'conf' ? 'Ex.: Sazonalidade' : 'Ex.: Operei sem dormir'}" autocomplete="off"><button class="btn" id="nw-go" style="margin-top:12px">Adicionar</button>`);
      body.querySelector('#nw').focus();
      body.querySelector('#nw-go').onclick = () => {
        const v = body.querySelector('#nw').value.trim(); if (!v) return;
        const list = kind === 'conf' ? confList() : tagList();
        if (!list.includes(v)) setSetting(kind === 'conf' ? 'confList' : 'tagList', [...list, v]);
        (kind === 'conf' ? conf : tags).add(v); confTouched = true; body.close(); drawChips(); refresh();
      };
    });
  };
  drawChips();

  // ----- psicologia
  qa('#f-grade button').forEach(b => b.onclick = () => { const was = b.classList.contains('on'); qa('#f-grade button').forEach(x => x.classList.remove('on')); grade = was ? '' : b.dataset.g; if (!was) b.classList.add('on'); refresh(); });
  qa('#f-mood button').forEach(b => b.onclick = () => { const was = b.classList.contains('on'); qa('#f-mood button').forEach(x => x.classList.remove('on')); mood = was ? '' : b.dataset.m; if (!was) b.classList.add('on'); refresh(); });

  // ----- contas
  const drawAlloc = () => {
    const box = q('#f-alloc'); if (!box) return;
    qa('#f-acc [data-a]').forEach(b => b.classList.toggle('on', alloc.some(a => a.acc === b.dataset.a)));
    box.innerHTML = alloc.map(a => {
      const acc = AC.accounts.get(a.acc); if (!acc) return '';
      return `<div class="al-row" data-acc="${acc.id}"><div class="al-name"><i class="dot" style="background:${acc.color || '#3987e5'}"></i>${esc(acc.name)}</div>
        <label><span>Risco %</span><input class="inp sm" data-f="risk" inputmode="decimal" value="${a.risk ?? acc.riskPct ?? ''}"></label>
        <label><span>Resultado $</span><input class="inp sm" data-f="pnl" type="number" step="any" inputmode="decimal" value="${a.pnl ?? ''}" placeholder="auto"></label>
        <div class="al-prev num" data-prev></div></div>`;
    }).join('');
    qa('#f-alloc .al-row input').forEach(inp => inp.oninput = () => { syncAlloc(); refresh(); });
    refresh();
  };
  const syncAlloc = () => {
    qa('#f-alloc .al-row').forEach(row => {
      const a = alloc.find(x => x.acc === row.dataset.acc); if (!a) return;
      const risk = parse(row.querySelector('[data-f=risk]').value), pnl = parse(row.querySelector('[data-f=pnl]').value);
      a.risk = risk === null ? undefined : risk; a.pnl = pnl === null ? undefined : pnl;
    });
  };
  qa('#f-acc [data-a]').forEach(b => b.onclick = () => {
    const i = alloc.findIndex(a => a.acc === b.dataset.a);
    if (i >= 0) alloc.splice(i, 1); else alloc.push({ acc: b.dataset.a });
    drawAlloc();
  });

  // ----- leituras ao vivo
  const num = id => parse(q(id).value);
  function refresh() {
    // R pelos preços
    const calc = A.calcR({ dir: dirVal(), entry: num('#f-entry'), stop: num('#f-stop'), exit: num('#f-exit') });
    const rc = q('#f-rcalc');
    if (calc !== null) {
      rc.hidden = false; rc.innerHTML = `Pelos preços: <b class="${calc >= 0 ? 'pos' : 'neg'}">${fmtR(calc)}</b> <button type="button" class="link" id="use-r">usar</button>`;
      q('#use-r').onclick = () => { r.value = Math.round(calc * 100) / 100; if (!q('#f-res .on')) qa('#f-res button').forEach(x => x.classList.toggle('on', x.dataset.r === (calc > 0.05 ? 'WIN' : calc < -0.05 ? 'LOSS' : 'BE'))); refresh(); };
    } else rc.hidden = true;
    const rr = A.plannedRR({ dir: dirVal(), entry: num('#f-entry'), stop: num('#f-stop'), target: num('#f-target') });
    const rrEl = q('#f-rr'); if (rr !== null) { rrEl.hidden = false; rrEl.innerHTML = `Risco e retorno planejado: <b>1 : ${(Math.round(rr * 100) / 100).toString().replace('.', ',')}</b>`; } else rrEl.hidden = true;
    // resumos dos blocos
    const filled = ['#f-entry', '#f-stop', '#f-target', '#f-exit', '#f-mfe'].filter(id => q(id).value.trim()).length + (q('#f-open').value ? 1 : 0);
    q('#s-prices').textContent = filled ? `${filled} preenchido${filled > 1 ? 's' : ''}` : '';
    q('#s-conf').textContent = conf.size || tags.size ? `${conf.size} a favor · ${tags.size} erro${tags.size === 1 ? '' : 's'}` : '';
    q('#s-psy').textContent = [grade, (D.MOODS.find(m => m.k === mood) || {}).e].filter(Boolean).join(' ');
    q('#s-acc').textContent = alloc.length ? `${alloc.length} conta${alloc.length > 1 ? 's' : ''}` : '';
    // prévia em dólar por conta
    const rv = +r.value || 0;
    qa('#f-alloc .al-row').forEach(row => {
      const a = alloc.find(x => x.acc === row.dataset.acc), acc = AC.accounts.get(row.dataset.acc);
      if (a && acc) row.querySelector('[data-prev]').textContent = '= ' + money(AC.tradePnl({ r: rv, alloc: [a] }, acc), { sign: true });
    });
  }
  ['#f-entry', '#f-stop', '#f-target', '#f-exit', '#f-mfe', '#f-open', '#f-r'].forEach(id => q(id).addEventListener('input', refresh));
  renderPhotos(); drawAlloc(); refresh();

  return {
    read() {
      const v = id => q(id).value.trim();
      const res = (q('#f-res .on') || {}).dataset?.r || '';
      if (!v('#f-asset')) { toast('Falta o ativo'); return null; }
      if (!res) { toast('Marque se foi ganho, perda ou empate'); return null; }
      syncAlloc();
      const n = id => { const x = num(id); return x === null ? undefined : x; };
      return {
        date: v('#f-date') || todayISO(), asset: v('#f-asset').toUpperCase(), dir: dirVal(), result: res, r: +r.value || 0,
        strategy: v('#f-strat'), category: v('#f-cat').toUpperCase(), notes: v('#f-notes'),
        photos: photos.map(p => ({ id: p.id, label: p.label, w: p.w, h: p.h })),
        openDate: v('#f-open') || undefined, entry: n('#f-entry'), stop: n('#f-stop'), target: n('#f-target'), exit: n('#f-exit'), mfe: n('#f-mfe'),
        conf: confTouched || conf.size || Array.isArray(t.conf) ? [...conf] : undefined,
        tags: confTouched || tags.size || Array.isArray(t.tags) ? [...tags] : undefined,
        grade: grade || undefined, mood: mood || undefined,
        alloc: alloc.map(a => ({ acc: a.acc, risk: a.risk, pnl: a.pnl })),
      };
    },
    markSaved() { saved = true; added.forEach(id => P.pending.delete(id)); setTimeout(() => P.gc(D.usedPhotoIds()), 400); },
    dispose() { if (!saved) added.forEach(id => P.removePhoto(id)); },
  };
}
