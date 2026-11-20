// Estado compartilhado entre as telas: filtro de ano e de trades.
import * as D from './data.js';
import { getSetting, setSetting } from './store.js';
import { acts } from './ui.js';

export const S = {
  year: 'Todos',
  q: '',
  F: { res: '', strat: '', cat: '', acc: '', photo: '' },   // filtros da aba Trades
  mode: getSetting('tradesMode', 'list'),                    // 'list' | 'gallery'
  cols: getSetting('galleryCols', 1),
  statsTab: getSetting('statsTab', 'resumo'),
};
export const saveMode = () => { setSetting('tradesMode', S.mode); setSetting('galleryCols', S.cols); };

let rerender = () => {};
export const setRerender = f => { rerender = f; };
export const redraw = () => rerender();

export const filtered = () => (S.year === 'Todos' ? D.trades : D.trades.filter(t => t.date.startsWith(S.year)));

export function yearChips() {
  return `<div class="chips" role="tablist">${['Todos', ...D.years()].map(y => `<button class="chip ${y === S.year ? 'on' : ''}" data-act="year" data-y="${y}">${y}</button>`).join('')}</div>`;
}
acts.year = el => { S.year = el.dataset.y; redraw(); };
