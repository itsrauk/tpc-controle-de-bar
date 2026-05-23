import { getState, setState } from '../store.js';
import { closeSession, saveSangria, getSangrias, getSales, clearCartLocal } from '../db.js';
import { fmt, fmtDate, calcExpectedCash, uuid, showToast } from '../utils.js';
import { FUNDO_MINIMO, LOW_STOCK_THRESHOLD } from '../config.js';

export function renderCaixa() {
  const session = getState('session');
  const el = document.getElementById('panel-caixa');
  if (!el) return;
  if (!session) {
    el.innerHTML = '<div class="empty-state muted">Abrindo caixa…</div>';
    return;
  }
  el.innerHTML = renderAberto(session);
  bindCaixa();
}

function renderAberto(session) {
  const sales = getSales().filter(s => !s.is_voided);
  const sangrias = getSangrias();
  const totalVendas = sales.reduce((s, v) => s + v.total_amount, 0);
  const totalSangrias = sangrias.reduce((s, sg) => s + sg.amount, 0);
  const expected = calcExpectedCash(session, sales, sangrias);

  const byMethod = {};
  for (const sale of sales) {
    if (sale.payment_method === 'multiplo') {
      (sale.splits || []).forEach(sp => { byMethod[sp.method] = (byMethod[sp.method] || 0) + sp.amount; });
    } else {
      byMethod[sale.payment_method] = (byMethod[sale.payment_method] || 0) + sale.total_amount;
    }
  }

  const methodRows = Object.entries(byMethod).map(([m, v]) =>
    `<div class="balance-row"><span>${labelMetodo(m)}</span><span class="green">${fmt(v)}</span></div>`
  ).join('') || '<div class="balance-row muted"><span>Nenhuma venda ainda</span></div>';

  return `
    <div class="caixa-info">
      <div class="card session-header">
        <div>
          <div class="label">Turno aberto em</div>
          <div class="value">${fmtDate(session.opened_at)}</div>
        </div>
        <div class="badge badge--green">Aberto</div>
      </div>

      <div class="card">
        <h3>Balanço do Turno</h3>
        <div class="balance-row"><span>Fundo Inicial</span><span>${fmt(session.opening_amount)}</span></div>
        ${methodRows}
        <div class="balance-row"><span>Sangrias</span><span class="red">− ${fmt(totalSangrias)}</span></div>
        <div class="balance-row balance-row--total"><span>Esperado em Caixa</span><span>${fmt(expected)}</span></div>
        <div class="balance-row"><span>Total Vendas</span><span class="green">${fmt(totalVendas)}</span></div>
        <div class="balance-row"><span>Nº de Vendas</span><span>${sales.length}</span></div>
      </div>

      <div class="caixa-actions">
        <button class="btn btn--warning" id="btn-sangria">💸 Sangria</button>
        <button class="btn btn--danger"  id="btn-fechar">🔒 Fechar Caixa</button>
      </div>

      ${sangrias.length ? `
      <div class="card">
        <h3>Sangrias do Turno</h3>
        ${sangrias.map(sg => `
          <div class="sangria-item">
            <span>${sg.justification}</span>
            <span class="red">${fmt(sg.amount)}</span>
          </div>`).join('')}
      </div>` : ''}

      ${renderLowStock()}
    </div>`;
}

function labelMetodo(m) {
  return { dinheiro:'Dinheiro', pix:'Pix', debito:'Débito', credito:'Crédito', vale:'Vale' }[m] || m;
}

function renderLowStock() {
  const products = getState('products') || [];
  const lowItems = products.filter(p => p.active && p.category !== 'vale' && p.stock <= LOW_STOCK_THRESHOLD);
  if (!lowItems.length) return '';
  return `
    <div class="card">
      <h3>⚠️ Estoque Baixo</h3>
      ${lowItems.map(p => `
        <div class="low-stock-item">
          <span class="low-stock-name">${p.name}</span>
          <span class="low-stock-qty ${p.stock === 0 ? 'stock--zero' : 'stock--low'}">
            ${p.stock === 0 ? 'Esgotado' : `${p.stock} restante${p.stock > 1 ? 's' : ''}`}
          </span>
        </div>`).join('')}
    </div>`;
}

function bindCaixa() {
  document.getElementById('btn-sangria')?.addEventListener('click', () => openModalSangria());
  document.getElementById('btn-fechar')?.addEventListener('click', () => openModalFechamento());
}

// ── Modal Sangria ───────────────────────────────────────────────
function openModalSangria() {
  const session = getState('session');
  const sangrias = getSangrias();
  const sales = getSales().filter(s => !s.is_voided);
  const cashDisp = calcExpectedCash(session, sales, sangrias);

  showModal(`
    <h2>Sangria de Caixa</h2>
    <p class="muted">Disponível em dinheiro: <strong>${fmt(cashDisp)}</strong></p>
    <div class="form-group">
      <label>Valor da Retirada</label>
      <input type="number" id="sg-valor" min="0.01" step="0.01" placeholder="0,00" class="input-money">
    </div>
    <div class="form-group">
      <label>Justificativa</label>
      <textarea id="sg-just" rows="3" placeholder="Motivo da retirada (mín. 5 caracteres)"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--warning" id="btn-confirmar-sangria">Confirmar Sangria</button>
    </div>
  `);

  document.getElementById('btn-confirmar-sangria')?.addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('sg-valor')?.value) || 0;
    const just = document.getElementById('sg-just')?.value?.trim() || '';

    if (val <= 0) return showToast('Informe o valor', 'error');
    if (val > cashDisp) return showToast('Valor maior que o dinheiro disponível', 'error');
    if (just.length < 5) return showToast('Justificativa muito curta (mín. 5 caracteres)', 'error');

    const sg = { id: uuid(), session_id: session.id, amount: val, justification: just, created_at: new Date().toISOString() };
    await saveSangria(sg);
    const sangrias = [...getSangrias()];
    setState('sangrias', sangrias);
    closeModal();
    showToast(`Sangria de ${fmt(val)} registrada`, 'success');
    renderCaixa();
  });
}

// ── Modal Fechamento ────────────────────────────────────────────
function openModalFechamento() {
  const session = getState('session');
  const sales = getSales().filter(s => !s.is_voided);
  const sangrias = getSangrias();
  const expected = calcExpectedCash(session, sales, sangrias);

  showModal(`
    <h2>Fechar Caixa</h2>
    <p class="muted">Valor esperado em caixa: <strong>${fmt(expected)}</strong></p>
    <div class="form-group">
      <label>Valor físico na gaveta (contagem manual)</label>
      <input type="number" id="fc-fisico" min="0" step="0.01" placeholder="0,00" class="input-money">
    </div>
    <div class="form-group hidden" id="grp-divergencia">
      <label id="lbl-divergencia">⚠️ Há uma divergência. Justifique:</label>
      <textarea id="fc-just-div" rows="2" placeholder="Motivo da divergência..."></textarea>
    </div>
    <div class="form-group hidden" id="grp-fundo-baixo">
      <label>⚠️ Fundo abaixo de R$ 200 para o próximo turno. Justifique:</label>
      <textarea id="fc-just-fundo" rows="2" placeholder="Motivo do fundo baixo..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--danger" id="btn-confirmar-fechamento">Fechar Turno</button>
    </div>
  `);

  document.getElementById('fc-fisico')?.addEventListener('input', () => {
    const fisico = parseFloat(document.getElementById('fc-fisico')?.value) || 0;
    const diff = fisico - expected;
    const hasDiff = Math.abs(diff) > 0.01;
    const lowFund = fisico < FUNDO_MINIMO;

    const grpDiv = document.getElementById('grp-divergencia');
    const grpFundo = document.getElementById('grp-fundo-baixo');
    const lbl = document.getElementById('lbl-divergencia');

    grpDiv?.classList.toggle('hidden', !hasDiff);
    grpFundo?.classList.toggle('hidden', !lowFund);

    if (lbl && hasDiff) {
      const diffFmt = fmt(Math.abs(diff));
      lbl.textContent = diff < 0
        ? `⚠️ Falta ${diffFmt} no caixa. Justifique:`
        : `ℹ️ Sobra de ${diffFmt} encontrada. Justifique:`;
    }
  });

  document.getElementById('btn-confirmar-fechamento')?.addEventListener('click', async () => {
    const fisico = parseFloat(document.getElementById('fc-fisico')?.value) || 0;
    const diff = fisico - expected;
    const justDiv = document.getElementById('fc-just-div')?.value?.trim() || '';
    const justFundo = document.getElementById('fc-just-fundo')?.value?.trim() || '';

    if (fisico <= 0 && fisico !== 0) return showToast('Informe o valor físico', 'error');
    if (Math.abs(diff) > 0.01 && justDiv.length < 5) return showToast('Justifique a divergência', 'error');
    if (fisico < FUNDO_MINIMO && justFundo.length < 5) return showToast('Justifique o fundo baixo', 'error');

    await closeSession(session, {
      closing_physical_amount: fisico,
      closing_justification: justDiv || null,
      low_fund_justification: justFundo || null
    });

    setState('session', null);
    setState('sales', []);
    setState('sangrias', []);
    setState('cart', []);
    setState('isVale', false);
    setState('employeeName', '');
    setState('isReserva', false);
    setState('isFiado', false);
    setState('nomeAluno', '');
    setState('nomePai', '');
    setState('discount', 0);
    clearCartLocal();

    closeModal();
    showToast('Caixa fechado com sucesso!', 'success');
    document.getElementById('blocker')?.classList.remove('hidden');
    document.getElementById('blocker-msg')?.classList.remove('hidden');
    renderCaixa();
    document.querySelector('[data-tab="caixa"]')?.click();
  });
}

// ── Modal helpers (globais) ────────────────────────────────────
window.showModal = function(html) {
  const m = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  if (!m || !body) return;
  body.innerHTML = html;
  m.classList.remove('hidden');
};

window.closeModal = function() {
  document.getElementById('modal')?.classList.add('hidden');
};
