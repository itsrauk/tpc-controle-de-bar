import { getState, setState } from '../store.js';
import { updateReservation, getReservations,
         getFiados, updateFiado, saveSale } from '../db.js';
import { METODOS_PAGAMENTO } from '../config.js';
import { fmt, fmtDate, fmtTime, uuid, showToast, sanitize } from '../utils.js';

export function renderReservas() {
  const el = document.getElementById('panel-reservas');
  if (!el) return;

  const reservations = getReservations()
    .filter(r => r.status === 'active')
    .sort((a, b) => a.pickup_time.localeCompare(b.pickup_time));

  const fiados = getFiados()
    .filter(f => f.status === 'pending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  el.innerHTML = `
    <div class="panel-header">
      <h2>Reservas &amp; Fiados</h2>
    </div>

    ${fiados.length ? `
    <div class="fiados-section">
      <div class="fiados-section-title">
        👨‍👩‍👦 Fiados Pendentes
        <span class="badge badge--warning" style="margin-left:.3rem">${fiados.length}</span>
      </div>
      ${fiados.map(f => renderFiadoCard(f)).join('')}
    </div>` : ''}

    <div class="reservas-section">
      <div class="reservas-section-title">
        📋 Reservas Ativas
        <span class="badge" style="margin-left:.3rem">${reservations.length}</span>
      </div>
      ${!reservations.length
        ? '<div class="empty-state" style="padding:1.5rem 1rem">Nenhuma reserva ativa</div>'
        : reservations.map(r => renderReservaCard(r)).join('')}
    </div>`;

  bindReservas();
}

// ── Card de fiado ─────────────────────────────────────────────
function renderFiadoCard(f) {
  const items = (f.items || []).map(i =>
    `<span class="item-tag">${sanitize(i.name)} ×${i.qty}</span>`
  ).join('');

  return `
    <div class="fiado-card" data-id="${f.id}">
      <div class="fiado-card-header">
        <div>
          <div class="fiado-aluno">👤 ${sanitize(f.nome_aluno)}</div>
          <div class="fiado-pai muted">👨 Resp: ${sanitize(f.nome_pai)}</div>
        </div>
        <div class="fiado-meta">
          <div class="fiado-total">${fmt(f.total_amount)}</div>
          <div class="muted" style="font-size:.72rem">${fmtDate(f.created_at)}</div>
        </div>
      </div>
      <div class="fiado-items">${items || '<span class="muted">Sem itens</span>'}</div>
      <div class="fiado-actions">
        <button class="btn btn--success btn--sm" data-fiado-action="pay" data-id="${f.id}">💰 Receber</button>
        <button class="btn btn--danger-outline btn--sm" data-fiado-action="cancel" data-id="${f.id}">✕ Cancelar</button>
      </div>
    </div>`;
}

// ── Card de reserva ───────────────────────────────────────────
function renderReservaCard(r) {
  const items = (r.items_snapshot || []).map(i =>
    `<span class="item-tag">${sanitize(i.name)} ×${i.qty}</span>`
  ).join('');

  const payBadge = r.payment_timing === 'reserva'
    ? '<span class="badge badge--green">Pago</span>'
    : '<span class="badge badge--warning">Pagar na retirada</span>';

  return `
    <div class="reserva-card" data-id="${r.id}">
      <div class="reserva-card-header">
        <div class="reserva-info">
          <div class="reserva-cliente">${sanitize(r.customer_name)}</div>
          <div class="reserva-horario">🕐 ${sanitize(r.pickup_time)}</div>
        </div>
        <div class="reserva-meta">
          ${payBadge}
          <div class="reserva-total">${fmt(r.total_amount)}</div>
        </div>
      </div>
      <div class="reserva-items">${items || '<span class="muted">Sem itens</span>'}</div>
      <div class="reserva-created muted">Criada em ${fmtDate(r.created_at)}</div>
      <div class="reserva-actions">
        <button class="btn btn--ghost btn--sm" data-reserva-action="edit" data-id="${r.id}">✏️ Editar</button>
        <button class="btn btn--success" data-reserva-action="deliver" data-id="${r.id}">✅ Entregue</button>
        <button class="btn btn--danger-outline" data-reserva-action="cancel" data-id="${r.id}">✕ Cancelar</button>
      </div>
    </div>`;
}

// ── Modal: editar reserva ─────────────────────────────────────
function openEditModal(r) {
  showModal(`
    <h2>Editar Reserva</h2>
    <div class="form-group">
      <label>Nome do Cliente</label>
      <input type="text" id="edit-cliente" value="${sanitize(r.customer_name)}" placeholder="Nome completo">
    </div>
    <div class="form-group">
      <label>Horário de Retirada</label>
      <input type="text" id="edit-retirada" value="${sanitize(r.pickup_time)}" placeholder="Ex: Intervalo das 20h">
    </div>
    <div class="form-group">
      <label>Pagamento</label>
      <select id="edit-pay-timing">
        <option value="reserva"  ${r.payment_timing === 'reserva'  ? 'selected' : ''}>Pago na reserva</option>
        <option value="retirada" ${r.payment_timing === 'retirada' ? 'selected' : ''}>Pagar na retirada</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--primary" id="btn-salvar-reserva">Salvar</button>
    </div>
  `);

  document.getElementById('btn-salvar-reserva')?.addEventListener('click', async () => {
    const cliente   = document.getElementById('edit-cliente')?.value?.trim();
    const horario   = document.getElementById('edit-retirada')?.value?.trim();
    const payTiming = document.getElementById('edit-pay-timing')?.value;

    if (!cliente) return showToast('Informe o nome do cliente', 'error');
    if (!horario) return showToast('Informe o horário de retirada', 'error');

    await updateReservation(r.id, {
      customer_name:  cliente,
      pickup_time:    horario,
      payment_timing: payTiming
    });
    closeModal();
    showToast('Reserva atualizada!', 'success');
    renderReservas();
  });
}

// ── Modal: pagamento de fiado ─────────────────────────────────
function openFiadoPaymentModal(fiado) {
  const session = getState('session');
  if (!session) return showToast('Abra o caixa para registrar o recebimento', 'error');

  const total = fiado.total_amount;

  showModal(`
    <h2>Receber Pagamento — Fiado</h2>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:.6rem .8rem;margin-bottom:.5rem;font-size:.88rem">
      <div><strong>Aluno:</strong> ${sanitize(fiado.nome_aluno)}</div>
      <div class="muted"><strong>Responsável:</strong> ${sanitize(fiado.nome_pai)}</div>
    </div>
    <div class="payment-total">Total: <strong>${fmt(total)}</strong></div>

    <div class="payment-methods">
      ${METODOS_PAGAMENTO.map(m => `
        <button class="pay-method-btn" data-method="${m.id}">${m.label}</button>
      `).join('')}
    </div>

    <div id="fiado-pay-details"></div>

    <div class="modal-actions">
      <button class="btn btn--ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn--primary" id="btn-confirmar-fiado-pay">✅ Confirmar Recebimento</button>
    </div>
  `);

  setState('fiadoActiveMethod', null);
  setState('fiadoMultipleSplits', null);

  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      setState('fiadoActiveMethod', btn.dataset.method);
      renderFiadoPayDetails(btn.dataset.method, total);
    });
  });

  document.getElementById('btn-confirmar-fiado-pay')?.addEventListener('click', async () => {
    await confirmarFiadoPayment(fiado, total);
  });
}

function renderFiadoPayDetails(method, total) {
  const el = document.getElementById('fiado-pay-details');
  if (!el) return;

  if (method === 'dinheiro') {
    el.innerHTML = `
      <div class="form-group">
        <label>Valor Recebido</label>
        <input type="number" id="fiado-pay-recebido" min="${total}" step="0.01"
               placeholder="${total.toFixed(2)}" class="input-money" value="${total.toFixed(2)}">
      </div>
      <div class="troco-display" id="fiado-troco">Troco: ${fmt(0)}</div>`;
    document.getElementById('fiado-pay-recebido')?.addEventListener('input', e => {
      const rec = parseFloat(e.target.value) || 0;
      document.getElementById('fiado-troco').textContent = `Troco: ${fmt(Math.max(0, rec - total))}`;
    });
  } else if (method === 'multiplo') {
    el.innerHTML = renderFiadoMultiploPay(total);
    bindFiadoMultiploPay(total);
  } else {
    el.innerHTML = `<div class="pay-confirm-info">${fmt(total)} via ${method.charAt(0).toUpperCase() + method.slice(1)}</div>`;
  }
}

function renderFiadoMultiploPay(total) {
  return `
    <div class="multiplo-container">
      <div id="fiado-multiplo-splits"></div>
      <div class="multiplo-restante">Restante: <strong id="fiado-multiplo-restante">${fmt(total)}</strong></div>
      <div class="multiplo-add">
        <select id="fiado-multiplo-method">
          ${METODOS_PAGAMENTO.filter(m => m.id !== 'multiplo').map(m =>
            `<option value="${m.id}">${m.label}</option>`).join('')}
        </select>
        <input type="number" id="fiado-multiplo-valor" step="0.01" placeholder="Valor" class="input-money">
        <button class="btn btn--ghost" id="btn-fiado-add-split">+ Add</button>
      </div>
    </div>`;
}

function bindFiadoMultiploPay(total) {
  const splits = [];
  const refresh = () => {
    const pago = splits.reduce((s, sp) => s + sp.amount, 0);
    const el = document.getElementById('fiado-multiplo-restante');
    if (el) el.textContent = fmt(Math.max(0, total - pago));
    const container = document.getElementById('fiado-multiplo-splits');
    if (container) {
      container.innerHTML = splits.map((sp, i) => `
        <div class="split-item">
          <span>${sp.method}: ${fmt(sp.amount)}</span>
          <button class="btn-icon" data-fsplit-idx="${i}">✕</button>
        </div>`).join('');
      container.onclick = e => {
        const btn = e.target.closest('[data-fsplit-idx]');
        if (!btn) return;
        splits.splice(parseInt(btn.dataset.fsplitIdx), 1);
        setState('fiadoMultipleSplits', [...splits]);
        refresh();
      };
    }
    setState('fiadoMultipleSplits', [...splits]);
  };

  document.getElementById('btn-fiado-add-split')?.addEventListener('click', () => {
    const method = document.getElementById('fiado-multiplo-method')?.value;
    const amount = parseFloat(document.getElementById('fiado-multiplo-valor')?.value) || 0;
    if (amount <= 0) return showToast('Informe o valor', 'error');
    splits.push({ id: uuid(), method, amount });
    document.getElementById('fiado-multiplo-valor').value = '';
    refresh();
  });
}

async function confirmarFiadoPayment(fiado, total) {
  const session = getState('session');
  if (!session) return showToast('Abra o caixa para registrar o recebimento', 'error');

  const method = getState('fiadoActiveMethod');
  if (!method) return showToast('Selecione o método de pagamento', 'error');

  let cashReceived = null, changeGiven = null, splits = null;

  if (method === 'dinheiro') {
    cashReceived = parseFloat(document.getElementById('fiado-pay-recebido')?.value) || total;
    if (cashReceived < total) return showToast('Valor recebido insuficiente', 'error');
    changeGiven = cashReceived - total;
  }

  if (method === 'multiplo') {
    splits = getState('fiadoMultipleSplits') || [];
    const pago = splits.reduce((s, sp) => s + sp.amount, 0);
    if (Math.abs(pago - total) > 0.01) return showToast('O total dos métodos não fecha', 'error');
  }

  const saleId = uuid();
  const saleItems = (fiado.items || []).map(item => ({
    id: uuid(), sale_id: saleId,
    product_id: item.product_id || item.id,
    product_name: item.name,
    product_price: item.price,
    quantity: item.qty
  }));

  const sale = {
    id: saleId,
    session_id: session.id,
    payment_method: method,
    total_amount: total,
    cash_received: cashReceived,
    change_given: changeGiven,
    is_voided: false,
    is_reservation: false,
    is_fiado: true,
    fiado_id: fiado.id,
    created_at: new Date().toISOString(),
    items: saleItems,
    splits: method === 'multiplo' ? splits.map(sp => ({ ...sp, sale_id: saleId })) : null
  };

  await saveSale(sale);
  await updateFiado(fiado.id, { status: 'paid', paid_sale_id: saleId });

  // Atualiza state de vendas
  const sales = [...(getState('sales') || []), sale];
  setState('sales', sales);

  closeModal();
  showToast(
    changeGiven != null
      ? `Recebido! Troco: ${fmt(changeGiven)}`
      : `Fiado de ${sanitize(fiado.nome_aluno)} quitado!`,
    'success'
  );
  renderReservas();
}

// ── Bind eventos ──────────────────────────────────────────────
function bindReservas() {
  document.getElementById('panel-reservas')?.addEventListener('click', async e => {

    // Ações de fiado
    const fiadoBtn = e.target.closest('[data-fiado-action]');
    if (fiadoBtn) {
      const id     = fiadoBtn.dataset.id;
      const action = fiadoBtn.dataset.fiadoAction;
      const fiado  = getFiados().find(f => f.id === id);
      if (!fiado) return;

      if (action === 'pay') {
        openFiadoPaymentModal(fiado);
      } else if (action === 'cancel') {
        if (!confirm(`Cancelar o fiado de "${fiado.nome_aluno}"? Os itens NÃO serão devolvidos ao estoque automaticamente.`)) return;
        await updateFiado(id, { status: 'cancelled' });
        showToast('Fiado cancelado', 'info');
        renderReservas();
      }
      return;
    }

    // Ações de reserva
    const reservaBtn = e.target.closest('[data-reserva-action]');
    if (!reservaBtn) return;

    const id     = reservaBtn.dataset.id;
    const action = reservaBtn.dataset.reservaAction;

    if (action === 'edit') {
      const reservation = getReservations().find(r => r.id === id);
      if (reservation) openEditModal(reservation);
      return;
    } else if (action === 'deliver') {
      await updateReservation(id, { status: 'delivered' });
      showToast('Reserva marcada como entregue!', 'success');
    } else if (action === 'cancel') {
      if (!confirm('Cancelar a reserva? Isso não estorna o estoque automaticamente.')) return;
      await updateReservation(id, { status: 'cancelled' });
      showToast('Reserva cancelada', 'info');
    }

    renderReservas();
  });
}
