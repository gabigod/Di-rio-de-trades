// Estrutura da interface: avisos, janelas de baixo, páginas por cima das abas e o botão voltar.
import { $, esc } from './util.js';
import { icon } from './icons.js';

// ---------- ações por data-act ----------
export const acts = {};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && acts[el.dataset.act]) acts[el.dataset.act](el, e);
});

// ---------- aviso rápido ----------
export function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('top', stack.length > 0); t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}

// ---------- pilha de camadas (para o botão voltar do Android) ----------
const stack = [];
export function pushOverlay(entry) {
  stack.push(entry);
  entry.remove = () => { const i = stack.indexOf(entry); if (i >= 0) stack.splice(i, 1); };
  return entry;
}
/** Fecha a camada de cima. Devolve true se tinha alguma. */
export function back() {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close(); return true;
}
export const hasOverlay = () => stack.length > 0;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && back()) e.preventDefault(); });

// ---------- janela de baixo ----------
export function openSheet(html, { cls = '', onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="sheet ${cls}" role="dialog"><div class="grab"></div><div class="sheet-body">${html}</div></div>`;
  $('#overlays').appendChild(wrap);
  const body = wrap.querySelector('.sheet-body');
  let closed = false;
  const entry = pushOverlay({
    el: wrap,
    close() { if (closed) return; closed = true; entry.remove(); wrap.remove(); if (onClose) onClose(); },
  });
  body.close = entry.close;
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) entry.close(); });
  return body;
}

/** Pergunta de confirmação com botões grandes. */
export function confirmSheet({ title, text = '', ok = 'Confirmar', danger = false }) {
  return new Promise(res => {
    let answered = false;
    const body = openSheet(`<h2>${esc(title)}</h2>${text ? `<p class="hint" style="margin:-6px 0 16px">${esc(text)}</p>` : ''}
      <div class="btns-r"><button class="btn ghost" data-c="0">Cancelar</button><button class="btn ${danger ? 'danger' : ''}" data-c="1">${esc(ok)}</button></div>`,
      { onClose: () => { if (!answered) res(false); } });
    body.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { answered = true; res(b.dataset.c === '1'); body.close(); });
  });
}

// ---------- página cheia (detalhe de trade ou de conta) ----------
export function openPage({ title = '', right = '', cls = '', onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'page ' + cls;
  el.innerHTML = `<header class="page-top"><button class="icon-btn" data-pg="back" aria-label="Voltar">${icon('back')}</button><h2 class="page-title">${esc(title)}</h2><div class="page-right">${right}</div></header><div class="page-body"></div>`;
  $('#overlays').appendChild(el);
  let closed = false;
  const entry = pushOverlay({
    el,
    close() { if (closed) return; closed = true; entry.remove(); el.remove(); if (onClose) onClose(); },
  });
  el.querySelector('[data-pg=back]').onclick = entry.close;
  const pg = {
    el, close: entry.close,
    body: el.querySelector('.page-body'),
    setTitle: t => { el.querySelector('.page-title').textContent = t; },
    setRight: h => { el.querySelector('.page-right').innerHTML = h; },
  };
  return pg;
}
