// Fotos dos trades.
// • Prints do histórico (id "tv:XXXX") vêm dentro do app, em ./photos/.
// • Fotos novas ficam no IndexedDB do aparelho (comprimidas, com miniatura).
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { uid, esc } from './util.js';

const DB = 'dt-photos', ST = 'p';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(ST, { keyPath: 'id' });
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(ST, mode); const r = fn(t.objectStore(ST));
    t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
const getRec = id => tx('readonly', s => s.get(id));
const putRec = rec => tx('readwrite', s => s.put(rec));
const delRec = id => tx('readwrite', s => s.delete(id));
const allKeys = () => tx('readonly', s => s.getAllKeys());

export const isBundled = id => String(id).startsWith('tv:');
export const bundledPath = (id, thumb) => `./photos/${id.slice(3)}${thumb ? '_t' : ''}.webp`;
/** Fotos adicionadas num formulário aberto e ainda não salvas no trade. */
export const pending = new Set();

// ---------- endereço da imagem ----------
const urls = new Map();
export async function srcOf(id, thumb = false) {
  if (isBundled(id)) return bundledPath(id, thumb);
  const k = id + (thumb ? '|t' : '');
  if (urls.has(k)) return urls.get(k);
  const rec = await getRec(id);
  if (!rec) return null;
  const u = URL.createObjectURL(thumb ? (rec.thumb || rec.blob) : rec.blob);
  urls.set(k, u); return u;
}
function forget(id) { for (const k of [id, id + '|t']) { if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); } } }

/** <img> pronta para a lista. As fotos do aparelho recebem o endereço depois, em hydrate(). */
export function imgTag(p, { thumb = false, cls = '', alt = '' } = {}) {
  const ar = p.w && p.h ? ` style="aspect-ratio:${p.w}/${p.h}"` : '';
  if (isBundled(p.id)) return `<img class="${cls}" src="${bundledPath(p.id, thumb)}" alt="${esc(alt)}" loading="lazy" decoding="async"${ar}>`;
  return `<img class="${cls}" data-pid="${esc(p.id)}"${thumb ? ' data-thumb="1"' : ''} alt="${esc(alt)}" decoding="async"${ar}>`;
}
export function hydrate(root = document) {
  root.querySelectorAll('img[data-pid]:not([data-done])').forEach(img => {
    img.dataset.done = '1';
    srcOf(img.dataset.pid, img.dataset.thumb === '1').then(u => { if (u) img.src = u; else img.classList.add('broken'); }).catch(() => img.classList.add('broken'));
  });
}

// ---------- compressão ----------
const MAX_SIDE = 2200, THUMB_SIDE = 520;
async function toBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { return await createImageBitmap(blob); }
}
function draw(bmp, maxSide) {
  const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * sc)), h = Math.max(1, Math.round(bmp.height * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#13171f'; g.fillRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(bmp, 0, 0, w, h);
  return c;
}
const canvasBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
async function encode(c, q) {
  let b = await canvasBlob(c, 'image/webp', q);
  if (!b || b.type !== 'image/webp') b = await canvasBlob(c, 'image/jpeg', q);
  return b;
}
async function makeThumb(bmp) { return encode(draw(bmp, THUMB_SIDE), .72); }

/** Foto nova (arquivo da galeria, imagem baixada…) → guarda no aparelho e devolve a referência. */
export async function addBlob(blob) {
  const bmp = await toBitmap(blob);
  try {
    const full = draw(bmp, MAX_SIDE);
    const rec = { id: uid('p'), blob: await encode(full, .82), thumb: await makeThumb(bmp), w: full.width, h: full.height, t: Date.now() };
    await putRec(rec); pending.add(rec.id);
    return { id: rec.id, w: rec.w, h: rec.h };
  } finally { bmp.close && bmp.close(); }
}
/** Restaura uma foto de backup sem recomprimir (só refaz a miniatura). */
async function restoreBlob(id, blob) {
  const bmp = await toBitmap(blob);
  try { await putRec({ id, blob, thumb: await makeThumb(bmp), w: bmp.width, h: bmp.height, t: Date.now() }); return { w: bmp.width, h: bmp.height }; }
  finally { bmp.close && bmp.close(); }
}
export async function removePhoto(id) { if (isBundled(id)) return; forget(id); pending.delete(id); try { await delRec(id); } catch { /* */ } }
/** Apaga do aparelho o que nenhum trade usa mais. */
export async function gc(used) {
  try { for (const id of await allKeys()) if (!used.has(id) && !pending.has(id)) { forget(id); await delRec(id); } } catch { /* */ }
}
export async function storedCount() { try { return (await allKeys()).length; } catch { return 0; } }
export async function storageInfo() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch { return null; }
}
export const persistStorage = () => { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* */ } };

// ---------- link do TradingView → foto ----------
export const TV_RE = /tradingview\.com\/x\/([A-Za-z0-9]+)/i;
export const parseTV = s => { const m = TV_RE.exec(s || ''); return m ? m[1] : (/^[A-Za-z0-9]{6,12}$/.test((s || '').trim()) ? s.trim() : null); };
const b64Blob = (b64, type) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
const native = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
async function getBlob(url) {
  if (native()) {
    const r = await CapacitorHttp.get({ url, responseType: 'blob', headers: { 'User-Agent': UA } });
    if (r.status !== 200) throw new Error('HTTP ' + r.status);
    return b64Blob(String(r.data).replace(/^data:[^,]+,/, ''), 'image/png');
  }
  const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob();
}
async function getText(url) {
  if (native()) { const r = await CapacitorHttp.get({ url, responseType: 'text', headers: { 'User-Agent': UA } }); if (r.status !== 200) throw new Error('HTTP ' + r.status); return String(r.data); }
  const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text();
}
export async function importTV(linkOrId) {
  const id = parseTV(linkOrId); if (!id) throw new Error('Esse não parece um link do TradingView');
  let blob;
  try { blob = await getBlob(`https://s3.tradingview.com/snapshots/${id[0].toLowerCase()}/${id}.png`); }
  catch {
    const html = await getText(`https://www.tradingview.com/x/${id}/`);
    const m = /property="og:image"\s+content="([^"]+)"/.exec(html);
    if (!m) throw new Error('Não achei o print desse link');
    blob = await getBlob(m[1]);
  }
  return addBlob(blob);
}

// ---------- backup ----------
const toDataURL = b => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); });
/** { id: dataURL } só das fotos que estão no aparelho (as do histórico já vêm no app). */
export async function exportPhotos(ids) {
  const out = {};
  for (const id of ids) { if (isBundled(id)) continue; const rec = await getRec(id); if (rec) out[id] = await toDataURL(rec.blob); }
  return out;
}
export async function importPhotos(map) {
  let n = 0; const dims = {};
  for (const [id, data] of Object.entries(map || {})) {
    try { dims[id] = await restoreBlob(id, await (await fetch(data)).blob()); n++; } catch { /* foto ruim: segue */ }
  }
  return { n, dims };
}
