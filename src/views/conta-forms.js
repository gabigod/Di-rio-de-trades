// Formulários das contas: conta, saque, gasto, ajuste de saldo e status.
import * as AC from '../accounts.js';
import { $, esc, num, money, pct, todayISO, SERIES, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { toast, openSheet, openPage, confirmSheet } from '../ui.js';

export const parse = s => { const v = parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return isNaN(v) ? null : v; };
// aceita número ou texto já com vírgula ("0,5")
const toN = v => (typeof v === 'number' ? (isNaN(v) ? null : v) : parse(v));
const show = v => { const n = toN(v); return n === null || n === 0 ? '' : String(n).replace('.', ','); };
const showZero = v => { const n = toN(v); return n === null ? '' : String(n).replace('.', ','); };

/** Campo numérico com unidade ao lado. */
export function numField(id, label, value, { unit = '', ph = '', hint = '', zero = false } = {}) {
  return `<label class="fld"><span>${label}</span><div class="inp-wrap"><input class="inp num" id="${id}" inputmode="decimal" autocomplete="off" value="${zero ? showZero(value) : show(value)}" placeholder="${ph}">${unit ? `<em>${unit}</em>` : ''}</div>${hint ? `<small class="f-hint">${hint}</small>` : ''}</label>`;
}
const seg = (id, opts, cur) => `<div class="seg" id="${id}">${opts.map(([k, t]) => `<button type="button" class="c ${cur === k ? 'on' : ''}" data-v="${k}">${esc(t)}</button>`).join('')}</div>`;
const pickSeg = root => root.querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.addEventListener('click', () => g.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)))));
const segVal = (root, id) => { const b = root.querySelector(`#${id} .on`); return b ? b.dataset.v : ''; };
const setSeg = (root, id, v) => root.querySelectorAll(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === v));
const accOptions = (cur, none) => `${none ? `<option value="">${none}</option>` : ''}${AC.accounts.all.map(a => `<option value="${a.id}" ${a.id === cur ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}`;

// ================= CONTA =================
export function openAccountForm(id, prefill, onDone) {
  const old = id ? AC.accounts.get(id) : null;
  const base = AC.TEMPLATES[0].d;
  const a = old || { ...base, status: 'ativa', start: todayISO(), color: SERIES[AC.accounts.all.length % SERIES.length], riskPct: 0.5, consistency: 0, firstPayoutDays: 0, payoutEvery: 0, minPayout: 0, ...prefill };
  const firms = [...new Set([...AC.FIRMS, ...AC.accounts.all.map(x => x.firm).filter(Boolean)])];
  const pg = openPage({ title: old ? 'Editar conta' : 'Nova conta', cls: 'formpage' });
  pg.body.innerHTML = `<div class="form-wrap">
    <div class="f-sec"><div class="f-title">Conta</div>
      <label class="fld"><span>Nome</span><input class="inp" id="a-name" value="${esc(a.name || '')}" placeholder="Ex.: Blue Guardian 100k" autocomplete="off"></label>
      <label class="fld"><span>Firma</span><input class="inp" id="a-firm" list="a-firms" value="${esc(a.firm || '')}" placeholder="Nome da prop firm" autocomplete="off"><datalist id="a-firms">${firms.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
      <div class="fld"><span>Fase</span>${seg('a-phase', Object.entries(AC.PHASES), a.phase)}</div>
      <div class="row2">${numField('a-size', 'Tamanho da conta', a.size, { unit: 'US$', ph: '100000' })}
        <label class="fld"><span>Início</span><input class="inp" id="a-start" type="date" value="${esc(a.start || todayISO())}"></label></div>
      <div class="fld"><span>Situação</span>${seg('a-status', Object.entries(AC.STATUS), a.status)}</div>
      <div class="fld"><span>Cor nos gráficos</span><div class="swatches" id="a-color">${SERIES.map(c => `<button type="button" class="${a.color === c ? 'on' : ''}" data-v="${c}" style="--c:${c}" aria-label="Cor"></button>`).join('')}</div></div>
      ${numField('a-risk', 'Risco por trade', a.riskPct, { unit: '%', ph: '0,5', hint: 'Parte do saldo inicial que cada trade arrisca. Converte o R em dólares nesta conta, e dá para mudar em cada trade.' })}
    </div>
    <details class="acc-group" open><summary><b>Regras da fase</b><small>Meta, perda máxima, perda diária</small></summary><div class="acc-body">
      <div class="fld"><span>Preencher com um modelo</span><div class="qchips" id="a-tpl">${AC.TEMPLATES.map(t => `<button type="button" data-k="${t.k}">${esc(t.t)}</button>`).join('')}</div><small class="f-hint">Valores comuns do mercado. Confira sempre no site da sua firma.</small></div>
      <div class="row2">${numField('a-target', 'Meta de lucro', a.target, { unit: '%', ph: '8' })}${numField('a-mind', 'Dias mínimos', a.minDays, { unit: 'dias', ph: '4' })}</div>
      <div class="row2">${numField('a-daily', 'Perda diária máx.', a.maxDaily, { unit: '%', ph: '5' })}${numField('a-dd', 'Perda máxima', a.maxDD, { unit: '%', ph: '10' })}</div>
      <label class="fld"><span>Tipo da perda máxima</span><select class="inp" id="a-ddt">${Object.entries(AC.DD_TYPES).map(([k, t]) => `<option value="${k}" ${a.ddType === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <small class="f-hint">Estático: o limite fica fixo no saldo inicial. Trailing: o limite sobe junto com o seu maior saldo.</small></label>
      ${numField('a-cons', 'Regra de consistência', a.consistency, { unit: '%', ph: '30', hint: 'Nenhum dia pode passar dessa parte do lucro total. Deixe vazio se a firma não tem.' })}
    </div></details>
    <details class="acc-group"><summary><b>Saques</b><small>Divisão de lucro e prazos</small></summary><div class="acc-body">
      <div class="row2">${numField('a-split', 'Você recebe', a.split, { unit: '%', ph: '80' })}${numField('a-minpay', 'Saque mínimo', a.minPayout, { unit: 'US$', ph: '100' })}</div>
      <div class="row2">${numField('a-fpay', 'Primeiro saque após', a.firstPayoutDays, { unit: 'dias', ph: '14' })}${numField('a-every', 'Saques a cada', a.payoutEvery, { unit: 'dias', ph: '14' })}</div>
    </div></details>
  </div><div class="sticky-save"><button class="btn" id="a-save">${old ? 'Salvar alterações' : 'Criar conta'}</button></div>`;
  const root = pg.body; pickSeg(root);
  root.querySelectorAll('#a-color button').forEach(b => b.onclick = () => root.querySelectorAll('#a-color button').forEach(x => x.classList.toggle('on', x === b)));
  root.querySelectorAll('#a-tpl button').forEach(b => b.onclick = () => {
    const d = AC.TEMPLATES.find(t => t.k === b.dataset.k).d, set = (id, v) => { root.querySelector(id).value = show(v); };
    setSeg(root, 'a-phase', d.phase); set('#a-target', d.target); set('#a-daily', d.maxDaily); set('#a-dd', d.maxDD); set('#a-mind', d.minDays); set('#a-split', d.split);
    root.querySelector('#a-ddt').value = d.ddType;
    root.querySelectorAll('#a-tpl button').forEach(x => x.classList.toggle('on', x === b));
  });
  root.querySelector('#a-save').onclick = () => {
    const v = id => root.querySelector(id).value.trim(), n = id => parse(root.querySelector(id).value);
    const name = v('#a-name'), size = n('#a-size');
    if (!name) { toast('Falta o nome da conta'); root.querySelector('#a-name').focus(); return; }
    if (!(size > 0)) { toast('Informe o tamanho da conta'); root.querySelector('#a-size').focus(); return; }
    const patch = {
      name, firm: v('#a-firm'), phase: segVal(root, 'a-phase') || 'fase1', status: segVal(root, 'a-status') || 'ativa', size, start: v('#a-start') || todayISO(),
      color: (root.querySelector('#a-color .on') || {}).dataset?.v || SERIES[0], riskPct: n('#a-risk') ?? 0, target: n('#a-target') ?? 0, minDays: n('#a-mind') ?? 0,
      maxDaily: n('#a-daily') ?? 0, maxDD: n('#a-dd') ?? 0, ddType: root.querySelector('#a-ddt').value, consistency: n('#a-cons') ?? 0,
      split: n('#a-split') ?? 100, minPayout: n('#a-minpay') ?? 0, firstPayoutDays: n('#a-fpay') ?? 0, payoutEvery: n('#a-every') ?? 0,
    };
    const rec = old ? AC.accounts.update(old.id, patch) : AC.accounts.add(patch);
    pg.close(); toast(old ? 'Conta atualizada ✓' : 'Conta criada ✓');
    if (onDone) onDone(rec, !old);
  };
}

// ================= SAQUE =================
export function openPayoutForm(accId, id) {
  const old = id ? AC.payouts.get(id) : null, accs = AC.accounts.all;
  if (!accs.length) { toast('Crie uma conta primeiro'); return; }
  const cur = old ? old.acc : (accId || (accs.find(a => a.status === 'ativa' && (a.phase === 'funded' || a.phase === 'instant')) || accs[0]).id);
  const st = AC.accountState(AC.accounts.get(cur));
  const body = openSheet(`<h2>${old ? 'Editar saque' : 'Registrar saque'}</h2>
    <label class="fld"><span>Conta</span><select class="inp" id="y-acc">${accOptions(cur)}</select></label>
    <div class="row2"><label class="fld"><span>Data</span><input class="inp" id="y-date" type="date" value="${old ? old.date : todayISO()}"></label>
      ${numField('y-amt', 'Valor sacado', old ? old.amount : (st.availProfit > 0 ? Math.round(st.availProfit * 100) / 100 : ''), { unit: 'US$', ph: '0' })}</div>
    ${numField('y-rec', 'Você recebeu', old ? old.received : '', { unit: 'US$', ph: '', hint: '<span id="y-hint"></span>' })}
    <div class="fld"><span>Situação</span>${seg('y-status', [['pago', 'Pago'], ['pendente', 'Pendente']], old ? (old.status || 'pago') : 'pago')}</div>
    <label class="fld"><span>Nota</span><input class="inp" id="y-note" value="${esc(old ? old.note || '' : '')}" placeholder="Opcional" autocomplete="off"></label>
    <div class="btns-r">${old ? '<button class="btn danger" id="y-del">Apagar</button>' : ''}<button class="btn" id="y-save">Salvar</button></div>`);
  pickSeg(body);
  const hint = () => {
    const a = AC.accounts.get(body.querySelector('#y-acc').value), amt = parse(body.querySelector('#y-amt').value);
    const sp = a && +a.split ? +a.split : 100;
    body.querySelector('#y-hint').textContent = amt > 0 ? `Vazio = ${money(amt * sp / 100)} (${num(sp, 0)}% do valor, pela divisão da conta)` : 'Vazio = calcula pela divisão de lucro da conta';
  };
  ['#y-acc', '#y-amt'].forEach(s => body.querySelector(s).addEventListener('input', hint)); hint();
  body.querySelector('#y-save').onclick = () => {
    const amt = parse(body.querySelector('#y-amt').value);
    if (!(amt > 0)) { toast('Informe o valor sacado'); return; }
    const rec = parse(body.querySelector('#y-rec').value);
    const patch = { acc: body.querySelector('#y-acc').value, date: body.querySelector('#y-date').value || todayISO(), amount: amt, received: rec === null ? undefined : rec, status: segVal(body, 'y-status') || 'pago', note: body.querySelector('#y-note').value.trim() };
    if (old) AC.payouts.update(old.id, patch); else AC.payouts.add(patch);
    body.close(); toast(old ? 'Saque atualizado ✓' : 'Saque registrado ✓');
  };
  const del = body.querySelector('#y-del');
  if (del) del.onclick = async () => { if (await confirmSheet({ title: 'Apagar este saque?', ok: 'Apagar', danger: true })) { AC.payouts.remove(old.id); body.close(); toast('Saque apagado'); } };
}

// ================= GASTO =================
export function openExpenseForm(accId, id) {
  const old = id ? AC.expenses.get(id) : null;
  const kind = old ? old.kind : 'Avaliação';
  const body = openSheet(`<h2>${old ? 'Editar gasto' : 'Registrar gasto'}</h2>
    <label class="fld"><span>Conta</span><select class="inp" id="e-acc">${accOptions(old ? old.acc : accId, 'Sem conta (gasto geral)')}</select></label>
    <div class="row2"><label class="fld"><span>Data</span><input class="inp" id="e-date" type="date" value="${old ? old.date : todayISO()}"></label>
      ${numField('e-amt', 'Valor', old ? old.amount : '', { unit: 'US$', ph: '0' })}</div>
    <div class="fld"><span>Tipo</span><div class="qchips pick" id="e-kind">${AC.EXPENSE_KINDS.map(k => `<button type="button" data-v="${esc(k)}" class="${k === kind ? 'on' : ''}">${esc(k)}</button>`).join('')}</div></div>
    <label class="fld"><span>Nota</span><input class="inp" id="e-note" value="${esc(old ? old.note || '' : '')}" placeholder="Opcional" autocomplete="off"></label>
    <div class="btns-r">${old ? '<button class="btn danger" id="e-del">Apagar</button>' : ''}<button class="btn" id="e-save">Salvar</button></div>`);
  body.querySelectorAll('#e-kind button').forEach(b => b.onclick = () => body.querySelectorAll('#e-kind button').forEach(x => x.classList.toggle('on', x === b)));
  body.querySelector('#e-save').onclick = () => {
    const amt = parse(body.querySelector('#e-amt').value);
    if (!(amt > 0)) { toast('Informe o valor'); return; }
    const patch = { acc: body.querySelector('#e-acc').value, date: body.querySelector('#e-date').value || todayISO(), amount: amt, kind: (body.querySelector('#e-kind .on') || {}).dataset?.v || 'Outro', note: body.querySelector('#e-note').value.trim() };
    if (old) AC.expenses.update(old.id, patch); else AC.expenses.add(patch);
    body.close(); toast(old ? 'Gasto atualizado ✓' : 'Gasto registrado ✓');
  };
  const del = body.querySelector('#e-del');
  if (del) del.onclick = async () => { if (await confirmSheet({ title: 'Apagar este gasto?', ok: 'Apagar', danger: true })) { AC.expenses.remove(old.id); body.close(); toast('Gasto apagado'); } };
}

// ================= AJUSTE DE SALDO =================
export function openAdjustForm(accId) {
  const acc = AC.accounts.get(accId); if (!acc) return;
  const st = AC.accountState(acc);
  const body = openSheet(`<h2>Ajustar saldo</h2>
    <p class="hint" style="margin:-6px 0 14px">O app estima o saldo pelos trades marcados nesta conta. Se o saldo real for diferente (trade fora do diário, comissões), informe e ele corrige a diferença.</p>
    <div class="kv2 solo"><div><span>Saldo estimado</span><b class="num">${money(st.balance)}</b></div></div>
    ${numField('j-real', 'Saldo real agora', Math.round(st.balance * 100) / 100, { unit: 'US$', ph: '', zero: true })}
    <div class="adj-diff" id="j-diff"></div>
    <label class="fld"><span>Motivo</span><input class="inp" id="j-note" placeholder="Ex.: comissões, trade fora do diário" autocomplete="off"></label>
    <div class="btns-r"><button class="btn" id="j-save">Salvar ajuste</button></div>`);
  const diff = () => { const r = parse(body.querySelector('#j-real').value); const d = r === null ? 0 : r - st.balance; body.querySelector('#j-diff').innerHTML = r === null ? '' : `Diferença <b class="num ${d > 0 ? 'pos' : d < 0 ? 'neg' : 'mut'}">${money(d, { sign: true })}</b>`; return d; };
  body.querySelector('#j-real').addEventListener('input', diff); diff();
  body.querySelector('#j-save').onclick = () => {
    const d = diff(); if (!d || Math.abs(d) < 0.005) { toast('Sem diferença para ajustar'); return; }
    AC.adjusts.add({ acc: accId, date: todayISO(), amount: Math.round(d * 100) / 100, note: body.querySelector('#j-note').value.trim() });
    body.close(); toast('Saldo ajustado ✓');
  };
}

// ================= SITUAÇÃO =================
const STATUS_HELP = { ativa: 'Em andamento, entra nos totais', aprovada: 'Passou a fase', reprovada: 'Violou uma regra', encerrada: 'Fechada sem passar nem violar' };
export function openStatusSheet(accId, onNext) {
  const acc = AC.accounts.get(accId); if (!acc) return;
  const body = openSheet(`<h2>Situação da conta</h2><div class="opts">${Object.entries(AC.STATUS).map(([k, t]) => `<button class="opt ${acc.status === k ? 'on' : ''}" data-v="${k}"><b>${t}</b><small>${STATUS_HELP[k]}</small><i>${icon('check', 18)}</i></button>`).join('')}</div>`);
  body.querySelectorAll('.opt').forEach(b => b.onclick = async () => {
    const v = b.dataset.v; AC.accounts.update(accId, { status: v }); body.close(); toast('Situação atualizada ✓');
    if (v === 'aprovada' && (acc.phase === 'fase1' || acc.phase === 'fase2') && onNext) onNext();
  });
}

/** Dados para a próxima fase de uma conta aprovada. */
export function nextPhaseOf(acc) {
  const next = acc.phase === 'fase1' ? (AC.TEMPLATES.find(t => t.k === 'f2b') ? 'fase2' : 'funded') : 'funded';
  const tpl = next === 'fase2' ? AC.TEMPLATES.find(t => t.k === 'f2b').d : AC.TEMPLATES.find(t => t.k === 'fd').d;
  const label = next === 'fase2' ? 'Fase 2' : 'Funded';
  return { phase: next, name: `${acc.name.replace(/\s*[·-]\s*(Fase [12]|Funded)$/i, '')} · ${label}`, firm: acc.firm, size: acc.size, color: acc.color, riskPct: acc.riskPct, status: 'ativa', start: todayISO(),
    target: tpl.target, minDays: tpl.minDays, maxDaily: acc.maxDaily || tpl.maxDaily, maxDD: acc.maxDD || tpl.maxDD, ddType: acc.ddType || tpl.ddType, split: acc.split || tpl.split, consistency: acc.consistency || 0,
    firstPayoutDays: acc.firstPayoutDays || 0, payoutEvery: acc.payoutEvery || 0, minPayout: acc.minPayout || 0 };
}
