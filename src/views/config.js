// Ajustes: backup e restauração (com fotos), prints do TradingView, listas e sobre.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import pkg from '../../package.json';
import * as D from '../data.js';
import * as AC from '../accounts.js';
import * as P from '../photos.js';
import { esc, num, todayISO } from '../util.js';
import { icon } from '../icons.js';
import { acts, toast, openSheet, openPage, confirmSheet } from '../ui.js';
import { allSettings, replaceSettings, setSetting } from '../store.js';
import { redraw } from '../state.js';
import { confList, tagList } from './form.js';

const mb = b => num(b / 1048576, b < 10485760 ? 1 : 0) + ' MB';

// ---------- arquivo para fora do app ----------
async function shareFile(name, text, title) {
  if (Capacitor.isNativePlatform()) {
    const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title, url: r.uri, dialogTitle: 'Guardar backup' });
    return;
  }
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Tudo do app num objeto só. Com `photos`, as fotos que você adicionou entram junto (as do histórico já vêm no app). */
export async function buildBackup(withPhotos) {
  const out = {
    app: 'diario-de-trades', v: 2, at: new Date().toISOString(),
    trades: D.trades, accounts: AC.accounts.all, payouts: AC.payouts.all, expenses: AC.expenses.all, adjusts: AC.adjusts.all, settings: allSettings(),
  };
  if (withPhotos) out.photos = await P.exportPhotos([...D.usedPhotoIds()]);
  return out;
}
export async function applyBackup(d) {
  const old = Array.isArray(d);
  const trades = old ? d : d && d.trades;
  if (!Array.isArray(trades) || !trades.every(t => t && t.date && t.asset)) throw new Error('Esse arquivo não parece um backup do Diário.');
  let photos = 0;
  if (!old && d.photos) { const r = await P.importPhotos(d.photos); photos = r.n; trades.forEach(t => (t.photos || []).forEach(p => { if (r.dims[p.id] && !p.w) Object.assign(p, r.dims[p.id]); })); }
  D.replaceAll(trades);
  if (!old) {
    AC.accounts.replace(d.accounts); AC.payouts.replace(d.payouts); AC.expenses.replace(d.expenses); AC.adjusts.replace(d.adjusts);
    if (d.settings) replaceSettings(d.settings);
  }
  setTimeout(() => P.gc(D.usedPhotoIds()), 600);
  return { trades: trades.length, accounts: old ? 0 : (d.accounts || []).length, photos };
}
export const backupName = suffix => `diario-trades-${todayISO()}${suffix}.json`;

// ---------- página ----------
acts.settings = () => {
  let off = () => {};
  const pg = openPage({ title: 'Ajustes', cls: 'detail', onClose: () => off() });
  const render = async () => {
    const pending = D.pendingLinks().length, info = await P.storageInfo(), stored = await P.storedCount();
    if (!pg.el.isConnected) return;
    pg.body.innerHTML = `
      <section class="card"><div class="sec-head"><h3>Backup</h3></div>
        <p class="hint bk-stat"><b>${D.trades.length}</b> trades<i class="sep"></i><b>${AC.accounts.all.length}</b> ${AC.accounts.all.length === 1 ? 'conta' : 'contas'}<i class="sep"></i><b>${stored}</b> ${stored === 1 ? 'foto sua' : 'fotos suas'}</p>
        <p class="hint">Tudo fica guardado só neste aparelho. Se você desinstalar o app, os dados vão junto, então salve um backup de vez em quando.</p>
        <button class="btn wide" data-act="bk-save" data-p="1">${icon('share', 18)}Salvar backup com fotos</button>
        <button class="btn ghost wide" data-act="bk-save" data-p="0">${icon('share', 18)}Salvar backup leve, sem fotos</button>
        <button class="btn ghost wide" data-act="bk-load">${icon('down', 18)}Restaurar de um arquivo</button>
        <button class="link center" data-act="bk-paste">Colar o texto do backup</button></section>
      <section class="card"><div class="sec-head"><h3>Fotos</h3></div>
        <div class="kvl"><div><span>Fotos no histórico</span><b class="num">${D.trades.filter(t => (t.photos || []).length).length} trades</b></div>
          ${info ? `<div><span>Espaço usado pelo app</span><b class="num">${mb(info.used)}</b></div>` : ''}</div>
        ${pending ? `<p class="hint" style="margin-top:12px">${pending} ${pending === 1 ? 'trade ainda tem' : 'trades ainda têm'} só o link do TradingView, sem foto.</p><button class="btn ghost wide" data-act="tv-all">Baixar os prints dos links</button>` : ''}
        <button class="btn ghost wide" data-act="ph-clean">Liberar espaço de fotos sem uso</button></section>
      <section class="card"><div class="sec-head"><h3>Listas</h3></div>
        <button class="lrow" data-act="list-conf"><i class="lic">${icon('layers', 18)}</i><div class="mid"><div class="a">Confluências</div><div class="b2">${confList().length} marcações para o trade</div></div>${icon('chev', 18)}</button>
        <button class="lrow" data-act="list-tags"><i class="lic">${icon('flag', 18)}</i><div class="mid"><div class="a">Erros</div><div class="b2">${tagList().length} marcações de erro</div></div>${icon('chev', 18)}</button></section>
      <section class="card"><div class="sec-head"><h3>Sobre</h3></div>
        <p class="hint">Diário de Trades<i class="sep"></i>versão ${esc(pkg.version)}<br>Os dados ficam só no seu aparelho. O app não envia nada para a internet, a não ser quando você baixa o print de um link do TradingView.</p></section>`;
  };
  render();
  const h = () => { if (pg.el.isConnected) render(); };
  off = D.onChange(h);
  pg.el.addEventListener('dt:refresh', h);
};
const refresh = () => document.querySelectorAll('.page').forEach(p => p.dispatchEvent(new Event('dt:refresh')));

acts['bk-save'] = async el => {
  const full = el.dataset.p === '1';
  el.disabled = true; const t0 = el.innerHTML; el.textContent = 'Preparando…';
  try {
    const b = await buildBackup(full);
    await shareFile(backupName(full ? '' : '-leve'), JSON.stringify(b), 'Backup do Diário de Trades');
    toast(full ? 'Backup pronto ✓' : 'Backup leve pronto ✓');
  } catch (e) { if (!/cancel|abort|dismiss/i.test(String(e && (e.message || e)))) toast('Não consegui gerar o backup'); }
  el.disabled = false; el.innerHTML = t0;
};
async function confirmImport(d) {
  const old = Array.isArray(d), n = old ? d.length : (d.trades || []).length, a = old ? 0 : (d.accounts || []).length;
  const ok = await confirmSheet({ title: 'Restaurar este backup?', text: `${n} trades${a ? `, ${a} contas` : ''}${!old && d.photos ? `, ${Object.keys(d.photos).length} fotos` : ''}. Isso substitui o que está no app agora.`, ok: 'Restaurar', danger: true });
  if (!ok) return;
  try { const r = await applyBackup(d); toast(`${r.trades} trades restaurados ✓`); redraw(); refresh(); }
  catch (e) { toast(String(e.message || 'Backup inválido').slice(0, 80)); }
}
acts['bk-load'] = () => {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json,text/plain';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try { await confirmImport(JSON.parse(await f.text())); } catch { toast('Não consegui ler esse arquivo'); }
  };
  inp.click();
};
acts['bk-paste'] = () => {
  const body = openSheet(`<h2>Colar o backup</h2><p class="hint" style="margin:-6px 0 12px">Cole aqui o texto do backup. Depois você confirma antes de substituir os dados.</p>
    <textarea class="inp" id="bk-txt" style="min-height:150px"></textarea><div class="btns-r"><button class="btn" id="bk-go">Continuar</button></div>`);
  body.querySelector('#bk-go').onclick = async () => {
    try { const d = JSON.parse(body.querySelector('#bk-txt').value); body.close(); await confirmImport(d); } catch { toast('Texto inválido'); }
  };
};

// ---------- prints dos links ----------
acts['tv-all'] = async el => {
  const todo = D.pendingLinks(); if (!todo.length) return;
  el.disabled = true; let ok = 0, bad = 0;
  for (let i = 0; i < todo.length; i++) {
    el.textContent = `Baixando ${i + 1} de ${todo.length}…`;
    try { const ref = await P.importTV(todo[i].link); D.update(todo[i]._id, { photos: [{ ...ref, label: 'Entrada' }] }); P.pending.delete(ref.id); ok++; } catch { bad++; }
  }
  toast(bad ? `${ok} baixados, ${bad} falharam` : `${ok} prints salvos ✓`); refresh();
};
acts['ph-clean'] = async () => { await P.gc(D.usedPhotoIds()); toast('Espaço liberado ✓'); refresh(); };

// ---------- listas ----------
function listSheet(title, key, get, defaults) {
  const body = openSheet('<div id="ls"></div>', { onClose: refresh });
  const draw = () => {
    const items = get();
    body.querySelector('#ls').innerHTML = `<h2>${title}</h2><div class="qchips pick wrap">${items.map(x => `<button type="button" class="on" data-x="${esc(x)}">${esc(x)}<span>${icon('x', 14)}</span></button>`).join('') || '<span class="hint">Nenhum item.</span>'}</div>
      <div class="add-row"><input class="inp" id="ls-in" placeholder="Novo item" autocomplete="off"><button class="btn sm" id="ls-add">Adicionar</button></div>
      <button class="link center" id="ls-def">Restaurar padrão</button>`;
    body.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { setSetting(key, get().filter(x => x !== b.dataset.x)); draw(); });
    const add = () => { const v = body.querySelector('#ls-in').value.trim(); if (!v) return; if (!get().includes(v)) setSetting(key, [...get(), v]); draw(); };
    body.querySelector('#ls-add').onclick = add;
    body.querySelector('#ls-in').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    body.querySelector('#ls-def').onclick = () => { setSetting(key, defaults); draw(); };
  };
  draw();
}
acts['list-conf'] = () => listSheet('Confluências', 'confList', confList, D.DEFAULT_CONF);
acts['list-tags'] = () => listSheet('Erros', 'tagList', tagList, D.DEFAULT_TAGS);
