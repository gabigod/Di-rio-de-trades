// Ponto de entrada: abas, botão voltar do Android e atualização das telas quando os dados mudam.
import './style.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import { App as CapApp } from '@capacitor/app';
import * as D from './data.js';
import * as AC from './accounts.js';
import * as P from './photos.js';
import { $ } from './util.js';
import { icon } from './icons.js';
import { acts, back, toast } from './ui.js';
import { setRerender } from './state.js';
import { destroyCharts } from './charts.js';
import { renderPainel } from './views/painel.js';
import { renderTrades, renderNovo } from './views/trades.js';
import { renderStats } from './views/stats.js';
import { renderContas } from './views/contas.js';
import './views/config.js';

const TABS = [
  { k: 'painel', t: 'Painel', i: 'home', r: () => renderPainel() },
  { k: 'trades', t: 'Trades', i: 'list', r: () => renderTrades() },
  { k: 'novo', t: 'Novo trade', i: 'plus', add: true, r: () => renderNovo(go) },
  { k: 'contas', t: 'Contas', i: 'cards', r: () => renderContas() },
  { k: 'stats', t: 'Stats', i: 'stats', r: () => renderStats() },
];
let cur = 'painel';

$('#tabbar').innerHTML = TABS.map(t => t.add
  ? `<button class="add" data-act="go" data-v="${t.k}" aria-label="${t.t}"><span class="fab">${icon('plus', 26)}</span></button>`
  : `<button data-act="go" data-v="${t.k}" data-tab="${t.k}">${icon(t.i, 23)}<span>${t.t}</span></button>`).join('');

function paint() {
  const v = $('#view'), y = v.scrollTop;
  destroyCharts();
  TABS.find(t => t.k === cur).r();
  v.scrollTop = y;
}
export function go(k) {
  while (back());                       // fecha páginas e janelas que estiverem abertas
  cur = k;
  document.querySelectorAll('#tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === k));
  $('#view').scrollTop = 0;
  paint(); $('#view').scrollTop = 0;
}
acts.go = el => go(el.dataset.v);
setRerender(paint);

// as telas se atualizam sozinhas quando trades, contas, saques ou gastos mudam
let raf = 0;
const refresh = () => { if (cur === 'novo' || raf) return; raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
D.onChange(refresh);
[AC.accounts, AC.payouts, AC.expenses, AC.adjusts].forEach(c => c.on(refresh));

// fotos guardadas no aparelho ganham o endereço assim que aparecem na tela
let hy = 0;
new MutationObserver(() => { if (hy) return; hy = requestAnimationFrame(() => { hy = 0; P.hydrate(document); }); }).observe($('#app'), { childList: true, subtree: true });

window.addEventListener('dt:quota', () => toast('O armazenamento do aparelho está cheio. Salve um backup em Ajustes.', 4500));

// botão voltar do Android: fecha a camada de cima, depois volta ao Painel, depois minimiza
try {
  CapApp.addListener('backButton', () => {
    if (back()) return;
    if (cur !== 'painel') { go('painel'); return; }
    CapApp.minimizeApp();
  });
} catch { /* navegador */ }

P.persistStorage();
go('painel');
setTimeout(() => P.gc(D.usedPhotoIds()), 5000);
window.__app = { D, AC, P, go };
