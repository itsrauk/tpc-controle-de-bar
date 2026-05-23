import { getState, setState } from '../store.js';
import { updateReservation, getReservations } from '../db.js';
import { fmt, fmtDate, showToast, sanitize } from '../utils.js';

export function renderReservas() {
  const el = document.getElementById('panel-reservas');
  if (!el) return;

  const reservations = getReservations()
    .filter(r => r.status === 'active')
    .sort((a, b) => a.pickup_time.localeCompare(b.pickup_time));

  el.innerHTML = `
    <div class="panel-header">
      <h2>Reservas Ativas <span class="badge">${reservations.length}</span></h2>
    </div>
    ${!reservations.length
      ? '<div class="empty-state">Nenhuma reserva ativa no momento</div>'
      : reservations.map(r => renderReservaCard(r)).join('')}`;

  bindReservas();
}

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

function bindReservas() {
  document.getElementById('panel-reservas')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-reserva-action]');
    if (!btn) return;

    const id = btn.dataset.id;
    const action = btn.dataset.reservaAction;

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
