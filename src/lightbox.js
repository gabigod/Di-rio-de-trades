// Visualizador de fotos em tela cheia: pinça para ampliar, arrasta, toque duplo e passa de uma foto para outra.
import { $, $$, esc, clamp } from './util.js';
import { icon } from './icons.js';
import { srcOf } from './photos.js';
import { pushOverlay } from './ui.js';

export function openLightbox(photos, start = 0, { title = '' } = {}) {
  if (!photos.length) return;
  const n = photos.length;
  let cur = clamp(start, 0, n - 1), s = 1, tx = 0, ty = 0, dragX = 0, dragY = 0;

  const root = document.createElement('div');
  root.className = 'lb';
  root.innerHTML = `
    <div class="lb-top">
      <button class="icon-btn" data-lb="close" aria-label="Fechar">${icon('x')}</button>
      <div class="lb-title"><b></b><span></span></div>
      <button class="icon-btn" data-lb="fit" aria-label="Ajustar à tela">${icon('zoom')}</button>
    </div>
    <div class="lb-stage"><div class="lb-track">${photos.map(() => '<div class="lb-slide"><i class="lb-spin"></i><img draggable="false" alt=""></div>').join('')}</div></div>
    <div class="lb-dots">${n > 1 ? photos.map((_, i) => `<i data-i="${i}"></i>`).join('') : ''}</div>`;
  document.body.appendChild(root);

  const stage = $('.lb-stage', root), track = $('.lb-track', root);
  const slides = $$('.lb-slide', root), imgs = $$('.lb-slide img', root);
  const W = () => stage.clientWidth, H = () => stage.clientHeight;
  const loaded = new Set();
  let closed = false;
  const entry = pushOverlay({ el: root, close() { if (closed) return; closed = true; entry.remove(); root.remove(); } });

  function load(i) {
    if (i < 0 || i >= n || loaded.has(i)) return; loaded.add(i);
    srcOf(photos[i].id).then(u => { if (!u) { slides[i].classList.add('bad'); return; } imgs[i].onload = () => slides[i].classList.add('ready'); imgs[i].onerror = () => slides[i].classList.add('bad'); imgs[i].src = u; });
  }
  function fit() { // tamanho da foto na tela com zoom 1
    const im = imgs[cur]; if (!im.naturalWidth) return { w: W(), h: H() };
    const k = Math.min(W() / im.naturalWidth, H() / im.naturalHeight); return { w: im.naturalWidth * k, h: im.naturalHeight * k };
  }
  function clampPan() {
    const f = fit(); const mx = Math.max(0, (f.w * s - W()) / 2), my = Math.max(0, (f.h * s - H()) / 2);
    tx = clamp(tx, -mx, mx); ty = clamp(ty, -my, my);
  }
  function paint(anim = false) {
    track.style.transition = anim ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none';
    track.style.transform = `translateX(${-cur * W() + dragX}px)`;
    imgs.forEach((im, i) => {
      im.style.transition = anim ? 'transform .2s ease' : 'none';
      im.style.transform = i === cur ? `translate(${tx}px,${ty + dragY}px) scale(${s})` : 'none';
    });
    root.style.setProperty('--lb-bg', String(clamp(1 - Math.abs(dragY) / 420, .35, 1)));
    $('.lb-title b', root).textContent = photos[cur].label || title || 'Foto';
    $('.lb-title span', root).textContent = n > 1 ? `${cur + 1} de ${n}` : title;
    $$('.lb-dots i', root).forEach((d, i) => d.classList.toggle('on', i === cur));
  }
  function go(i, anim = true) {
    i = clamp(i, 0, n - 1);
    if (i !== cur) { s = 1; tx = 0; ty = 0; cur = i; }
    dragX = 0; dragY = 0; load(cur - 1); load(cur); load(cur + 1); paint(anim);
  }
  function zoomAt(px, py, ns, anim) { // px,py relativos ao centro da área
    ns = clamp(ns, 1, 8);
    const u = { x: (px - tx) / s, y: (py - ty) / s };
    s = ns; tx = px - s * u.x; ty = py - s * u.y;
    if (s === 1) { tx = 0; ty = 0; } else clampPan();
    paint(anim);
  }
  const rel = e => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; };

  // ---------- gestos ----------
  const ptr = new Map();
  let pinch = null, pan = null, lastTap = { t: 0, x: 0, y: 0 }, mode = '';
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId); ptr.set(e.pointerId, rel(e));
    if (ptr.size === 2) {
      const [a, b] = [...ptr.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: s, tx0: tx, ty0: ty, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      mode = 'pinch'; dragX = 0; dragY = 0;
    } else { pan = { x: e.clientX, y: e.clientY, tx0: tx, ty0: ty, t: Date.now(), moved: false }; mode = ''; }
  });
  stage.addEventListener('pointermove', e => {
    if (!ptr.has(e.pointerId)) return;
    ptr.set(e.pointerId, rel(e));
    if (pinch && ptr.size >= 2) {
      const [a, b] = [...ptr.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ns = clamp(pinch.s0 * d / pinch.d, 1, 8);
      const u = { x: (pinch.mx - pinch.tx0) / pinch.s0, y: (pinch.my - pinch.ty0) / pinch.s0 };
      s = ns; tx = m.x - s * u.x; ty = m.y - s * u.y;
      if (s === 1) { tx = 0; ty = 0; } else clampPan();
      paint(); return;
    }
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (!pan.moved && Math.hypot(dx, dy) > 6) { pan.moved = true; mode = s > 1.02 ? 'pan' : (Math.abs(dx) > Math.abs(dy) ? 'swipe' : (dy > 0 ? 'close' : '')); }
    if (mode === 'pan') { tx = pan.tx0 + dx; ty = pan.ty0 + dy; clampPan(); }
    else if (mode === 'swipe') { dragX = (cur === 0 && dx > 0) || (cur === n - 1 && dx < 0) ? dx * .3 : dx; }
    else if (mode === 'close') { dragY = dy; }
    if (mode) paint();
  });
  const end = e => {
    if (!ptr.has(e.pointerId)) return;
    ptr.delete(e.pointerId);
    if (pinch && ptr.size < 2) { pinch = null; if (s < 1.05) { s = 1; tx = 0; ty = 0; } paint(true); pan = null; mode = ''; return; }
    if (!pan) return;
    const moved = pan.moved, wasMode = mode; pan = null; mode = '';
    if (wasMode === 'swipe') { const thr = W() * .18; go(dragX < -thr ? cur + 1 : dragX > thr ? cur - 1 : cur); return; }
    if (wasMode === 'close') { if (dragY > 110) entry.close(); else go(cur); return; }
    if (!moved && e.type === 'pointerup') { // toque
      const p = rel(e), now = Date.now();
      if (now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 40) { zoomAt(p.x, p.y, s > 1.05 ? 1 : 2.8, true); lastTap.t = 0; }
      else lastTap = { t: now, x: p.x, y: p.y };
    }
    if (wasMode === 'pan') paint(true);
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', e => { e.preventDefault(); const p = rel(e); zoomAt(p.x, p.y, s * (e.deltaY < 0 ? 1.18 : 1 / 1.18), false); }, { passive: false });

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-lb]'); if (b) { if (b.dataset.lb === 'close') entry.close(); else { s = 1; tx = 0; ty = 0; paint(true); } return; }
    const d = e.target.closest('.lb-dots i'); if (d) go(+d.dataset.i);
  });
  const key = e => { if (closed) { document.removeEventListener('keydown', key); return; } if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1); };
  document.addEventListener('keydown', key);
  window.addEventListener('resize', () => paint());
  requestAnimationFrame(() => go(cur, false));
}
